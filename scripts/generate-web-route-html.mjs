import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = process.cwd()
const distRoot = resolve(root, 'dist')
const appShell = resolve(distRoot, 'index.html')
const siteOrigin = (process.env.PAKTI_WEB_ORIGIN || 'https://pakti.zakado.id').replace(/\/+$/, '')

const routes = [
  {
    path: '/',
    output: 'index.html',
    title: 'Pakti · Scan',
    description: 'Pintu masuk operator untuk scan resi, QC, dan dokumentasi packing.',
    robots: 'index, follow',
  },
  {
    path: '/scan',
    output: 'scan/index.html',
    title: 'Pakti · Scan',
    description: 'Pintu masuk operator untuk scan resi, QC, dan dokumentasi packing.',
    robots: 'index, follow',
  },
  {
    path: '/history',
    output: 'history/index.html',
    title: 'Pakti · History',
    description: 'Riwayat dokumentasi QC dan packing paket yang sudah direkam.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/packing-sessions',
    output: 'packing-sessions/index.html',
    title: 'Pakti · Sesi Packing',
    description: 'Riwayat sesi packing, jumlah paket, dan data payroll petugas.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/packing-sessions/:id',
    output: 'packing-session-detail/index.html',
    title: 'Pakti · Detail Sesi Packing',
    description: 'Detail sesi packing per petugas dengan daftar paket dan rincian upah.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/shopee-inspection',
    output: 'shopee-inspection/index.html',
    title: 'Pakti · Hasil Shopee',
    description: 'Hasil inspeksi order Shopee untuk pencocokan data paket.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/shopee',
    output: 'shopee/index.html',
    title: 'Pakti · Shopee',
    description: 'Kontrol sinkronisasi order Shopee dan antrean auto chat.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/users',
    output: 'users/index.html',
    title: 'Pakti · Users',
    description: 'Kelola akun operator, admin, dan akses petugas.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/settings',
    output: 'settings/index.html',
    title: 'Pakti · Settings',
    description: 'Konfigurasi dasar aplikasi Pakti untuk operasional dokumentasi paket.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/health',
    output: 'health/index.html',
    title: 'Pakti · Health',
    description: 'Diagnosa runtime, koneksi backend, dan status sistem Pakti.',
    robots: 'noindex, nofollow',
  },
  {
    path: '/admin',
    output: 'admin/index.html',
    title: 'Pakti · Admin',
    description: 'Panel admin untuk audit server dan pemeliharaan data operasional.',
    robots: 'noindex, nofollow',
  },
]

if (!existsSync(appShell)) {
  throw new Error(`Build output not found: ${appShell}`)
}

const shellHtml = readFileSync(appShell, 'utf8')

function renderRouteHtml(route) {
  const canonical = `${siteOrigin}${route.path === '/' ? '' : route.path}`
  const canonicalTag = `<link rel="canonical" href="${canonical}" />`
  const robotsTag = `<meta name="robots" content="${route.robots || 'index, follow'}" />`
  const htmlWithTitle = shellHtml.replace(/<title>.*?<\/title>/, `<title>${route.title}</title>`)
  const htmlWithDescription = htmlWithTitle.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
    `<meta name="description" content="${route.description}" />`,
  )

  let nextHtml = htmlWithDescription

  if (nextHtml.includes('name="robots"')) {
    nextHtml = nextHtml.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/>/, robotsTag)
  } else {
    nextHtml = nextHtml.replace('</head>', `    ${robotsTag}\n  </head>`)
  }

  if (nextHtml.includes('rel="canonical"')) {
    return nextHtml.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, canonicalTag)
  }

  return nextHtml.replace('</head>', `    ${canonicalTag}\n  </head>`)
}

function renderNotFoundHtml() {
  const notFoundTitle = 'Pakti · Halaman Tidak Ditemukan'
  const notFoundDescription = 'Halaman yang kamu cari tidak tersedia di Pakti.'
  const canonicalTag = `<link rel="canonical" href="${siteOrigin}/404" />`
  const robotsTag = '<meta name="robots" content="noindex, nofollow" />'
  const htmlWithTitle = shellHtml.replace(/<title>.*?<\/title>/, `<title>${notFoundTitle}</title>`)
  const htmlWithDescription = htmlWithTitle.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
    `<meta name="description" content="${notFoundDescription}" />`,
  )

  let nextHtml = htmlWithDescription

  if (nextHtml.includes('name="robots"')) {
    nextHtml = nextHtml.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/>/, robotsTag)
  } else {
    nextHtml = nextHtml.replace('</head>', `    ${robotsTag}\n  </head>`)
  }

  if (nextHtml.includes('rel="canonical"')) {
    return nextHtml.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, canonicalTag)
  }

  return nextHtml.replace('</head>', `    ${canonicalTag}\n  </head>`)
}

function writeSitemap() {
  const sitemapPath = resolve(distRoot, 'sitemap.xml')
  const routesForSitemap = routes.filter((route) => route.robots !== 'noindex, nofollow' && route.path !== '/')
  const urls = routesForSitemap
    .map((route) => `  <url>\n    <loc>${siteOrigin}${route.path}</loc>\n  </url>`)
    .join('\n')

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url>\n    <loc>${siteOrigin}/</loc>\n  </url>`,
    urls,
    '</urlset>',
    '',
  ].join('\n')

  writeFileSync(sitemapPath, sitemap)
}

function writeRobots() {
  const robotsPath = resolve(distRoot, 'robots.txt')
  const robots = [`User-agent: *`, `Allow: /`, `Sitemap: ${siteOrigin}/sitemap.xml`, ''].join('\n')
  writeFileSync(robotsPath, robots)
}

for (const route of routes) {
  const routeHtml = resolve(distRoot, route.output)
  mkdirSync(dirname(routeHtml), { recursive: true })
  writeFileSync(routeHtml, renderRouteHtml(route))
}

writeFileSync(resolve(distRoot, '404.html'), renderNotFoundHtml())
writeSitemap()
writeRobots()

console.log(`Generated static HTML shells for ${routes.length} web routes + 404/sitemap/robots.`)
