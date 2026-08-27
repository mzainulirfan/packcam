const DEFAULT_API_BASE_URL = 'https://api-pakti.zakado.id'

const apiBaseUrlInput = document.querySelector('#apiBaseUrl')
const apiKeyInput = document.querySelector('#apiKey')
const saveButton = document.querySelector('#saveButton')
const syncButton = document.querySelector('#syncButton')
const statusText = document.querySelector('#statusText')

function setStatus(value) {
  statusText.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, '')
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
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'X-Pakti-Extension-Key': config.apiKey } : {}),
      },
      body: JSON.stringify({ orders }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
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

readConfig().then((config) => {
  apiBaseUrlInput.value = config.apiBaseUrl
  apiKeyInput.value = config.apiKey
})

saveButton.addEventListener('click', saveConfig)
syncButton.addEventListener('click', syncOrders)
