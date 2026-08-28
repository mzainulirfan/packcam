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
const markSentButton = document.querySelector('#markSentButton')
const pageModeText = document.querySelector('#pageModeText')
const statusText = document.querySelector('#statusText')
let lastPreparedChatJob = null
let pendingChatJobs = []

function setStatus(value) {
  statusText.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, '')
}

function isShopeeShippingOrderUrl(value) {
  try {
    const url = new URL(value || '')
    return isShopeeSellerHostname(url.hostname) && url.pathname === '/portal/sale/order' && url.searchParams.get('type') === 'shipping'
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
  if (isShopeeWebchatUrl(value)) return '[x] webchat worker'
  if (isShopeeShippingOrderUrl(value)) return '[x] order sync'
  try {
    const url = new URL(value || '')
    if (isShopeeSellerHostname(url.hostname)) return '[~] seller page'
  } catch {
    // ignore
  }
  return '[!] unsupported'
}

function isMissingContentScriptError(error) {
  return error instanceof Error && error.message.toLowerCase().includes('receiving end does not exist')
}

function isBuyerNotFoundMessage(value) {
  return /percakapan shopee untuk .+ tidak ditemukan/i.test(String(value || ''))
}

function toOperationalOrder(order) {
  return {
    nomorPesanan: order.orderNumber,
    nomorResi: order.trackingNumber,
    pembeli: order.buyerUsername,
    jasaKirim: order.shippingChannel,
    produk: (order.items || []).map((item) => ({
      nama: item.productName,
      qty: item.quantity,
    })),
  }
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
    setStatus('Extracting orders from current tab...')

    const orders = await extractOrdersFromPage()
    if (orders.length === 0) {
      setStatus('Tidak ada order yang bisa diextract dari halaman ini.')
      return
    }

    setStatus(`Syncing ${orders.length} order(s)...`)
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

    setStatus({
      synced: payload.data,
      extractedCount: orders.length,
      orders: orders.map(toOperationalOrder),
    })
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
      setStatus('Buka tab Shopee Pesanan Dikirim terlebih dulu: https://seller.shopee.co.id/portal/sale/order?type=shipping')
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

    if (activeOrders.length === 0) {
      setStatus({
        status: 'Tidak ada pesanan aktif hari ini yang perlu disiapkan.',
        keterangan: 'Pesanan pada halaman ini tidak memiliki rekaman/scan hari ini.',
      })
      return
    }

    setStatus({
      status: `Order tersync. Total ${activeOrders.length} pesanan aktif dalam antrean chat.`,
      pesanan: activeOrders,
      next: 'Antrean video dan shipping chat akan diproses otomatis saat Shopee Webchat terbuka.',
    })
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
    setStatus('Loading pending Shopee Chat jobs...')
    const jobs = await requestApi('/api/chat-sends/pending', config)
    renderChatJobs(jobs)
    setStatus({
      pendingCount: jobs.length,
      jobs: jobs.map((job) => ({
        pembeli: job.buyerUsername,
        nomorPesanan: job.orderNumber,
        nomorResi: job.resiNumber,
        status: job.status,
      })),
    })
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
    setStatus({
      autoPrepare: {
        created: result?.created?.length || 0,
        skipped: result?.skipped?.length || 0,
        failed: result?.failed?.length || 0,
      },
      pendingCount: jobs.length,
      next: 'Biarkan tab Shopee Webchat terbuka untuk mengirim antrean otomatis.',
    })
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

    const tab = await getActiveTab()
    if (!isShopeeWebchatUrl(tab.url)) {
      const existing = await chrome.tabs.query({
        url: [
          'https://seller.shopee.co.id/new-webchat/conversations*',
          'https://seller.shopee.com/new-webchat/conversations*',
        ],
      })
      if (existing[0]?.id) {
        await chrome.tabs.update(existing[0].id, { active: true })
        if (existing[0].windowId) await chrome.windows.update(existing[0].windowId, { focused: true })
        setStatus('Pakai tab Shopee Webchat yang sudah ada. Klik Prepare Shopee Chat lagi dari tab Webchat tersebut.')
      } else {
        await chrome.tabs.create({ url: getShopeeWebchatUrl(tab.url) })
        setStatus('Shopee Webchat dibuka. Setelah halaman siap, klik Prepare Shopee Chat lagi dari tab Webchat. Sidebar/minichat tidak dipakai.')
      }
      return
    }

    const message = buildChatMessage(job)
    let response
    try {
      response = await chrome.tabs.sendMessage(tab.id, {
        type: 'PAKTI_PREPARE_SHOPEE_CHAT',
        job: { ...job, message },
      })
    } catch (msgError) {
      if (isMissingContentScriptError(msgError)) {
        setStatus('Tab Shopee Webchat perlu di-reload terlebih dulu. Tekan F5 di tab Webchat, tunggu halaman siap, lalu coba Prepare Shopee Chat lagi.')
        return
      }
      throw msgError
    }
    if (!response?.ok || !response?.sent) {
      const nextStatus = isBuyerNotFoundMessage(response?.error) ? 'cancelled' : 'failed'
      await requestApi(`/api/chat-sends/${encodeURIComponent(job.id)}/${nextStatus}`, config, {
        method: 'POST',
        body: JSON.stringify({ error: response?.error || 'Extension gagal mengirim Shopee Webchat.' }),
      })
      throw new Error(response?.error || 'Extension gagal mengirim Shopee Webchat.')
    }

    await requestApi(`/api/chat-sends/${encodeURIComponent(job.id)}/prepared`, config, { method: 'POST' })
    const sentJob = await requestApi(`/api/chat-sends/${encodeURIComponent(job.id)}/sent`, config, { method: 'POST' })
    renderChatJobs(pendingChatJobs.filter((current) => current.id !== job.id))
    setStatus({
      sent: {
        pembeli: sentJob.buyerUsername,
        nomorPesanan: sentJob.orderNumber,
        nomorResi: sentJob.resiNumber,
        status: sentJob.status,
      },
    })
    lastPreparedChatJob = null
    markSentButton.disabled = true
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Prepare chat gagal.')
  } finally {
    prepareChatButton.disabled = false
  }
}

async function markLastChatSent() {
  if (!lastPreparedChatJob) {
    setStatus('Belum ada job yang disiapkan dari popup ini.')
    return
  }

  markSentButton.disabled = true
  try {
    const config = await readConfig()
    const job = await requestApi(`/api/chat-sends/${encodeURIComponent(lastPreparedChatJob.id)}/sent`, config, {
      method: 'POST',
    })
    renderChatJobs(pendingChatJobs.filter((current) => current.id !== job.id))
    setStatus({
      sent: {
        pembeli: job.buyerUsername,
        nomorPesanan: job.orderNumber,
        nomorResi: job.resiNumber,
        status: job.status,
      },
    })
    lastPreparedChatJob = null
  } catch (error) {
    markSentButton.disabled = false
    setStatus(error instanceof Error ? error.message : 'Gagal menandai chat terkirim.')
  }
}

readConfig().then(async (config) => {
  apiBaseUrlInput.value = config.apiBaseUrl
  apiKeyInput.value = config.apiKey
  getActiveTab()
    .then((tab) => {
      pageModeText.textContent = getPageMode(tab.url)
    })
    .catch(() => {
      pageModeText.textContent = '[!] no active tab'
    })
  // Auto-load pending jobs agar user tidak perlu klik Load lagi setelah dari Pakti web
  void loadPendingChatJobs().catch(() => undefined)
})

saveButton.addEventListener('click', saveConfig)
syncButton.addEventListener('click', syncOrders)
prepareShippingChatsButton.addEventListener('click', prepareShippingChats)
autoPrepareButton.addEventListener('click', autoPrepareReadyVideoChats)
loadChatJobsButton.addEventListener('click', loadPendingChatJobs)
prepareChatButton.addEventListener('click', prepareShopeeChat)
markSentButton.addEventListener('click', markLastChatSent)
