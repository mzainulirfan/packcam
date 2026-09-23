const DEFAULT_API_BASE_URL = 'https://api-pakti.zakado.id'

const apiBaseUrlInput = document.querySelector('#apiBaseUrl')
const apiKeyInput = document.querySelector('#apiKey')
const saveButton = document.querySelector('#saveButton')
const syncButton = document.querySelector('#syncButton')
const prepareShippingChatsButton = document.querySelector('#prepareShippingChatsButton')
const autoPrepareButton = document.querySelector('#autoPrepareButton')
const loadChatJobsButton = document.querySelector('#loadChatJobsButton')
const chatJobSelect = document.querySelector('#chatJobSelect')
const prepareChatButton = document.querySelector('#prepareChatButton')
const reloadTabButton = document.querySelector('#reloadTabButton')
const retryFailedButton = document.querySelector('#retryFailedButton')
const openOrderPageButton = document.querySelector('#openOrderPageButton')
const openShippingPageButton = document.querySelector('#openShippingPageButton')
const openWebchatButton = document.querySelector('#openWebchatButton')
const toggleKeyButton = document.querySelector('#toggleKeyButton')
const pageModeText = document.querySelector('#pageModeText')
const pageModeBadge = document.querySelector('#pageModeBadge')
const orderPanel = document.querySelector('#orderPanel')
const webchatPanel = document.querySelector('#webchatPanel')
const statusText = document.querySelector('#statusText')
const configPanel = document.querySelector('#configPanel')
const configHint = document.querySelector('#configHint')
let pendingChatJobs = []
const SHOPEE_ORDER_SYNC_URL = 'https://seller.shopee.co.id/portal/sale/order?type=toship&source=processed'
const SHOPEE_SHIPPING_CHAT_URL = 'https://seller.shopee.co.id/portal/sale/order?type=shipping'

function setStatus(value) {
  statusText.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, '')
}

function isShopeeShippingOrderUrl(value) {
  return isShopeeOrderUrl(value, 'shipping')
}

function isShopeeProcessedToShipOrderUrl(value) {
  try {
    const url = new URL(value || '')
    return (
      isShopeeSellerHostname(url.hostname) &&
      url.pathname === '/portal/sale/order' &&
      url.searchParams.get('type') === 'toship' &&
      url.searchParams.get('source') === 'processed'
    )
  } catch {
    return false
  }
}

function isShopeeOrderUrl(value, expectedType = null) {
  try {
    const url = new URL(value || '')
    if (!isShopeeSellerHostname(url.hostname) || url.pathname !== '/portal/sale/order') return false
    return expectedType ? url.searchParams.get('type') === expectedType : true
  } catch {
    return false
  }
}

function isShopeeSellerHostname(hostname) {
  return hostname === 'seller.shopee.co.id' || hostname === 'seller.shopee.com'
}

function isShopeeWebchatUrl(value) {
  try {
    const url = new URL(value || '')
    return isShopeeSellerHostname(url.hostname) && url.pathname.startsWith('/new-webchat/')
  } catch {
    return false
  }
}

function getShopeeWebchatUrl(value) {
  try {
    const url = new URL(value || '')
    if (isShopeeSellerHostname(url.hostname)) {
      return `${url.protocol}//${url.host}/new-webchat/conversations`
    }
  } catch {
    // ignore
  }

  return 'https://seller.shopee.co.id/new-webchat/conversations'
}

function getPageMode(value) {
  if (isShopeeWebchatUrl(value)) return { key: 'webchat', label: 'Webchat — siap kirim', tone: 'ok' }
  if (isShopeeShippingOrderUrl(value)) return { key: 'shipping', label: 'Pesanan Dikirim', tone: 'ok' }
  if (isShopeeProcessedToShipOrderUrl(value)) return { key: 'toship', label: 'Siap Dikirim', tone: 'ok' }
  if (isShopeeOrderUrl(value)) return { key: 'order-other', label: 'Halaman order lain', tone: 'warn' }
  try {
    const url = new URL(value || '')
    if (isShopeeSellerHostname(url.hostname)) return { key: 'seller-other', label: 'Halaman seller lain', tone: 'warn' }
  } catch {
    // ignore
  }
  return { key: 'unsupported', label: 'Bukan halaman Shopee', tone: 'bad' }
}

function applyPageMode(mode) {
  const onOrderPage = mode.key === 'toship' || mode.key === 'shipping' || mode.key === 'order-other'
  const onWebchat = mode.key === 'webchat'
  syncButton.disabled = mode.key !== 'toship'
  prepareShippingChatsButton.disabled = mode.key !== 'shipping'
  for (const button of [autoPrepareButton, loadChatJobsButton, prepareChatButton]) {
    button.disabled = !onWebchat
  }
  orderPanel?.classList.toggle('is-inactive', !onOrderPage)
  webchatPanel?.classList.toggle('is-inactive', !onWebchat)
  pageModeText.textContent = mode.label
  if (pageModeBadge) {
    pageModeBadge.textContent = mode.label
    pageModeBadge.dataset.tone = mode.tone
  }
}

function isMissingContentScriptError(error) {
  return error instanceof Error && error.message.toLowerCase().includes('receiving end does not exist')
}

function isBuyerNotFoundMessage(value) {
  return /percakapan shopee untuk .+ tidak ditemukan/i.test(String(value || ''))
}

function formatChatJobLabel(job) {
  return `${job.buyerUsername} | ${job.orderNumber || '-'} | ${job.resiNumber} | ${job.status}`
}

function renderChatJobs(jobs) {
  pendingChatJobs = jobs
  chatJobSelect.replaceChildren()

  if (jobs.length === 0) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = 'Tidak ada pending job'
    chatJobSelect.append(option)
    chatJobSelect.disabled = true
    return
  }

  for (const job of jobs) {
    const option = document.createElement('option')
    option.value = job.id
    option.textContent = formatChatJobLabel(job)
    chatJobSelect.append(option)
  }

  chatJobSelect.disabled = false
}

function getSelectedChatJob() {
  const selectedId = chatJobSelect.value
  return pendingChatJobs.find((job) => job.id === selectedId) || pendingChatJobs[0] || null
}

async function readConfig() {
  const stored = await chrome.storage.sync.get({
    apiBaseUrl: DEFAULT_API_BASE_URL,
    apiKey: '',
  })

  return {
    apiBaseUrl: normalizeBaseUrl(stored.apiBaseUrl),
    apiKey: stored.apiKey || '',
  }
}

async function saveConfig() {
  const config = {
    apiBaseUrl: normalizeBaseUrl(apiBaseUrlInput.value),
    apiKey: apiKeyInput.value.trim(),
  }

  await chrome.storage.sync.set(config)
  if (configPanel) configPanel.open = false
  if (configHint) configHint.textContent = config.apiKey ? 'tersimpan' : 'belum diisi'
  setStatus('Config saved.')
  return config
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    throw new Error('Tab aktif tidak ditemukan.')
  }

  return tab
}

async function extractOrdersFromPage() {
  const tab = await getActiveTab()

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PAKTI_EXTRACT_SHOPEE_ORDERS' })
    if (!response?.ok) {
      throw new Error(response?.error || 'Extractor tidak mengembalikan data.')
    }

    return response.orders || []
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Gagal extract. Pastikan tab aktif adalah Shopee Seller order page. ${error.message}`
        : 'Gagal extract order Shopee.',
    )
  }
}

async function syncOrders() {
  syncButton.disabled = true
  try {
    const config = await saveConfig()
    const tab = await getActiveTab()
    if (!isShopeeProcessedToShipOrderUrl(tab.url)) {
      setStatus(`Buka tab Shopee Siap Dikirim terlebih dulu: ${SHOPEE_ORDER_SYNC_URL}`)
      return
    }

    setStatus('Extracting orders from current tab...')

    const orders = await extractOrdersFromPage()
    if (orders.length === 0) {
      setStatus('Tidak ada order yang bisa diextract dari halaman ini.')
      return
    }

    setStatus(`Syncing ${orders.length} order...`)
    const response = await fetch(`${config.apiBaseUrl}/api/import/shopee/orders`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'X-Pakti-Extension-Key': config.apiKey } : {}),
      },
      body: JSON.stringify({ orders }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      if (response.status === 401) {
        throw new Error(
          config.apiKey
            ? 'Autentikasi extension gagal. Periksa Extension API Key di popup dan samakan dengan SHOPEE_EXTENSION_API_KEY di backend.'
            : 'Sesi Pakti tidak tersedia. Isi Extension API Key di popup extension dengan nilai SHOPEE_EXTENSION_API_KEY di backend.',
        )
      }
      throw new Error(payload?.error || `Sync failed: ${response.status}`)
    }

    const result = payload.data || {}
    const imported = result.imported ?? 0
    const updated = result.updated ?? 0
    const skipped = result.skipped ?? 0
    setStatus(`Tersync ${orders.length} order: ${imported} baru, ${updated} update, ${skipped} dilewati.`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Sync gagal.')
  } finally {
    syncButton.disabled = false
  }
}

async function prepareShippingChats() {
  prepareShippingChatsButton.disabled = true
  try {
    await saveConfig()
    const tab = await getActiveTab()
    if (!isShopeeShippingOrderUrl(tab.url)) {
      setStatus(`Buka tab Shopee Pesanan Dikirim terlebih dulu: ${SHOPEE_SHIPPING_CHAT_URL}`)
      return
    }

    let response
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'PAKTI_PREPARE_VISIBLE_SHIPPING_CHATS' })
    } catch (msgError) {
      if (isMissingContentScriptError(msgError)) {
        setStatus('Tab Shopee perlu di-reload terlebih dulu. Tekan F5 di tab Pesanan Dikirim, lalu coba lagi.')
        return
      }
      throw msgError
    }

    if (!response?.ok) {
      throw new Error(response?.error || 'Extension gagal menyiapkan shipping chat.')
    }

    const data = response.data || {}
    const newlyCreated = (data.created || []).map((item) => ({
      orderNumber: item.orderNumber,
      buyerUsername: item.buyerUsername,
      status: item.status,
    }))

    const alreadyQueued = (data.skipped || [])
      .filter((item) => item.reason && item.reason.startsWith('Shipping chat sudah'))
      .map((item) => ({
        orderNumber: item.orderNumber,
        status: item.reason.replace('Shipping chat sudah ', '').replace('.', ''),
      }))

    const activeOrders = [...newlyCreated, ...alreadyQueued]
    const skippedOthers = (data.skipped || []).filter((item) => !item.reason || !item.reason.startsWith('Shipping chat sudah'))

    if (activeOrders.length === 0) {
      const hint = skippedOthers.length > 0
        ? `Dilewati ${skippedOthers.length}: ${skippedOthers.slice(0, 3).map((item) => `${item.orderNumber || '?'} (${item.reason || 'tanpa alasan'})`).join('; ')}. Sync order dulu atau pastikan ada aktivitas packing hari ini.`
        : 'Pesanan pada halaman ini tidak memiliki rekaman/scan hari ini.'
      setStatus(`Tidak ada pesanan aktif hari ini yang perlu disiapkan. ${hint}`)
      return
    }

    let statusLine = `Siap: ${activeOrders.length} pesanan masuk antrean chat. Buka Shopee Webchat untuk pengiriman otomatis.`
    if (skippedOthers.length > 0) {
      statusLine += ` Dilewati ${skippedOthers.length} (tanpa aktivitas/username): sync order dulu bila kurang.`
    }
    setStatus(statusLine)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Gagal menyiapkan shipping chat.')
  } finally {
    prepareShippingChatsButton.disabled = false
  }
}

async function requestApi(path, config, init = {}) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'X-Pakti-Extension-Key': config.apiKey } : {}),
      ...(init.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.ok) {
    if (response.status === 401) {
      throw new Error(
        config.apiKey
          ? 'Autentikasi extension gagal. Periksa Extension API Key di popup dan samakan dengan SHOPEE_EXTENSION_API_KEY di backend.'
          : 'Sesi Pakti tidak tersedia. Isi Extension API Key di popup extension dengan nilai SHOPEE_EXTENSION_API_KEY di backend.',
      )
    }
    throw new Error(payload?.error || `Request failed: ${response.status}`)
  }

  return payload.data
}

function buildChatMessage(job) {
  return job.messageTemplate || `Halo kak ${job.buyerUsername || ''}, berikut video dokumentasi paket untuk pesanan ${job.orderNumber || '-'} resi ${job.resiNumber}.`
}

async function loadPendingChatJobs() {
  loadChatJobsButton.disabled = true
  try {
    const config = await saveConfig()
    setStatus('Memuat antrean chat...')
    const jobs = await requestApi('/api/chat-sends/pending', config)
    renderChatJobs(jobs)
    setStatus(jobs.length === 0 ? 'Antrean kosong — tidak ada chat menunggu.' : `${jobs.length} chat menunggu dikirim.`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Gagal memuat pending chat.')
  } finally {
    loadChatJobsButton.disabled = false
  }
}

async function autoPrepareReadyVideoChats() {
  autoPrepareButton.disabled = true
  try {
    const config = await saveConfig()
    setStatus('Menyiapkan job video chat dari recording packing hari ini...')
    const result = await requestApi('/api/chat-sends/auto-prepare-ready', config, {
      method: 'POST',
      body: JSON.stringify({ limit: 5, taskType: 'packing' }),
    })
    const jobs = await requestApi('/api/chat-sends/pending', config)
    renderChatJobs(jobs)
    const created = result?.created?.length || 0
    const skipped = result?.skipped?.length || 0
    const failed = result?.failed?.length || 0
    setStatus(`Video hari ini disiapkan: ${created} baru${skipped ? `, ${skipped} dilewati` : ''}${failed ? `, ${failed} gagal` : ''}. Total antrean: ${jobs.length}.`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Auto prepare video chat gagal.')
  } finally {
    autoPrepareButton.disabled = false
  }
}

async function prepareShopeeChat() {
  prepareChatButton.disabled = true
  try {
    const config = await saveConfig()
    if (pendingChatJobs.length === 0) {
      renderChatJobs(await requestApi('/api/chat-sends/pending', config))
    }

    const job = getSelectedChatJob()
    if (!job) {
      setStatus('Tidak ada job Shopee Chat pending.')
      return
    }

    const message = buildChatMessage(job)
    const tab = await ensureWebchatTab()
    const response = await sendMessageReady(tab.id, {
      type: 'PAKTI_PREPARE_SHOPEE_CHAT',
      job: { ...job, message },
    })
    if (!response?.ok || !response?.sent) {
      const nextStatus = isBuyerNotFoundMessage(response?.error) ? 'cancelled' : 'failed'
      await requestApi(`/api/chat-sends/${encodeURIComponent(job.id)}/${nextStatus}`, config, {
        method: 'POST',
        body: JSON.stringify({ error: response?.error || 'Extension gagal mengirim Shopee Webchat.' }),
      })
      throw new Error(response?.error || 'Extension gagal mengirim Shopee Webchat.')
    }

    // prepared_at diisi otomatis oleh endpoint sent — cukup 1 call.
    const sentJob = await requestApi(`/api/chat-sends/${encodeURIComponent(job.id)}/sent`, config, { method: 'POST' })
    renderChatJobs(pendingChatJobs.filter((current) => current.id !== job.id))
    setStatus(`Terkirim ke ${sentJob.buyerUsername || '-'} (resi ${sentJob.resiNumber || '-'}, ${pendingChatJobs.length} tersisa).`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Prepare chat gagal.')
  } finally {
    prepareChatButton.disabled = false
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function ensureWebchatTab() {
  const tab = await getActiveTab()
  if (isShopeeWebchatUrl(tab.url)) return tab
  const existing = await chrome.tabs.query({
    url: [
      'https://seller.shopee.co.id/new-webchat/conversations*',
      'https://seller.shopee.com/new-webchat/conversations*',
    ],
  })
  if (existing[0]?.id) {
    await chrome.tabs.update(existing[0].id, { active: true })
    if (existing[0].windowId) await chrome.windows.update(existing[0].windowId, { focused: true }).catch(() => undefined)
    return existing[0]
  }
  return chrome.tabs.create({ url: getShopeeWebchatUrl(tab.url) })
}

async function sendMessageReady(tabId, message, attempts = 4) {
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message)
    } catch (error) {
      lastError = error
      if (!isMissingContentScriptError(error)) throw error
      await sleep(2000)
    }
  }
  throw new Error(
    lastError instanceof Error
      ? `Tab Shopee belum siap (${lastError.message}). Reload tab lalu coba lagi.`
      : 'Tab Shopee belum siap. Reload tab lalu coba lagi.',
  )
}

async function reloadActiveTab() {
  try {
    const tab = await getActiveTab()
    await chrome.tabs.reload(tab.id)
    setStatus('Tab di-reload. Tunggu halaman siap (±5 detik) lalu klik Kirim lagi.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Gagal reload tab.')
  }
}

async function retryFailedJobs() {
  retryFailedButton.disabled = true
  try {
    const config = await saveConfig()
    setStatus('Mengecek job yang gagal...')
    const [videoRecent, shippingRecent] = await Promise.all([
      requestApi('/api/chat-sends/recent?limit=20', config),
      requestApi('/api/shopee/shipping-chat/recent?limit=20', config),
    ])
    const failedVideo = (videoRecent || []).filter((job) => job.status === 'failed' || job.status === 'cancelled')
    const failedShipping = (shippingRecent || []).filter((job) => job.status === 'failed' || job.status === 'cancelled')
    let retried = 0
    for (const job of failedVideo.slice(0, 10)) {
      try {
        await requestApi(`/api/chat-sends/${encodeURIComponent(job.id)}/retry`, config, { method: 'POST' })
        retried += 1
      } catch {
        // Lanjut ke job berikutnya; yang gagal tetap terlihat di antrean.
      }
    }
    for (const job of failedShipping.slice(0, 10)) {
      try {
        await requestApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/retry`, config, { method: 'POST' })
        retried += 1
      } catch {
        // Lanjut ke job berikutnya.
      }
    }
    const jobs = await requestApi('/api/chat-sends/pending', config)
    renderChatJobs(jobs)
    setStatus(retried === 0 ? 'Tidak ada job gagal yang bisa dicoba lagi.' : `${retried} job dikembalikan ke antrean. Buka tab Webchat agar terkirim otomatis.`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Gagal retry job.')
  } finally {
    retryFailedButton.disabled = false
  }
}

async function openShopeeUrl(url) {
  try {
    await chrome.tabs.create({ url })
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Gagal membuka tab Shopee.')
  }
}

readConfig().then(async (config) => {
  apiBaseUrlInput.value = config.apiBaseUrl
  apiKeyInput.value = config.apiKey
  // Konfigurasi jarang diubah: lipat kecuali belum pernah diisi.
  if (configPanel) configPanel.open = !config.apiKey
  if (configHint) configHint.textContent = config.apiKey ? 'tersimpan' : 'belum diisi'
  getActiveTab()
    .then((tab) => {
      applyPageMode(getPageMode(tab.url))
    })
    .catch(() => {
      applyPageMode({ key: 'unsupported', label: 'Tab tidak terbaca', tone: 'bad' })
    })
  // Auto-load pending jobs agar user tidak perlu klik Load lagi setelah dari Pakti web
  void loadPendingChatJobs().catch(() => undefined)
})

saveButton.addEventListener('click', async () => {
  await saveConfig()
  setStatus('Konfigurasi tersimpan.')
})
toggleKeyButton.addEventListener('click', () => {
  const showing = apiKeyInput.type === 'text'
  apiKeyInput.type = showing ? 'password' : 'text'
  toggleKeyButton.textContent = showing ? '👁' : '🙈'
  toggleKeyButton.setAttribute('aria-label', showing ? 'Tampilkan API key' : 'Sembunyikan API key')
})
syncButton.addEventListener('click', syncOrders)
openOrderPageButton.addEventListener('click', () => void openShopeeUrl(SHOPEE_ORDER_SYNC_URL))
prepareShippingChatsButton.addEventListener('click', prepareShippingChats)
openShippingPageButton.addEventListener('click', () => void openShopeeUrl(SHOPEE_SHIPPING_CHAT_URL))
openWebchatButton.addEventListener('click', () => getActiveTab().then(
  (tab) => openShopeeUrl(getShopeeWebchatUrl(tab.url)),
  () => openShopeeUrl(getShopeeWebchatUrl('')),
))
autoPrepareButton.addEventListener('click', autoPrepareReadyVideoChats)
loadChatJobsButton.addEventListener('click', loadPendingChatJobs)
prepareChatButton.addEventListener('click', prepareShopeeChat)
reloadTabButton.addEventListener('click', reloadActiveTab)
retryFailedButton.addEventListener('click', retryFailedJobs)
