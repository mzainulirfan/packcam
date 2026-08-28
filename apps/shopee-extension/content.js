function textOf(element) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return null
}

function findLabelValue(root, labels) {
  const elements = [...root.querySelectorAll('div, span, p, td, th')]
  for (let index = 0; index < elements.length; index += 1) {
    const value = textOf(elements[index])
    const normalized = value.toLowerCase()
    if (!labels.some((label) => normalized === label || normalized.includes(`${label}:`))) {
      continue
    }

    const inlineValue = value.split(':').slice(1).join(':').trim()
    if (inlineValue) {
      return inlineValue
    }

    for (let offset = 1; offset <= 3; offset += 1) {
      const siblingValue = textOf(elements[index + offset])
      if (siblingValue && !labels.includes(siblingValue.toLowerCase())) {
        return siblingValue
      }
    }
  }

  return null
}

function parseQuantity(text) {
  const match = text.match(/(?:x|qty|jumlah)\s*(\d+)/i) || text.match(/(\d+)\s*(?:pcs|buah|item)/i)
  return match?.[1] ? Number(match[1]) : 1
}

function parseOrderNumber(text) {
  return firstMatch(text, [/(?:No\.\s*Pesanan|Nomor Pesanan|Order ID|Order Number)\s*([A-Z0-9-]{8,})/i])
}

function extractShopeeItems(root) {
  const itemElements = [...root.querySelectorAll('.order-item-infos .item-list .item, [data-testid="order-item-infos"] .item-list .item')]

  return itemElements
    .map((element) => {
      const productName = textOf(element.querySelector('.item-name'))
      if (!productName) {
        return null
      }

      const amountText = textOf(element.querySelector('.item-amount'))

      return {
        sku: null,
        productName,
        variationName: null,
        quantity: parseQuantity(amountText),
        imageUrl: null,
      }
    })
    .filter(Boolean)
}

function extractItems(root) {
  const shopeeItems = extractShopeeItems(root)
  if (shopeeItems.length > 0) {
    return shopeeItems
  }

  const itemSelectors = [
    '[class*="product"]',
    '[class*="item"]',
    '[data-testid*="product"]',
    '[data-testid*="item"]',
  ]
  const candidates = [...root.querySelectorAll(itemSelectors.join(','))]
    .map((element) => ({ element, text: textOf(element) }))
    .filter((entry) => entry.text.length > 8 && !/nomor pesanan|order id|no\. pesanan/i.test(entry.text))

  const unique = []
  const seen = new Set()
  for (const candidate of candidates) {
    const key = candidate.text.slice(0, 140)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    unique.push(candidate)
  }

  return unique.slice(0, 20).map((candidate) => {
    const image = candidate.element.querySelector('img')
    return {
      sku: firstMatch(candidate.text, [/sku[:\s]+([^|,]+)/i]) || null,
      productName: candidate.text.replace(/\s*x\s*\d+\s*$/i, '').slice(0, 220),
      variationName: firstMatch(candidate.text, [/(?:variasi|variation)[:\s]+([^|,]+)/i]) || null,
      quantity: parseQuantity(candidate.text),
      imageUrl: image?.src || null,
    }
  })
}

function extractOrderFromRoot(root) {
  const fullText = textOf(root)
  const orderSnText = textOf(root.querySelector('.order-sn, [data-copy-helper-ready="order_number"]'))
  const orderNumber =
    parseOrderNumber(orderSnText) ||
    findLabelValue(root, ['nomor pesanan', 'no. pesanan', 'order id', 'order number']) ||
    parseOrderNumber(fullText) ||
    firstMatch(fullText, [/(?:nomor pesanan|no\. pesanan|order id|order number)[:\s#]*([A-Z0-9-]{8,})/i])
  const trackingNumber =
    textOf(root.querySelector('.tracking-number-list .tracking-number, .tracking-number')) ||
    findLabelValue(root, ['no. resi', 'nomor resi', 'resi', 'tracking number', 'air waybill']) ||
    firstMatch(fullText, [/(?:no\. resi|nomor resi|resi|tracking number|air waybill)[:\s#]*([A-Z0-9-]{8,})/i])

  if (!orderNumber) {
    return null
  }

  const items = extractItems(root)

  return {
    source: 'shopee',
    orderNumber,
    trackingNumber,
    buyerUsername: textOf(root.querySelector('.buyer-username')) || findLabelValue(root, ['username pembeli', 'buyer username', 'pembeli']) || null,
    shippingChannel: textOf(root.querySelector('.fulfilment-channel-name')) || null,
    orderStatus: null,
    rawPayload: null,
    items: items.length > 0 ? items : [{ sku: null, productName: 'Unknown item', variationName: null, quantity: 1, imageUrl: null }],
  }
}

function extractOrders() {
  const containers = [
    ...document.querySelectorAll('[data-testid^="package-card-"], .order-card, [data-testid="order-item"], [class*="OrderCard"], [class*="order-detail"]'),
  ]
  const roots = containers.length > 0 ? containers : [document.body]
  const orders = roots.map(extractOrderFromRoot).filter(Boolean)
  const seen = new Set()

  return orders.filter((order) => {
    if (seen.has(order.orderNumber)) {
      return false
    }

    seen.add(order.orderNumber)
    return true
  })
}

function mergeOrdersByNumber(orderGroups) {
  const byOrderNumber = new Map()
  for (const order of orderGroups.flat()) {
    if (!order?.orderNumber || byOrderNumber.has(order.orderNumber)) continue
    byOrderNumber.set(order.orderNumber, order)
  }

  return [...byOrderNumber.values()]
}

function findScrollableOrderContainer() {
  const candidates = [
    ...document.querySelectorAll('[class*="order" i], [class*="list" i], [class*="scroll" i], main, section, div'),
  ]

  return candidates.find((element) => {
    if (!(element instanceof HTMLElement) || element.offsetParent === null) return false
    const style = window.getComputedStyle(element)
    const canScroll = /(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)
    return canScroll && element.scrollHeight > element.clientHeight + 120
  }) || document.scrollingElement
}

async function extractOrdersWithLightScroll() {
  if (!isShopeeShippingOrderPage()) return extractOrders()

  const scrollTarget = findScrollableOrderContainer()
  const beforeTop = scrollTarget?.scrollTop ?? window.scrollY
  const first = extractOrders()

  if (!scrollTarget || first.length >= 30) {
    return first
  }

  const scrollBy = Math.max(360, Math.floor((scrollTarget.clientHeight || window.innerHeight) * 0.85))
  scrollTarget.scrollTo({ top: beforeTop + scrollBy, behavior: 'instant' })
  await new Promise((resolve) => setTimeout(resolve, 900))
  const second = extractOrders()
  scrollTarget.scrollTo({ top: beforeTop, behavior: 'instant' })

  return mergeOrdersByNumber([first, second])
}

function isShopeeSellerHostname(hostname) {
  return hostname === 'seller.shopee.co.id' || hostname === 'seller.shopee.com'
}

function isShopeeShippingOrderPage() {
  try {
    const url = new URL(location.href)
    return isShopeeSellerHostname(url.hostname) && url.pathname === '/portal/sale/order' && url.searchParams.get('type') === 'shipping'
  } catch {
    return false
  }
}

function isShopeeWebchatPage() {
  try {
    const url = new URL(location.href)
    if (!isShopeeSellerHostname(url.hostname)) return false

    return url.pathname.startsWith('/new-webchat/')
  } catch {
    return false
  }
}

async function readExtensionConfig() {
  const stored = await new Promise((resolve) => chrome.storage.sync.get({ apiBaseUrl: 'https://api-pakti.zakado.id', apiKey: '' }, resolve))
  return {
    apiBaseUrl: (stored.apiBaseUrl || 'https://api-pakti.zakado.id').replace(/\/+$/, ''),
    apiKey: stored.apiKey || '',
  }
}

async function requestPaktiApi(path, config, init = {}) {
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
          : 'Sesi Pakti tidak tersedia dari halaman Shopee. Isi Extension API Key di popup extension dengan nilai SHOPEE_EXTENSION_API_KEY di backend.',
      )
    }
    throw new Error(payload?.error || `Pakti API gagal: ${response.status}`)
  }

  return payload.data
}

async function prepareVisibleShippingChats() {
  if (!isShopeeShippingOrderPage()) return

  const orders = await extractOrdersWithLightScroll()
  const orderInputs = orders
    .filter((order) => order.orderNumber)
    .map((order) => ({
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber || null,
      buyerUsername: order.buyerUsername || null,
    }))
  if (orderInputs.length === 0) return

  const signature = orderInputs.map((o) => [o.orderNumber, o.trackingNumber || '', o.buyerUsername || ''].join(':')).join('|')
  if (sessionStorage.getItem('pakti:lastShippingScan') === signature) return

  const config = await readExtensionConfig()
  await requestPaktiApi('/api/import/shopee/orders', config, {
    method: 'POST',
    body: JSON.stringify({ orders }),
  })
  const result = await requestPaktiApi('/api/shopee/shipping-chat/prepare', config, {
    method: 'POST',
    body: JSON.stringify({ orders: orderInputs }),
  })
  sessionStorage.setItem('pakti:lastShippingScan', signature)
  console.info('[Pakti] shipping orders synced and chat queue prepared', result)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PAKTI_EXTRACT_SHOPEE_ORDERS') {
    try {
      sendResponse({ ok: true, orders: extractOrders() })
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Extractor gagal.' })
    }

    return true
  }

  if (message?.type === 'PAKTI_PREPARE_VISIBLE_SHIPPING_CHATS') {
    ;(async () => {
      try {
        if (!isShopeeShippingOrderPage()) {
          throw new Error('Tab aktif harus halaman Pesanan Dikirim Shopee: /portal/sale/order?type=shipping')
        }

        const orders = await extractOrdersWithLightScroll()
        const orderInputs = orders
          .filter((order) => order.orderNumber)
          .map((order) => ({
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber || null,
            buyerUsername: order.buyerUsername || null,
          }))
        if (orderInputs.length === 0) {
          sendResponse({ ok: true, data: { created: [], skipped: [], visibleOrderCount: 0 } })
          return
        }

        const config = await readExtensionConfig()
        await requestPaktiApi('/api/import/shopee/orders', config, {
          method: 'POST',
          body: JSON.stringify({ orders }),
        })
        const result = await requestPaktiApi('/api/shopee/shipping-chat/prepare', config, {
          method: 'POST',
          body: JSON.stringify({ orders: orderInputs }),
        })
        sessionStorage.setItem('pakti:lastShippingScan', orderInputs.map((o) => [o.orderNumber, o.trackingNumber || '', o.buyerUsername || ''].join(':')).join('|'))
        sendResponse({ ok: true, data: { ...result, visibleOrderCount: orderInputs.length } })
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Gagal menyiapkan shipping chat.' })
      }
    })()

    return true
  }

  if (message?.type === 'PAKTI_PREPARE_SHOPEE_CHAT') {
    ;(async () => {
      try {
        const job = message.job || {}
        const messageText = job.message || ''
        const sent = await fillWebchatSearchAndAttach({ ...job, message: messageText })

        navigator.clipboard?.writeText([
          `Pembeli: ${job.buyerUsername || '-'}`,
          `No. Pesanan: ${job.orderNumber || '-'}`,
          `No. Resi: ${job.resiNumber || '-'}`,
          `Video: ${job.videoUrl || '-'}`,
          '',
          messageText,
        ].join('\n')).catch(() => undefined)

        sendResponse({ ok: true, sent })
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Prepare Shopee Webchat gagal.' })
      }
    })()

    return true
  }

  return false
})

/**
 * Klik tombol kirim chat Shopee Webchat.
 * Selector berdasarkan DOM:
 *   <div class="XsR3zIeGOc"><i class="... kgP1yPCqxR"><svg class="chat-icon">...</svg></i></div>
 */
function clickSendButton() {
  const sendBtn =
    document.querySelector('div.XsR3zIeGOc') ||
    document.querySelector('i.kgP1yPCqxR')?.closest('div') ||
    document.querySelector('svg.chat-icon')?.closest('div') ||
    document.querySelector('i.kgP1yPCqxR')?.parentElement ||
    document.querySelector('[data-testid*="send" i], [data-testid*="submit" i]') ||
    document.querySelector('[aria-label*="send" i], [aria-label*="kirim" i], [title*="send" i], [title*="kirim" i]') ||
    [...document.querySelectorAll('button, [role="button"]')].find((element) => /^(send|kirim|发送)$/i.test(textOf(element)))
  if (sendBtn) {
    sendBtn.click()
    sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return true
  }
  return false
}

/**
 * Masukkan pesan ke composer Shopee Webchat dan kirimkan.
 * Urutan pengiriman:
 *  1. Insert teks ke composer (contenteditable atau textarea)
 *  2. Tunggu React update (300ms)
 *  3. Dispatch keydown Enter pada composer (cara utama: Enter = kirim di Shopee)
 *  4. Tunggu 400ms, jika masih ada teks di composer, fallback klik tombol kirim
 */
async function sendComposerMessage(message) {
  let composer = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    composer = findComposerInput()
    if (composer) break
    await new Promise((r) => setTimeout(r, 300))
  }
  if (!composer) throw new Error('Composer pesan Shopee Webchat tidak ditemukan.')

  composer.focus()

  // Masukkan teks
  if (composer.isContentEditable) {
    // contenteditable: gunakan execCommand agar React mendeteksi perubahan
    composer.textContent = ''
    document.execCommand('insertText', false, message)
  } else {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), 'value')?.set
    if (setter) setter.call(composer, message)
    else composer.value = message
    composer.dispatchEvent(new Event('input', { bubbles: true }))
    composer.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // Tunggu React memproses input
  await new Promise((r) => setTimeout(r, 300))

  // Cara 1: Kirim dengan keydown Enter (cara terbaik untuk Shopee)
  composer.focus()
  composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
  composer.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
  composer.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))

  // Tunggu dan cek apakah teks berhasil dikirim (composer kosong = sukses)
  await new Promise((r) => setTimeout(r, 400))
  const textAfter = composer.isContentEditable ? composer.textContent?.trim() : composer.value?.trim()
  if (!textAfter) return true

  // Cara 2 (fallback): Klik tombol Send, lalu pastikan composer benar-benar kosong.
  if (clickSendButton()) {
    await new Promise((r) => setTimeout(r, 800))
    const textAfterClick = composer.isContentEditable ? composer.textContent?.trim() : composer.value?.trim()
    if (!textAfterClick) return true
  }
  throw new Error('Tombol kirim Shopee Webchat tidak ditemukan.')
}

function findSearchInput() {
  if (!isShopeeWebchatPage()) return null

  return (
    document.querySelector('input.shopee-react-input__input[placeholder="Cari Semua"]') ||
    document.querySelector('input[placeholder="Cari Semua"]') ||
    document.querySelector('input[placeholder*="Cari" i]') ||
    document.querySelector('input[type="input"][placeholder*="Cari"]') ||
    document.querySelector('input[type="search"]')
  )
}

function findComposerInput() {
  if (!isShopeeWebchatPage()) return null

  return (
    document.querySelector('textarea.E2MWg3w8y6') ||
    document.querySelector('textarea[placeholder*="Tulis" i]') ||
    document.querySelector('textarea[placeholder*="pesan" i]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('div[contenteditable="true"][aria-label*="pesan" i]') ||
    document.querySelector('div[role="textbox"][contenteditable="true"]') ||
    document.querySelector('div[role="textbox"]')
  )
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function findConversationTarget(username) {
  if (!isShopeeWebchatPage()) return null

  const normalizedUsername = username.trim().toLowerCase()
  const candidates = [
    ...document.querySelectorAll(
      '[data-testid*="conversation" i], [data-testid*="chat" i], [class*="conversation"], [class*="chat-item"], ' +
        '[class*="user-item"], [class*="SW7LUhQFDH"], [class*="AxOomp7jNy"], [role="option"], [role="listitem"], li, a, button',
    ),
  ]

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement) || candidate.offsetParent === null) continue
    const candidateText = textOf(candidate).toLowerCase()
    if (!candidateText || candidateText.length > 160 || !candidateText.includes(normalizedUsername)) continue

    const rect = candidate.getBoundingClientRect()
    if (rect.width < 20 || rect.height < 20) continue
    return candidate
  }

  return null
}

function findActiveConversationHeader(username) {
  if (!isShopeeWebchatPage()) return null

  const normalizedUsername = normalizeText(username)
  const candidates = [
    ...document.querySelectorAll(
      '[data-testid*="header" i], [class*="header"], [class*="conversation-title"], [class*="chat-title"], h1, h2, h3, [role="heading"]',
    ),
  ]

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement) || candidate.offsetParent === null) continue
    const candidateText = normalizeText(candidate.textContent)
    if (candidateText && candidateText.length <= 180 && candidateText.includes(normalizedUsername)) {
      return candidate
    }
  }

  return null
}

async function waitForCondition(check, timeoutMs = 8000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  let lastValue = null

  while (Date.now() < deadline) {
    try {
      const value = check()
      if (value) {
        return value
      }
      lastValue = value
    } catch (error) {
      lastValue = error
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  if (lastValue instanceof Error) {
    throw lastValue
  }

  return null
}

async function waitForComposerReady(timeoutMs = 8000) {
  const composer = await waitForCondition(() => findComposerInput(), timeoutMs)
  if (!composer) {
    throw new Error('Composer pesan Shopee belum siap setelah memilih pembeli.')
  }

  return composer
}

async function waitForActiveConversation(username) {
  const header = await waitForCondition(() => findActiveConversationHeader(username), 5000, 250)
  if (!header) {
    throw new Error(`Percakapan Shopee untuk ${username} belum aktif setelah dipilih.`)
  }

  return header
}

async function fillWebchatSearchAndAttach(job) {
  const input = findSearchInput()
  if (!input) throw new Error('Kolom pencarian percakapan Shopee Webchat tidak ditemukan.')
  if (!job?.buyerUsername) throw new Error('Username pembeli tidak tersedia untuk mencari percakapan.')
  input.focus()
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  if (setter) setter.call(input, job.buyerUsername)
  else input.value = job.buyerUsername
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }))
  const target = await waitForCondition(() => findConversationTarget(job.buyerUsername), 15000, 300)
  let clicked = false
  if (target) {
    target.click()
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    clicked = true
  }
  if (!clicked) throw new Error(`Percakapan Shopee untuk ${job.buyerUsername} tidak ditemukan.`)
  if (clicked) {
    await new Promise((r) => setTimeout(r, 1500))
  }
  await waitForActiveConversation(job.buyerUsername)
  await waitForComposerReady(10000)
  if (job.videoUrl) {
    try {
      const stored = await new Promise((resolve) => chrome.storage.sync.get({ apiKey: '' }, resolve))
      const headers = stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : undefined
      const response = await fetch(job.videoUrl, { credentials: 'include', headers })
      if (!response.ok) {
        throw new Error(`Video Shopee gagal diunduh (${response.status}).`)
      }

      const blob = await response.blob()
      const fileName = `${(job.orderNumber || job.resiNumber || 'pakti-video').replace(/[^\w-]+/g, '_')}.mp4`
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' })
      let fileInput = await waitForCondition(
        () => document.querySelector('input[accept*="video"]') || document.querySelector('input[type="file"]'),
        5000,
        200,
      )
      if (!fileInput) {
        const attachBtn = document.querySelector(
          'button[class*="attach"], [aria-label*="attach" i], [aria-label*="lampir" i], [title*="attach" i], [title*="lampir" i], [data-testid*="attach" i]',
        )
        if (!attachBtn) {
          throw new Error('Tombol lampirkan video Shopee tidak ditemukan.')
        }

        attachBtn.click()
        await new Promise((r) => setTimeout(r, 1200))
        fileInput = await waitForCondition(
          () => document.querySelector('input[accept*="video"]') || document.querySelector('input[type="file"]'),
          5000,
          200,
        )
      }

      if (!fileInput) {
        throw new Error('Input file video Shopee tidak ditemukan.')
      }

      const dt = new DataTransfer()
      dt.items.add(file)
      fileInput.files = dt.files
      fileInput.dispatchEvent(new Event('input', { bubbles: true }))
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      const attached = await waitForCondition(
        () => fileInput.files?.length > 0 && fileInput.files[0]?.name === fileName,
        3000,
        150,
      )
      if (!attached) {
        throw new Error('Video Shopee belum terpasang ke input file.')
      }
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Video Shopee gagal dipasang.')
    }
  }
  let sent = false
  if (job.message) {
    sent = await sendComposerMessage(job.message)
  }
  return Boolean(sent || clicked)
}

// Kirim chat otomatis hanya dari tab Shopee Webchat, bukan sidebar/minichat Seller Center.
if (isShopeeWebchatPage()) {
  let lastAutoJobId = ''
  let autoRunBusy = false
  let autoRunStartTimer = null
  let autoRunInterval = null

  function getErrorText(error) {
    if (error instanceof Error) return `${error.name} ${error.message} ${error.stack || ''}`
    return String(error || '')
  }

  function isExtensionContextInvalidated(error) {
    return /extension context invalidated|context invalidated/i.test(getErrorText(error))
  }

  function isBuyerNotFoundError(error) {
    return /percakapan shopee untuk .+ tidak ditemukan/i.test(getErrorText(error))
  }

  function stopAutoRunTimers() {
    if (autoRunStartTimer) clearTimeout(autoRunStartTimer)
    if (autoRunInterval) clearInterval(autoRunInterval)
    autoRunStartTimer = null
    autoRunInterval = null
  }

  function clearSearchInput() {
    const input = findSearchInput()
    if (input) {
      input.focus()
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
      if (setter) setter.call(input, '')
      else input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      
      const clearBtn =
        input.closest('.shopee-react-input__inner')?.querySelector('.shopee-react-input__clear-btn') ||
        document.querySelector('.shopee-react-input__clear-icon') ||
        document.querySelector('[class*="clear"]')
      if (clearBtn) {
        try { clearBtn.click() } catch (e) {}
      }
    }
  }

  async function autoRunShippingChat(config) {
    const job = await requestPaktiApi('/api/shopee/shipping-chat/next', config)
    if (!job) return false

    const input = findSearchInput()
    // Hanya skip jika input sedang di-focus (user sedang mengetik manual)
    if (input?.value?.trim() && document.activeElement === input) return false

    try {
      const sent = await fillWebchatSearchAndAttach({ ...job, message: job.message })
      if (!sent) {
        throw new Error('Tombol kirim Shopee Webchat tidak ditemukan.')
      }
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/prepared`, config, { method: 'POST' })
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/sent`, config, { method: 'POST' })
      
      // Bersihkan pencarian untuk job berikutnya
      clearSearchInput()
      return true
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        stopAutoRunTimers()
        return false
      }

      const nextStatus = isBuyerNotFoundError(error) ? 'cancelled' : 'failed'
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/${nextStatus}`, config, {
        method: 'POST',
        body: JSON.stringify({ error: error instanceof Error ? error.message : 'Extension gagal mengirim shipping chat.' }),
      }).catch(() => undefined)
      // Bersihkan pencarian jika gagal agar antrean tidak macet
      clearSearchInput()
      return false
    }
  }

  async function autoPrepareReadyVideoChats(config) {
    const result = await requestPaktiApi('/api/chat-sends/auto-prepare-ready', config, {
      method: 'POST',
      body: JSON.stringify({ limit: 5, taskType: 'packing' }),
    }).catch((error) => {
      if (isExtensionContextInvalidated(error)) throw error
      console.warn('[Pakti] auto prepare video chat gagal', error)
      return null
    })
    if (result) {
      console.info('[Pakti] auto prepare video chat', {
        created: result.created?.length || 0,
        skipped: result.skipped?.length || 0,
        failed: result.failed?.length || 0,
      })
    }
  }

  async function sendExtensionHeartbeat(config, details = {}) {
    await requestPaktiApi('/api/shopee/extension-heartbeat', config, {
      method: 'POST',
      body: JSON.stringify({
        page: location.href,
        mode: 'webchat-worker',
        ...details,
      }),
    }).catch((error) => {
      if (isExtensionContextInvalidated(error)) throw error
    })
  }

  async function autoRunPending() {
    if (autoRunBusy) return
    autoRunBusy = true
    let activeAutoJob = null
    try {
      const stored = await readExtensionConfig()
      await autoPrepareReadyVideoChats(stored)
      const base = stored.apiBaseUrl
      const res = await fetch(`${base}/api/chat-sends/pending`, {
        credentials: 'include',
        headers: stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : undefined,
      })
      const payload = await res.json().catch(() => null)
      const chatJob = payload?.ok && Array.isArray(payload.data) ? payload.data[0] : null
      const shippingJob = chatJob ? null : await requestPaktiApi('/api/shopee/shipping-chat/next', stored)
      await sendExtensionHeartbeat(stored, {
        pendingVideoCount: payload?.ok && Array.isArray(payload.data) ? payload.data.length : null,
        pendingShippingAvailable: Boolean(shippingJob),
      })
      if (!chatJob && !shippingJob) return

      if (!chatJob) {
        await autoRunShippingChat(stored)
        return
      }
      const job = chatJob
      if (!job || job.id === lastAutoJobId) return
      const input = findSearchInput()
      // Hanya skip jika input sedang di-focus (user sedang mengetik manual)
      if (input?.value?.trim() && document.activeElement === input) {
        const isStaleAutoSearch = input.value.trim().toLowerCase() === job.buyerUsername?.trim().toLowerCase()
        if (!isStaleAutoSearch) return
        clearSearchInput()
      }
      
      activeAutoJob = job
      const message = job.messageTemplate || `Halo kak ${job.buyerUsername || ''}, berikut video dokumentasi paket untuk pesanan ${job.orderNumber || '-'} resi ${job.resiNumber}.`
      const sent = await fillWebchatSearchAndAttach({ ...job, message })
      if (!sent) {
        throw new Error('Tombol kirim Shopee Webchat tidak ditemukan.')
      }
      await fetch(`${base}/api/chat-sends/${encodeURIComponent(job.id)}/prepared`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : {}) },
      }).catch(() => undefined)
      const sentResponse = await fetch(`${base}/api/chat-sends/${encodeURIComponent(job.id)}/sent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : {}) },
      })
      if (!sentResponse.ok) {
        throw new Error(`Gagal menandai chat terkirim (${sentResponse.status}).`)
      }

      // Bersihkan pencarian untuk job berikutnya
      clearSearchInput()
      lastAutoJobId = job.id
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        stopAutoRunTimers()
        return
      }
      if (activeAutoJob) {
        // Jangan biarkan input sisa percobaan membuat retry berikutnya dianggap ketikan manual.
        clearSearchInput()
        if (isBuyerNotFoundError(error)) {
          const stored = await readExtensionConfig().catch(() => null)
          if (stored) {
            await requestPaktiApi(`/api/chat-sends/${encodeURIComponent(activeAutoJob.id)}/cancelled`, stored, {
              method: 'POST',
              body: JSON.stringify({ error: error instanceof Error ? error.message : 'Percakapan Shopee tidak ditemukan.' }),
            }).catch(() => undefined)
          }
          return
        }
      }
      console.warn('[Pakti] autoRunPending gagal', error)
    }
    finally {
      autoRunBusy = false
    }
  }
  autoRunStartTimer = setTimeout(autoRunPending, 1800)
  autoRunInterval = setInterval(autoRunPending, 5000)
}

if (isShopeeShippingOrderPage()) {
  let lastShippingScanError = ''
  const scanShippingChats = () => prepareVisibleShippingChats().catch((error) => {
    const message = error instanceof Error ? error.message : 'Shipping scan gagal.'
    if (message === lastShippingScanError) return
    lastShippingScanError = message
    console.warn('[Pakti] shipping scan gagal', error)
  })
  setTimeout(scanShippingChats, 2500)
  setInterval(scanShippingChats, 15000)
}
