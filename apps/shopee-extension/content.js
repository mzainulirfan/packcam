function textOf(element) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function textLinesOf(element) {
  const raw = element?.innerText || element?.textContent || ''
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
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

function isOrderMetadataText(value) {
  const text = String(value || '').trim()
  if (!text) return true
  return /^(?:x\s*\d+|rp\s*[\d.]+|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\b|spx\s+instan\b|instant\b|instan\b|pesan\s*:|variasi\s*:|variation\s*:|varian\s*:|sku\s*:|no\. pesanan\b|nomor pesanan\b|order id\b|resi\b|no\. resi\b|jasa kirim\b|kurir\b|ekspedisi\b|username pembeli\b|buyer username\b|pembeli\b|status\b)/i.test(text)
}

function cleanProductText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text || isOrderMetadataText(text)) return null

  return text
    .replace(/\s*(?:variasi\s*:|variation\s*:|varian\s*:|pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\s+(?:instan|instant)\b).*$/i, '')
    .replace(/\s*x\s*\d+.+$/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim() || null
}

function deriveProductName(element) {
  const selectorText = textOf(element.querySelector('.item-name, [class*="item-name" i], [class*="product-name" i], [data-testid*="product-name" i], [data-testid*="item-name" i], [title]'))
  const fromSelector = cleanProductText(selectorText)
  if (fromSelector) return fromSelector

  const imageAlt = [...element.querySelectorAll('img')]
    .map((img) => cleanProductText(img.alt || img.title || ''))
    .find(Boolean)
  if (imageAlt) return imageAlt

  const line = textLinesOf(element)
    .map(cleanProductText)
    .find((value) => value && value.length >= 3)
  return line || null
}

function cleanVariationText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return null

  return text
    .replace(/\s*x\s*\d+.+$/i, '')
    .replace(/\s*x\s*\d+\s*(?:pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\s+(?:instan|instant)\b).*$/i, '')
    .replace(/\s*(?:pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\s+(?:instan|instant)\b).*$/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim() || null
}

function parseOrderNumber(text) {
  return firstMatch(text, [/(?:No\.\s*Pesanan|Nomor Pesanan|Order ID|Order Number)\s*([A-Z0-9-]{8,})/i])
}

function parseTrackingNumber(text) {
  return firstMatch(text, [
    /(?:no\.\s*resi|nomor resi|resi|tracking number|air waybill)[:\s#-]*([A-Z0-9-]{8,})/i,
    /\b(SPX[A-Z0-9-]{8,})\b/i,
  ])
}

function parseBuyerUsername(text) {
  const matched = firstMatch(text, [
    /(?:username pembeli|buyer username)[:\s-]*@?([A-Za-z0-9._-]{3,})/i,
    /\bpembeli\s*[:\-]\s*@?([A-Za-z0-9._-]{3,})/i,
    /\b(?:buyer|user|username)[:\s-]*@?([A-Za-z0-9._-]{3,})/i,
  ])
  if (matched) return matched

  const standalone = String(text || '').trim().match(/^@?([A-Za-z0-9._-]{3,40})$/)
  return standalone?.[1] ?? null
}

function readBuyerLineCandidates(root) {
  const lines = textLinesOf(root)
  const result = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const normalized = line.toLowerCase()
    if (normalized.includes('username pembeli') || normalized.includes('buyer username') || normalized === 'pembeli') {
      result.push(line)
      if (lines[index + 1]) result.push(lines[index + 1])
      if (lines[index + 2]) result.push(lines[index + 2])
    }
  }

  return result
}

function readBuyerUsername(root, fullText) {
  const candidates = [
    textOf(root.querySelector('.buyer-username')),
    ...[...root.querySelectorAll('[class*="buyer" i], [data-testid*="buyer" i], [class*="user" i], [data-testid*="user" i]')].map(textOf),
    findLabelValue(root, ['username pembeli', 'buyer username', 'pembeli']),
    ...readBuyerLineCandidates(root),
    firstMatch(fullText, [/(?:username pembeli|buyer username)[:\s-]*@?([A-Za-z0-9._-]{3,})/i]),
  ]

  for (const value of candidates) {
    const username = parseBuyerUsername(value)
    if (username) return username
  }

  return null
}

function uniqueItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.productName.replace(/\s+/g, ' ').trim().toLowerCase()}|${(item.variationName || '').replace(/\s+/g, ' ').trim().toLowerCase()}|${item.quantity}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeOrderData(existing, next) {
  if (!existing) return next
  return {
    ...existing,
    trackingNumber: existing.trackingNumber || next.trackingNumber || null,
    buyerUsername: existing.buyerUsername || next.buyerUsername || null,
    shippingChannel: existing.shippingChannel || next.shippingChannel || null,
    orderStatus: existing.orderStatus || next.orderStatus || null,
    rawPayload: {
      ...(typeof existing.rawPayload === 'object' && existing.rawPayload !== null ? existing.rawPayload : {}),
      ...(typeof next.rawPayload === 'object' && next.rawPayload !== null ? next.rawPayload : {}),
    },
    items: uniqueItems([...(existing.items || []), ...(next.items || [])]),
  }
}

function extractAttributeItems(root) {
  const entries = [...root.querySelectorAll('img[alt], img[title], [title], [aria-label]')]
    .map((element) => {
      const text = cleanProductText(element.getAttribute('alt') || element.getAttribute('title') || element.getAttribute('aria-label') || '')
      if (!text || text.length < 3) return null
      if (/^(?:foto|gambar|image|produk|product|lihat|detail|salin|copy|chat|pesanan|order)$/i.test(text)) return null
      const containerText = textOf(element.closest('[class*="item" i], [class*="product" i]')) || text
      return {
        sku: null,
        productName: text.slice(0, 220),
        variationName: null,
        quantity: parseQuantity(containerText),
        imageUrl: element instanceof HTMLImageElement ? element.src : element.querySelector('img')?.src || null,
      }
    })
    .filter(Boolean)

  return uniqueItems(entries).slice(0, 20)
}

function extractLineItems(root) {
  const lines = textLinesOf(root)
  const entries = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const productName = cleanProductText(line)
    if (!productName || productName.length < 8 || productName.length > 220) continue
    if (/^@?[a-z0-9._-]{3,40}$/i.test(productName)) continue
    if (/^[A-Z0-9-]{8,}$/i.test(productName)) continue
    if (/^(?:lihat rincian|rincian|detail|ubah|batalkan|atur pengiriman|cetak|print|kirim|chat|label|invoice|semua|pilih|selesai)$/i.test(productName)) continue

    const nearbyText = [line, lines[index + 1] || '', lines[index + 2] || ''].join(' ')
    entries.push({
      sku: firstMatch(nearbyText, [/sku[:\s]+([^|,]+)/i]) || null,
      productName: productName.slice(0, 220),
      variationName: cleanVariationText(firstMatch(nearbyText, [/(?:variasi|variation|varian)\s*[:\-]\s*([^|,]+)/i]) || null),
      quantity: parseQuantity(nearbyText),
      imageUrl: null,
    })
  }

  return uniqueItems(entries).slice(0, 20)
}

function extractShopeeItems(root) {
  const itemElements = [...root.querySelectorAll('.order-item-infos .item-list .item, [data-testid="order-item-infos"] .item-list .item, [class*="item" i][class*="product" i], .shopee-order-item, [data-testid*="item" i]')]

  const shopeeItems = itemElements
    .map((element) => {
      const productName = deriveProductName(element)
      if (!productName || productName.length < 3) {
        return null
      }

      const amountText = textOf(element.querySelector('.item-amount, [class*="amount" i], [class*="quantity" i], [class*="qty" i]'))
      const variationText = cleanVariationText(
        textOf(element.querySelector('.item-variation, [class*="variation" i], [class*="variant" i], [data-testid*="variation" i]')) ||
        firstMatch(textOf(element), [/(?:variasi|variation|varian)\s*[:\-]\s*([^|\n]+)/i]) ||
        null,
      )
      const sku = textOf(element.querySelector('[class*="sku" i]')) || firstMatch(textOf(element), [/sku[:\s]+([^|,]+)/i]) || null
      const image = element.querySelector('img')
      const fallbackText = textOf(element)

      return {
        sku: sku ? sku.slice(0, 80) : null,
        productName: productName.slice(0, 220),
        variationName: variationText ? variationText.slice(0, 160) : null,
        quantity: parseQuantity(amountText || fallbackText),
        imageUrl: image?.src || null,
      }
    })
    .filter(Boolean)

  return uniqueItems(shopeeItems)
}

function extractItems(root) {
  const shopeeItems = extractShopeeItems(root)
  if (shopeeItems.length > 0) {
    return shopeeItems
  }

  const lineItems = extractLineItems(root)
  if (lineItems.length > 0) {
    return lineItems
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

  const fallbackItems = unique.slice(0, 20).map((candidate) => {
    const image = candidate.element.querySelector('img')
    const productName = deriveProductName(candidate.element) || cleanProductText(candidate.text) || 'Unknown item'
    return {
      sku: firstMatch(candidate.text, [/sku[:\s]+([^|,]+)/i]) || null,
      productName: productName.slice(0, 220),
      variationName: cleanVariationText(firstMatch(candidate.text, [/(?:variasi|variation)[:\s]+([^|,]+)/i]) || null),
      quantity: parseQuantity(candidate.text),
      imageUrl: image?.src || null,
    }
  }).filter((item) => item.productName !== 'Unknown item')

  if (fallbackItems.length > 0) {
    return uniqueItems(fallbackItems)
  }

  return extractAttributeItems(root)
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
    parseTrackingNumber(fullText)

  if (!orderNumber) {
    return null
  }

  const items = extractItems(root)
  const shippingChannel =
    textOf(root.querySelector('.fulfilment-channel-name, [class*="shipping" i][class*="channel" i], [class*="logistic" i], [data-testid*="shipping" i]')) ||
    findLabelValue(root, ['jasa kirim', 'kurir', 'shipping', 'logistics', 'ekspedisi']) ||
    firstMatch(fullText, [/(?:jasa kirim|kurir|ekspedisi)\s*[:\-]\s*([A-Za-z0-9 ]{3,30})/i]) ||
    null

  return {
    source: 'shopee',
    orderNumber,
    trackingNumber,
    buyerUsername: readBuyerUsername(root, fullText),
    shippingChannel,
    orderStatus: firstMatch(fullText, [/(?:status)\s*[:\-]\s*([A-Za-z ]{3,30})/i]) || null,
    rawPayload: { fullText: fullText.slice(0, 4000), orderSnText: orderSnText.slice(0, 200) },
    items,
  }
}

function extractOrders() {
  const containers = [
    ...document.querySelectorAll('[data-testid^="package-card-"], .order-card, [data-testid="order-item"], [class*="OrderCard"], [class*="order-detail"], [class*="product" i], [class*="item" i]'),
  ]
  const roots = containers.length > 0 ? containers : [document.body]
  const orders = roots.map(extractOrderFromRoot).filter(Boolean)
  const byOrderNumber = new Map()

  for (const order of orders) {
    byOrderNumber.set(order.orderNumber, mergeOrderData(byOrderNumber.get(order.orderNumber), order))
  }

  return [...byOrderNumber.values()]
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
  if (!isShopeeOrderPage()) return extractOrders()

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
  return isShopeeOrderPage('shipping')
}

function getShopeeOrderPageType() {
  try {
    const url = new URL(location.href)
    if (!isShopeeSellerHostname(url.hostname) || url.pathname !== '/portal/sale/order') return null
    return url.searchParams.get('type') || 'unknown'
  } catch {
    return null
  }
}

function isShopeeOrderPage(expectedType = null) {
  const pageType = getShopeeOrderPageType()
  if (!pageType) return false
  return expectedType ? pageType === expectedType : true
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

async function syncVisibleShopeeOrdersAndMaybePrepareShipping() {
  if (!isShopeeOrderPage()) return null

  const orders = await extractOrdersWithLightScroll()
  const orderInputs = orders
    .filter((order) => order.orderNumber)
    .map((order) => ({
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber || null,
      buyerUsername: order.buyerUsername || null,
    }))
  if (orderInputs.length === 0) return { imported: null, shipping: null, visibleOrderCount: 0 }

  const pageType = getShopeeOrderPageType() || 'unknown'
  const signature = orderInputs.map((o) => [o.orderNumber, o.trackingNumber || '', o.buyerUsername || ''].join(':')).join('|')
  const signatureKey = `pakti:lastOrderScan:${pageType}`
  if (sessionStorage.getItem(signatureKey) === signature) return null

  const config = await readExtensionConfig()
  const imported = await requestPaktiApi('/api/import/shopee/orders', config, {
    method: 'POST',
    body: JSON.stringify({ orders }),
  })
  let shipping = null
  if (pageType === 'shipping') {
    shipping = await requestPaktiApi('/api/shopee/shipping-chat/prepare', config, {
      method: 'POST',
      body: JSON.stringify({ orders: orderInputs }),
    })
    sessionStorage.setItem('pakti:lastShippingScan', signature)
  }
  sessionStorage.setItem(signatureKey, signature)
  console.info('[Pakti] Shopee orders auto synced', { pageType, visibleOrderCount: orderInputs.length, imported, shipping })
  return { imported, shipping, visibleOrderCount: orderInputs.length }
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
          `File: ${(job.attachments || []).map((attachment) => attachment.fileUrl || attachment.filePath).filter(Boolean).join(', ') || job.videoUrl || '-'}`,
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
function clickSendButton(composer) {
  const root = findComposerRoot(composer) || document
  const shopeeSendButton = root.querySelector('.XsR3zIeGOc') || root.querySelector('.kgP1yPCqxR')?.closest('.XsR3zIeGOc, button, [role="button"], div')
  if (isSafeClickableButton(shopeeSendButton)) {
    shopeeSendButton.click()
    shopeeSendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return true
  }

  const labeledButton = [
    ...root.querySelectorAll('button, [role="button"], [aria-label], [title], [data-testid]'),
  ].find((element) => {
    if (!(element instanceof HTMLElement) || element.offsetParent === null) return false
    if (element.matches('input[type="checkbox"], input[type="radio"]')) return false
    if (element.getAttribute('aria-checked') !== null) return false
    const label = `${textOf(element)} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('data-testid') || ''}`.trim()
    return /(^|\b)(send|kirim|发送|submit)(\b|$)/i.test(label)
  })
  const iconButton =
    root.querySelector('div.XsR3zIeGOc') ||
    root.querySelector('i.kgP1yPCqxR')?.closest('button, [role="button"], div') ||
    root.querySelector('svg.chat-icon')?.closest('button, [role="button"], div')
  const sendBtn = labeledButton || (isSafeClickableButton(iconButton) ? iconButton : null)
  if (sendBtn) {
    sendBtn.click()
    sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return true
  }
  return false
}

function buildShippingInfoMessage(job) {
  return [
    `Halo kak ${job.buyerUsername || ''}, pesanan kakak ${job.orderNumber || '-'} dengan resi ${job.trackingNumber || job.resiNumber || '-'} sudah masuk proses pengiriman.`,
    '',
    'Silakan pantau update pengiriman melalui aplikasi Shopee ya kak. Terima kasih sudah berbelanja.',
  ].join('\n')
}

function isSafeClickableButton(element) {
  if (!(element instanceof HTMLElement) || element.offsetParent === null) return false
  if (element.matches('input[type="checkbox"], input[type="radio"]')) return false
  if (element.getAttribute('aria-checked') !== null) return false
  return true
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
  const normalizedMessage = String(message || '').trim()
  if (!normalizedMessage) throw new Error('Pesan Shopee kosong, chat tidak dikirim.')

  let composer = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    composer = findComposerInput()
    if (composer) break
    await new Promise((r) => setTimeout(r, 300))
  }
  if (!composer) throw new Error('Composer pesan Shopee Webchat tidak ditemukan.')

  console.info('[Pakti] mengisi composer Shopee', {
    tag: composer.tagName,
    role: composer.getAttribute('role'),
    contenteditable: composer.getAttribute('contenteditable'),
    placeholder: composer.getAttribute('placeholder') || composer.getAttribute('aria-label') || '',
    messagePreview: normalizedMessage.slice(0, 80),
  })

  composer.focus()
  composer.click()

  // Masukkan teks dan validasi sebelum mengirim agar tidak ada chat kosong.
  await writeComposerText(composer, normalizedMessage)

  // Tunggu React memproses input
  const normalizedProbe = normalizedMessage.replace(/\s+/g, ' ').trim().slice(0, Math.min(24, normalizedMessage.length))
  const insertedText = await waitForCondition(() => {
    const value = getComposerText(composer)
    return value.includes(normalizedProbe) ? value : null
  }, 5000, 150)
  if (!insertedText) {
    throw new Error('Pesan Shopee tidak muncul di composer setelah diisi.')
  }

  pressEnterToSend(composer)
  await new Promise((r) => setTimeout(r, 1200))
  const textAfterEnter = getComposerText(composer)
  if (!textAfterEnter) return true

  // Fallback kalau Enter tidak diproses oleh Shopee Webchat.
  if (clickSendButton(composer)) {
    await new Promise((r) => setTimeout(r, 1200))
    const textAfterClick = getComposerText(composer)
    if (!textAfterClick) return true
  }
  throw new Error('Tombol kirim Shopee Webchat tidak ditemukan.')
}

function pressEnterToSend(composer) {
  composer.focus()
  composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
  composer.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
  composer.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
}

function getComposerText(composer) {
  return (composer.isContentEditable ? composer.textContent : composer.value)?.replace(/\s+/g, ' ').trim() || ''
}

function findComposerRoot(composer) {
  if (!(composer instanceof HTMLElement)) return null
  return (
    composer.closest('.RtZKVef1GL') ||
    composer.closest('.yKlwrqauc8') ||
    composer.closest('[data-testid*="composer" i], [class*="composer" i], [class*="input" i], [class*="footer" i], form') ||
    composer.parentElement?.parentElement?.parentElement ||
    composer.parentElement
  )
}

function selectEditableContents(element) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function dispatchTextEvents(element, text) {
  element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function writeComposerText(composer, text) {
  if (composer.matches('textarea, input')) {
    composer.focus()
    composer.click()
    if (typeof composer.setSelectionRange === 'function') {
      composer.setSelectionRange(0, composer.value?.length || 0)
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), 'value')?.set
    if (setter) setter.call(composer, text)
    else composer.value = text
    if (composer._valueTracker) {
      composer._valueTracker.setValue('')
    }
    dispatchTextEvents(composer, text)
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (getComposerText(composer)) return

    document.execCommand('insertText', false, text)
    dispatchTextEvents(composer, text)
    return
  }

  composer.focus()
  selectEditableContents(composer)
  document.execCommand('delete', false)
  const inserted = document.execCommand('insertText', false, text)
  dispatchTextEvents(composer, text)
  if (inserted && getComposerText(composer)) return

  const dataTransfer = new DataTransfer()
  dataTransfer.setData('text/plain', text)
  composer.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer }))
  await new Promise((resolve) => setTimeout(resolve, 150))
  if (getComposerText(composer)) return

  composer.textContent = text
  dispatchTextEvents(composer, text)
}

function isEditableElement(element) {
  if (!(element instanceof HTMLElement) || element.offsetParent === null) return false
  const rect = element.getBoundingClientRect()
  if (rect.width < 120 || rect.height < 16 || rect.height > 260) return false
  if (rect.bottom < window.innerHeight * 0.45) return false
  if (element.closest('[role="listbox"], [role="option"]')) return false
  if (element.matches('textarea, input')) {
    const type = element.getAttribute('type') || ''
    if (/checkbox|radio|file|hidden|search/i.test(type)) return false
    return !element.disabled && !element.readOnly
  }

  return element.isContentEditable || element.getAttribute('contenteditable') === 'true' || element.getAttribute('contenteditable') === 'plaintext-only'
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

  const shopeeTextarea = document.querySelector('.RtZKVef1GL textarea.E2MWg3w8y6[placeholder="Tulis pesan"], textarea.E2MWg3w8y6[placeholder="Tulis pesan"], textarea[placeholder="Tulis pesan"]')
  if (shopeeTextarea instanceof HTMLTextAreaElement && shopeeTextarea.offsetParent !== null && !shopeeTextarea.disabled && !shopeeTextarea.readOnly) return shopeeTextarea

  const selectors = [
    'textarea.E2MWg3w8y6',
    'textarea[placeholder*="Tulis" i]',
    'textarea[placeholder*="pesan" i]',
    'textarea[placeholder*="Ketik" i]',
    'textarea[placeholder*="Type" i]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="plaintext-only"][role="textbox"]',
    '[contenteditable="true"][aria-label*="pesan" i]',
    '[contenteditable="plaintext-only"][aria-label*="pesan" i]',
    '[contenteditable="true"][aria-label*="message" i]',
    '[contenteditable="plaintext-only"][aria-label*="message" i]',
    '[contenteditable="true"][placeholder*="pesan" i]',
    '[contenteditable="plaintext-only"][placeholder*="pesan" i]',
    '[contenteditable="true"][placeholder*="Ketik" i]',
    '[contenteditable="plaintext-only"][placeholder*="Ketik" i]',
    '[role="textbox"][contenteditable="true"]',
    '[role="textbox"][contenteditable="plaintext-only"]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
  ]

  for (const selector of selectors) {
    const match = [...document.querySelectorAll(selector)].find(isEditableElement)
    if (match) return match
  }

  return null
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeUsername(value) {
  return normalizeText(value).replace(/^@+/, '')
}

function findConversationTarget(username) {
  if (!isShopeeWebchatPage()) return null

  const normalizedUsername = normalizeUsername(username)
  const candidates = [
    ...document.querySelectorAll(
      '[data-testid*="conversation" i], [data-testid*="chat" i], [class*="conversation" i], [class*="chat-item" i], ' +
        '[class*="user-item" i], [class*="message-list" i], [class*="SW7LUhQFDH"], [class*="AxOomp7jNy"], [role="option"], [role="listitem"], li, a, button',
    ),
  ]

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement) || candidate.offsetParent === null) continue
    if (candidate.matches('input[type="checkbox"], input[type="radio"], [role="checkbox"]')) continue
    const candidateText = normalizeUsername(textOf(candidate))
    if (!candidateText || candidateText.length > 320 || !candidateText.includes(normalizedUsername)) continue

    const rect = candidate.getBoundingClientRect()
    if (rect.width < 20 || rect.height < 20) continue
    return candidate
  }

  return null
}

function getVisibleElementRect(element) {
  if (!(element instanceof HTMLElement) || element.offsetParent === null) return null
  const rect = element.getBoundingClientRect()
  if (rect.width < 20 || rect.height < 18) return null
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return null
  return rect
}

function findSearchSuggestionTarget(username, input, allowFirstResult = false) {
  if (!isShopeeWebchatPage() || !(input instanceof HTMLElement)) return null

  const inputRect = input.getBoundingClientRect()
  const normalizedUsername = normalizeUsername(username)
  const candidates = [
    ...document.querySelectorAll(
      '[role="option"], [role="listitem"], li, a, button, ' +
        '[class*="conversation" i], [class*="chat-item" i], [class*="user-item" i], [class*="result" i], [class*="item" i], div',
    ),
  ]

  return candidates
    .map((candidate) => {
      if (!(candidate instanceof HTMLElement)) return null
      if (candidate === input || candidate.contains(input)) return null
      if (candidate.closest('.RtZKVef1GL, .yKlwrqauc8')) return null
      if (candidate.matches('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"], input[type="checkbox"], input[type="radio"], [role="checkbox"]')) return null

      const rect = getVisibleElementRect(candidate)
      if (!rect) return null
      if (rect.top < inputRect.bottom - 12) return null
      if (rect.left > inputRect.right + 520 || rect.right < inputRect.left - 24) return null
      if (rect.height > 120 || rect.width > Math.max(720, inputRect.width + 420)) return null

      const candidateText = normalizeUsername(textOf(candidate))
      if (!candidateText || candidateText.length > 320) return null
      if (!allowFirstResult && !candidateText.includes(normalizedUsername)) return null

      const clickable = candidate.closest('button, a, [role="option"], [role="listitem"], li, [class*="item" i], [class*="conversation" i], [class*="chat" i]') || candidate
      if (!(clickable instanceof HTMLElement)) return null
      const clickableRect = getVisibleElementRect(clickable)
      if (!clickableRect) return null

      return {
        element: clickable,
        top: clickableRect.top,
        left: clickableRect.left,
        area: clickableRect.width * clickableRect.height,
        exact: candidateText.split(/\s+/).includes(normalizedUsername),
      }
    })
    .filter(Boolean)
    .sort((left, right) => Number(right.exact) - Number(left.exact) || left.top - right.top || left.left - right.left || left.area - right.area)[0]?.element || null
}

function clickConversationTarget(target) {
  const rect = target.getBoundingClientRect()
  const clickPoints = [0.35, 0.55, 0.75]

  for (const ratio of clickPoints) {
    const clientX = Math.min(rect.right - 12, rect.left + Math.max(24, rect.width * ratio))
    const clientY = rect.top + rect.height / 2
    const clickTarget = document.elementFromPoint(clientX, clientY)
    const safeTarget = clickTarget instanceof HTMLElement && !clickTarget.matches('input[type="checkbox"], input[type="radio"], [role="checkbox"]')
      ? clickTarget
      : target

    safeTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
    safeTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY }))
    safeTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
    safeTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY }))
    safeTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY }))
  }

  try { target.click() } catch (error) {}
}

async function openConversationFromSearch(username, input) {
  const startedAt = Date.now()
  let lastTarget = null

  while (Date.now() - startedAt < 9000) {
    const target = findConversationTarget(username) || findSearchSuggestionTarget(username, input) || findSearchSuggestionTarget(username, input, true)
    if (target) {
      lastTarget = target
      target.scrollIntoView?.({ block: 'center', inline: 'nearest' })
      await new Promise((resolve) => setTimeout(resolve, 120))
      clickConversationTarget(target)

      const composer = await waitForCondition(() => {
        const activeComposer = findComposerInput()
        if (!activeComposer) return null
        return findActiveConversationHeader(username, activeComposer) ? activeComposer : null
      }, 1800, 150)
      if (composer) return composer
    }

    await new Promise((resolve) => setTimeout(resolve, lastTarget ? 450 : 250))
  }

  return null
}

function findActiveConversationHeader(username, composer = null) {
  if (!isShopeeWebchatPage()) return null

  const normalizedUsername = normalizeUsername(username)
  const composerRect = composer instanceof HTMLElement ? composer.getBoundingClientRect() : null
  const candidates = [
    ...document.querySelectorAll(
      '[data-testid*="header" i], [class*="header"], [class*="conversation-title"], [class*="chat-title"], h1, h2, h3, [role="heading"], span, div',
    ),
  ]

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement) || candidate.offsetParent === null) continue
    if (candidate.closest('[role="listbox"], [role="option"], [class*="search" i], [class*="list" i]')) continue
    if (candidate.closest('.RtZKVef1GL, .yKlwrqauc8')) continue
    const rect = candidate.getBoundingClientRect()
    if (composerRect) {
      const inConversationPane = rect.left >= composerRect.left - 80 && rect.right <= composerRect.right + 80 && rect.bottom <= composerRect.top + 20
      if (!inConversationPane) continue
    }
    const candidateText = normalizeUsername(candidate.textContent)
    if (candidateText && candidateText.length <= 240 && candidateText.includes(normalizedUsername)) {
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
  const composer = await waitForCondition(() => findComposerInput(), timeoutMs, 200)
  if (!composer) {
    throw new Error('Composer pesan Shopee belum siap setelah memilih pembeli.')
  }

  return composer
}

async function waitForActiveConversation(username, composer = null) {
  const header = await waitForCondition(() => findActiveConversationHeader(username, composer), 10000, 250)
  if (!header) {
    throw new Error(`Percakapan aktif belum terkonfirmasi untuk ${username}; pesan tidak dikirim agar tidak salah pembeli.`)
  }

  return header
}

function getJobAttachments(job) {
  const attachments = Array.isArray(job.attachments) ? job.attachments : []
  if (attachments.length > 0) {
    return attachments.filter((attachment) => attachment?.fileUrl)
  }

  return job.videoUrl
    ? [{ fileUrl: job.videoUrl, fileName: `${(job.orderNumber || job.resiNumber || 'pakti-video').replace(/[^\w-]+/g, '_')}.mp4`, mimeType: 'video/mp4' }]
    : []
}

function inferAttachmentName(attachment, fallbackName) {
  if (attachment.fileName) return attachment.fileName
  const fromPath = String(attachment.filePath || attachment.fileUrl || '').split('?')[0].split('/').pop()
  return fromPath || fallbackName
}

async function downloadJobAttachment(attachment, index, headers) {
  const response = await fetch(attachment.fileUrl, { credentials: 'include', headers })
  if (!response.ok) {
    throw new Error(`File Shopee gagal diunduh (${response.status}).`)
  }

  const blob = await response.blob()
  const fallbackName = index === 0 ? 'pakti-video.mp4' : `pakti-attachment-${index + 1}`
  const fileName = inferAttachmentName(attachment, fallbackName).replace(/[<>:"/\\|?*\0]+/g, '_')
  const mimeType = attachment.mimeType || blob.type || (fileName.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/) ? 'image/jpeg' : 'video/mp4')
  return new File([blob], fileName, { type: mimeType })
}

function fileKind(file) {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov')) return 'video'
  if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|webp)$/)) return 'image'
  return 'file'
}

function fileInputAccepts(input, kind) {
  const accept = String(input.getAttribute('accept') || '').toLowerCase()
  if (!accept) return true
  if (kind === 'video') return accept.includes('video') || accept.includes('.mp4') || accept.includes('.webm') || accept.includes('.mov')
  if (kind === 'image') return accept.includes('image') || accept.includes('.jpg') || accept.includes('.jpeg') || accept.includes('.png') || accept.includes('.webp')
  return true
}

function isSpecificFileInput(input, kind) {
  const accept = String(input.getAttribute('accept') || '').toLowerCase()
  if (kind === 'video') return accept.includes('video') || accept.includes('.mp4') || accept.includes('.webm') || accept.includes('.mov')
  if (kind === 'image') return accept.includes('image') || accept.includes('.jpg') || accept.includes('.jpeg') || accept.includes('.png') || accept.includes('.webp')
  return false
}

function findFileInput(kind) {
  const inputs = [...document.querySelectorAll('input[type="file"]')]
  return (
    inputs.find((input) => isSpecificFileInput(input, kind)) ||
    inputs.find((input) => fileInputAccepts(input, kind) && !isSpecificFileInput(input, kind === 'video' ? 'image' : 'video')) ||
    inputs.find((input) => fileInputAccepts(input, kind)) ||
    null
  )
}

async function ensureFileInputsReady() {
  let inputs = [...document.querySelectorAll('input[type="file"]')]
  if (inputs.length > 0) return inputs

  const attachBtn = document.querySelector(
    'button[class*="attach"], [aria-label*="attach" i], [aria-label*="lampir" i], [title*="attach" i], [title*="lampir" i], [data-testid*="attach" i]',
  )
  if (!attachBtn) {
    throw new Error('Tombol lampirkan file Shopee tidak ditemukan.')
  }

  attachBtn.click()
  await new Promise((r) => setTimeout(r, 1200))
  inputs = await waitForCondition(() => {
    const matches = [...document.querySelectorAll('input[type="file"]')]
    return matches.length > 0 ? matches : null
  }, 5000, 200)
  return inputs || []
}

async function attachFilesToShopee(files, kind) {
  const fileInput = findFileInput(kind)
  if (!fileInput) {
    throw new Error(`Input file Shopee untuk ${kind === 'video' ? 'video' : kind === 'image' ? 'foto' : 'file'} tidak ditemukan.`)
  }

  const dt = new DataTransfer()
  files.forEach((file) => dt.items.add(file))
  fileInput.files = dt.files
  fileInput.dispatchEvent(new Event('input', { bubbles: true }))
  fileInput.dispatchEvent(new Event('change', { bubbles: true }))

  const attached = await waitForCondition(
    () => fileInput.files?.length === files.length && files.every((file, index) => fileInput.files[index]?.name === file.name),
    3000,
    150,
  )
  if (!attached) {
    throw new Error(`File Shopee untuk ${kind === 'video' ? 'video' : kind === 'image' ? 'foto' : 'lampiran'} belum terpasang ke input file.`)
  }

  await new Promise((r) => setTimeout(r, 1200))
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
  const composer = await openConversationFromSearch(job.buyerUsername, input)
  if (!composer) throw new Error(`Percakapan Shopee untuk ${job.buyerUsername} tidak ditemukan atau chatbox belum terbuka.`)
  const attachments = getJobAttachments(job)
  if (attachments.length > 0) {
    try {
      const stored = await new Promise((resolve) => chrome.storage.sync.get({ apiKey: '' }, resolve))
      const headers = stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : undefined
      const files = []
      for (let index = 0; index < attachments.length; index += 1) {
        files.push(await downloadJobAttachment(attachments[index], index, headers))
      }
      await ensureFileInputsReady()
      const videoFiles = files.filter((file) => fileKind(file) === 'video')
      const imageFiles = files.filter((file) => fileKind(file) === 'image')
      const otherFiles = files.filter((file) => fileKind(file) === 'file')
      const hasVideoSpecificInput = Boolean([...document.querySelectorAll('input[type="file"]')].find((input) => isSpecificFileInput(input, 'video')))
      const hasImageSpecificInput = Boolean([...document.querySelectorAll('input[type="file"]')].find((input) => isSpecificFileInput(input, 'image')))

      if (videoFiles.length > 0 && imageFiles.length > 0 && (hasVideoSpecificInput || hasImageSpecificInput)) {
        await attachFilesToShopee(videoFiles, 'video')
        await attachFilesToShopee(imageFiles, 'image')
        if (otherFiles.length > 0) await attachFilesToShopee(otherFiles, 'file')
      } else {
        await attachFilesToShopee(files, videoFiles.length > 0 ? 'video' : imageFiles.length > 0 ? 'image' : 'file')
      }
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'File Shopee gagal dipasang.')
    }
  }
  if (!job.message) {
    throw new Error('Pesan Shopee kosong, chat tidak dikirim.')
  }

  return await sendComposerMessage(job.message)
}

// Kirim chat otomatis hanya dari tab Shopee Webchat, bukan sidebar/minichat Seller Center.
{
  let lastAutoJobId = ''
  let lastShippingAutoJobId = ''
  let autoRunBusy = false
  let autoRunStartTimer = null
  let autoRunInterval = null
  let webchatAutoRunStarted = false

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
      const sent = await fillWebchatSearchAndAttach({ ...job, message: job.message || buildShippingInfoMessage(job) })
      if (!sent) {
        throw new Error('Tombol kirim Shopee Webchat tidak ditemukan.')
      }
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/prepared`, config, { method: 'POST' })
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/sent`, config, { method: 'POST' })
      
      // Bersihkan pencarian untuk job berikutnya
      clearSearchInput()
      lastShippingAutoJobId = job.id
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
      lastShippingAutoJobId = job.id
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
    if (!isShopeeWebchatPage()) return
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
        if (shippingJob?.id && shippingJob.id === lastShippingAutoJobId) return
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
        const stored = await readExtensionConfig().catch(() => null)
        const errorMessage = error instanceof Error ? error.message : 'Extension gagal mengirim Shopee Webchat.'
        if (isBuyerNotFoundError(error)) {
          if (stored) {
            await requestPaktiApi(`/api/chat-sends/${encodeURIComponent(activeAutoJob.id)}/cancelled`, stored, {
              method: 'POST',
              body: JSON.stringify({ error: errorMessage || 'Percakapan Shopee tidak ditemukan.' }),
            }).catch(() => undefined)
          }
          return
        }
        if (stored) {
          await requestPaktiApi(`/api/chat-sends/${encodeURIComponent(activeAutoJob.id)}/failed`, stored, {
            method: 'POST',
            body: JSON.stringify({ error: errorMessage }),
          }).catch(() => undefined)
        }
      }
      console.warn('[Pakti] autoRunPending gagal', error)
    }
    finally {
      autoRunBusy = false
    }
  }
  function startWebchatAutoRun() {
    if (webchatAutoRunStarted || !isShopeeWebchatPage()) return
    webchatAutoRunStarted = true
    autoRunStartTimer = setTimeout(autoRunPending, 1800)
    autoRunInterval = setInterval(autoRunPending, 5000)
  }

  startWebchatAutoRun()
  setInterval(startWebchatAutoRun, 2500)
  window.addEventListener('focus', startWebchatAutoRun)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) startWebchatAutoRun()
  })
}

if (isShopeeSellerHostname(location.hostname)) {
  let lastOrderScanError = ''
  let orderScanBusy = false

  const scanShopeeOrders = () => {
    if (!isShopeeOrderPage() || orderScanBusy) return
    orderScanBusy = true
    syncVisibleShopeeOrdersAndMaybePrepareShipping()
      .then(() => {
        lastOrderScanError = ''
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Shopee order auto scan gagal.'
        if (message !== lastOrderScanError) {
          lastOrderScanError = message
          console.warn('[Pakti] Shopee order auto scan gagal', error)
        }
      })
      .finally(() => {
        orderScanBusy = false
      })
  }

  setTimeout(scanShopeeOrders, 2500)
  setInterval(scanShopeeOrders, 10 * 60 * 1000)
  window.addEventListener('focus', scanShopeeOrders)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scanShopeeOrders()
  })
}
