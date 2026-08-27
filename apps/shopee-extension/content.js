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

function isShopeeShippingOrderPage() {
  try {
    const url = new URL(location.href)
    return url.hostname === 'seller.shopee.co.id' && url.pathname === '/portal/sale/order' && url.searchParams.get('type') === 'shipping'
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
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'X-Pakti-Extension-Key': config.apiKey } : {}),
      ...(init.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Pakti API gagal: ${response.status}`)
  }

  return payload.data
}

async function prepareVisibleShippingChats() {
  if (!isShopeeShippingOrderPage()) return

  const orders = extractOrders()
  const orderInputs = orders
    .filter((order) => order.orderNumber)
    .map((order) => ({
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber || null,
      buyerUsername: order.buyerUsername || null,
    }))
  if (orderInputs.length === 0) return

  const signature = orderInputs.map((o) => o.orderNumber).join('|')
  if (sessionStorage.getItem('pakti:lastShippingScan') === signature) return

  const config = await readExtensionConfig()
  const result = await requestPaktiApi('/api/shopee/shipping-chat/prepare', config, {
    method: 'POST',
    body: JSON.stringify({ orders: orderInputs }),
  })
  sessionStorage.setItem('pakti:lastShippingScan', signature)
  console.info('[Pakti] shipping chat queue prepared', result)
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

        const orders = extractOrders()
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
        const result = await requestPaktiApi('/api/shopee/shipping-chat/prepare', config, {
          method: 'POST',
          body: JSON.stringify({ orders: orderInputs }),
        })
        sessionStorage.setItem('pakti:lastShippingScan', orderInputs.map((o) => o.orderNumber).join('|'))
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
        const input =
          document.querySelector('input.shopee-react-input__input[placeholder="Cari Semua"]') ||
          document.querySelector('input[placeholder="Cari Semua"]') ||
          document.querySelector('input[type="input"][placeholder*="Cari"]') ||
          document.querySelector('input[type="search"]')
        if (!input) {
          throw new Error('Field cari customer Shopee Webchat tidak ditemukan. Pastikan di halaman https://seller.shopee.co.id/new-webchat/conversations.')
        }

        input.focus()
        const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(input, job.buyerUsername || '')
        } else {
          input.value = job.buyerUsername || ''
        }
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))

        navigator.clipboard?.writeText([
          `Pembeli: ${job.buyerUsername || '-'}`,
          `No. Pesanan: ${job.orderNumber || '-'}`,
          `No. Resi: ${job.resiNumber || '-'}`,
          `Video: ${job.videoUrl || '-'}`,
          '',
          job.message || '',
        ].join('\n')).catch(() => undefined)

        // Tunggu hasil pencarian muncul, lalu coba klik conversation yang cocok (tanpa interaksi manual)
        await new Promise((resolve) => setTimeout(resolve, 1200))
        const username = (job.buyerUsername || '').trim()
        let clicked = false
        if (username) {
          const lower = username.toLowerCase()
          // Prioritaskan selector spesifik dari webchat list: span.nFvbiqyLrq
          const usernameSpans = [...document.querySelectorAll('span.nFvbiqyLrq')]
          for (const span of usernameSpans) {
            if (textOf(span).toLowerCase() === lower) {
              const row = span.closest('div.SW7LUhQFDH') || span.closest('div[class*="SW7LUhQFDH"]') || span.closest('div.uR4DA9zSmz')?.parentElement || span.parentElement?.closest('div')
              const target = row || span
              try {
                target.click()
                target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                clicked = true
                break
              } catch {}
            }
          }
          if (!clicked) {
            const candidates = [
              ...document.querySelectorAll('[class*="conversation"], [class*="chat-item"], [class*="user-item"], [data-testid*="conversation"], li, a, div'),
            ]
            for (const el of candidates) {
              const t = textOf(el)
              if (!t) continue
              if (t === username || t.toLowerCase() === lower || t.includes(username)) {
                if (t.length > 80) continue
                const rect = el.getBoundingClientRect()
                if (rect.width < 20 || rect.height < 20) continue
                try {
                  el.click()
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                  clicked = true
                  break
                } catch {}
              }
            }
          }
          if (clicked) {
            await new Promise((resolve) => setTimeout(resolve, 900))
          }
        }

        // Coba auto-attach video jika ada (best-effort, tidak gagalkan flow jika selector belum ketemu)
        if (job.videoUrl) {
          try {
            const stored = await new Promise((resolve) => chrome.storage.sync.get({ apiKey: '' }, resolve))
            const headers = stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : undefined
            const response = await fetch(job.videoUrl, { credentials: 'include', headers })
            if (response.ok) {
              const blob = await response.blob()
              const fileName = `${(job.orderNumber || job.resiNumber || 'pakti-video').replace(/[^\w-]+/g, '_')}.mp4`
              const file = new File([blob], fileName, { type: blob.type || 'video/mp4' })
              let fileInput = document.querySelector('input[accept*="video"]') || document.querySelector('input[type="file"]')
              if (!fileInput) {
                const attachBtn = document.querySelector('button[class*="attach"], [aria-label*="attach"], [aria-label*="Lampirkan"]')
                if (attachBtn) {
                  attachBtn.click()
                  await new Promise((resolve) => setTimeout(resolve, 600))
                  fileInput = document.querySelector('input[accept*="video"]') || document.querySelector('input[type="file"]')
                }
              }
              if (fileInput) {
                const dt = new DataTransfer()
                dt.items.add(file)
                fileInput.files = dt.files
                fileInput.dispatchEvent(new Event('input', { bubbles: true }))
                fileInput.dispatchEvent(new Event('change', { bubbles: true }))
              }
            } else {
              console.warn('[Pakti] video fetch status', response.status)
            }
          } catch (e) {
            console.warn('[Pakti] video fetch/attach gagal', e)
          }
        }
        if (job.message) {
          await sendComposerMessage(job.message)
        }

        sendResponse({ ok: true, autoClicked: clicked })
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
    document.querySelector('i.kgP1yPCqxR')?.parentElement
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
    composer =
      document.querySelector('textarea.E2MWg3w8y6') ||
      document.querySelector('textarea[placeholder="Tulis pesan"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('textarea') ||
      document.querySelector('div[role="textbox"]')
    if (composer) break
    await new Promise((r) => setTimeout(r, 300))
  }
  if (!composer) return false

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

  // Cara 2 (fallback): Klik tombol Send
  return clickSendButton()
}

function findSearchInput() {
  return (
    document.querySelector('#sidebar-minichat-list input[placeholder="Cari nama"]') ||
    document.querySelector('#sidebar-minichat-list input.shopee-react-input__input') ||
    document.querySelector('input.shopee-react-input__input[placeholder="Cari Semua"]') ||
    document.querySelector('input[placeholder="Cari Semua"]') ||
    document.querySelector('input[placeholder="Cari nama"]') ||
    document.querySelector('input[type="input"][placeholder*="Cari"]') ||
    document.querySelector('input[type="search"]')
  )
}

async function fillWebchatSearchAndAttach(job) {
  const input = findSearchInput()
  if (!input || !job?.buyerUsername) return false
  input.focus()
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  if (setter) setter.call(input, job.buyerUsername)
  else input.value = job.buyerUsername
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
  await new Promise((r) => setTimeout(r, 1300))
  const username = job.buyerUsername.trim().toLowerCase()
  let clicked = false
  const spans = [
    ...document.querySelectorAll('#sidebar-minichat-list span'),
    ...document.querySelectorAll('span.nFvbiqyLrq'),
    ...document.querySelectorAll('[class*="username"], [class*="name"]'),
  ]
  for (const span of spans) {
    if (textOf(span).toLowerCase() === username) {
      const row =
        span.closest('li') ||
        span.closest('div.SW7LUhQFDH') ||
        span.closest('div[class*="SW7LUhQFDH"]') ||
        span.closest('div.uR4DA9zSmz')?.parentElement ||
        span.parentElement?.closest('div')
      const target = row || span
      try {
        target.click()
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        clicked = true
        break
      } catch {}
    }
  }
  if (!clicked) {
    const candidates = [
      ...document.querySelectorAll('#sidebar-minichat-list li, #sidebar-minichat-list div, [class*="conversation"], [class*="chat-item"], [class*="user-item"], [data-testid*="conversation"], li, a, div'),
    ]
    for (const el of candidates) {
      const t = textOf(el)
      if (!t) continue
      if (t === username || t.toLowerCase() === username || t.includes(username)) {
        if (t.length > 80) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 20 || rect.height < 20) continue
        try {
          el.click()
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          clicked = true
          break
        } catch {}
      }
    }
  }
  if (clicked) await new Promise((r) => setTimeout(r, 900))
  if (job.videoUrl) {
    try {
      const stored = await new Promise((resolve) => chrome.storage.sync.get({ apiKey: '' }, resolve))
      const headers = stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : undefined
      const response = await fetch(job.videoUrl, { credentials: 'include', headers })
      if (response.ok) {
        const blob = await response.blob()
        const fileName = `${(job.orderNumber || job.resiNumber || 'pakti-video').replace(/[^\w-]+/g, '_')}.mp4`
        const file = new File([blob], fileName, { type: blob.type || 'video/mp4' })
        let fileInput = document.querySelector('input[accept*="video"]') || document.querySelector('input[type="file"]')
        if (!fileInput) {
          const attachBtn = document.querySelector('button[class*="attach"], [aria-label*="attach"], [aria-label*="Lampirkan"]')
          if (attachBtn) {
            attachBtn.click()
            await new Promise((r) => setTimeout(r, 600))
            fileInput = document.querySelector('input[accept*="video"]') || document.querySelector('input[type="file"]')
          }
        }
        if (fileInput) {
          const dt = new DataTransfer()
          dt.items.add(file)
          fileInput.files = dt.files
          fileInput.dispatchEvent(new Event('input', { bubbles: true }))
          fileInput.dispatchEvent(new Event('change', { bubbles: true }))
        }
      } else {
        console.warn('[Pakti] video fetch status', response.status)
      }
    } catch (e) {
      console.warn('[Pakti] video fetch/attach gagal', e)
    }
  }
  let sent = false
  if (job.message) {
    sent = await sendComposerMessage(job.message)
  }
  return sent || clicked
}

// Jalankan otomatis di background pada semua halaman seller Shopee (via minichat sidebar atau webchat)
if (/seller\.shopee\.co\.id/.test(location.href)) {
  let lastAutoJobId = sessionStorage.getItem('pakti:autoChatJobId') || ''
  let autoRunBusy = false

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
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/prepared`, config, { method: 'POST' })
      await new Promise((r) => setTimeout(r, 2200))
      if (!sent) {
        throw new Error('Tombol kirim Shopee Webchat / Minichat tidak ditemukan.')
      }
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/sent`, config, { method: 'POST' })
      await new Promise((r) => setTimeout(r, 9000))
      
      // Bersihkan pencarian untuk job berikutnya
      clearSearchInput()
      return true
    } catch (error) {
      await requestPaktiApi(`/api/shopee/shipping-chat/${encodeURIComponent(job.id)}/failed`, config, {
        method: 'POST',
        body: JSON.stringify({ error: error instanceof Error ? error.message : 'Extension gagal mengirim shipping chat.' }),
      }).catch(() => undefined)
      // Bersihkan pencarian jika gagal agar antrean tidak macet
      clearSearchInput()
      return false
    }
  }

  async function autoRunPending() {
    if (autoRunBusy) return
    autoRunBusy = true
    try {
      const stored = await readExtensionConfig()
      const base = stored.apiBaseUrl
      const res = await fetch(`${base}/api/chat-sends/pending`, {
        headers: stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : undefined,
      })
      const payload = await res.json().catch(() => null)
      if (!payload?.ok || !Array.isArray(payload.data) || payload.data.length === 0) {
        await autoRunShippingChat(stored)
        return
      }
      const job = payload.data[0]
      if (!job || job.id === lastAutoJobId) return
      const input = findSearchInput()
      // Hanya skip jika input sedang di-focus (user sedang mengetik manual)
      if (input?.value?.trim() && document.activeElement === input) return
      
      lastAutoJobId = job.id
      sessionStorage.setItem('pakti:autoChatJobId', job.id)
      const message = job.messageTemplate || `Halo kak ${job.buyerUsername || ''}, berikut video dokumentasi paket untuk pesanan ${job.orderNumber || '-'} resi ${job.resiNumber}.`
      await fillWebchatSearchAndAttach({ ...job, message })
      await fetch(`${base}/api/chat-sends/${encodeURIComponent(job.id)}/prepared`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : {}) },
      }).catch(() => undefined)
      // Tandai sent otomatis setelah auto-kirim, tidak perlu klik Mark manual
      await new Promise((r) => setTimeout(r, 2200))
      await fetch(`${base}/api/chat-sends/${encodeURIComponent(job.id)}/sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(stored.apiKey ? { 'X-Pakti-Extension-Key': stored.apiKey } : {}) },
      }).catch(() => undefined)

      // Bersihkan pencarian untuk job berikutnya
      clearSearchInput()
    } catch {}
    finally {
      autoRunBusy = false
    }
  }
  setTimeout(autoRunPending, 1800)
  setInterval(autoRunPending, 5000)
}

if (isShopeeShippingOrderPage()) {
  setTimeout(() => prepareVisibleShippingChats().catch((error) => console.warn('[Pakti] shipping scan gagal', error)), 2500)
  setInterval(() => prepareVisibleShippingChats().catch((error) => console.warn('[Pakti] shipping scan gagal', error)), 15000)
}

