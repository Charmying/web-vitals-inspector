/* eslint-disable @typescript-eslint/explicit-function-return-type */

import http from 'node:http'

const PORT = Number(process.env.STRESS_MOCK_PORT || 4789)
const HOST = '127.0.0.1'
const SITEMAP_PAGES = Number(process.env.STRESS_MOCK_PAGES || 360)

function html(pageNumber) {
  const prev = pageNumber > 1 ? `/page/${pageNumber - 1}` : '/'
  const next = `/page/${pageNumber + 1}`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stress Page ${pageNumber}</title>
  <meta name="description" content="Synthetic stress test page ${pageNumber}" />
  <link rel="canonical" href="http://${HOST}:${PORT}/page/${pageNumber}" />
  <meta property="og:title" content="Stress Page ${pageNumber}" />
  <meta property="og:description" content="OG description ${pageNumber}" />
  <meta property="og:image" content="http://${HOST}:${PORT}/assets/og.png" />
</head>
<body>
  <main>
    <h1>Stress Test Page ${pageNumber}</h1>
    <h2>Section A</h2>
    <p>This is a synthetic page for Lighthouse and SEO analyzer stress validation.</p>
    <a href="${prev}">Prev</a>
    <a href="${next}">Next</a>
    <a href="/page/${Math.max(1, pageNumber - 10)}">Back Ten</a>
    <a href="/page/${pageNumber + 10}">Forward Ten</a>
    <img src="/assets/placeholder.png" alt="placeholder" width="10" height="10" />
  </main>
</body>
</html>`
}

const server = http.createServer((req, res) => {
  const url = req.url || '/'

  if (url === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('User-agent: *\nAllow: /\n')
    return
  }

  if (url === '/sitemap.xml') {
    const entries = Array.from({ length: SITEMAP_PAGES }, (_, i) => {
      const page = i + 1
      return `<url><loc>http://${HOST}:${PORT}/page/${page}</loc></url>`
    }).join('')
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
    res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset>${entries}</urlset>`)
    return
  }

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html(1))
    return
  }

  const match = url.match(/^\/page\/(\d+)$/)
  if (match) {
    const pageNumber = Number(match[1])
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    })
    res.end(html(pageNumber))
    return
  }

  if (url.startsWith('/assets/')) {
    res.writeHead(200, { 'content-type': 'image/png' })
    res.end(Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex'))
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
})

server.listen(PORT, HOST, () => {
  console.log(`[stress-mock] Running at http://${HOST}:${PORT}`)
  console.log(`[stress-mock] Dynamic pages enabled`) 
  console.log(`[stress-mock] Sitemap entries: ${SITEMAP_PAGES}`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
