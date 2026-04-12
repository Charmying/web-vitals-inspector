/** Website crawler module — discovers URLs via sitemap, search engines, and recursive crawling */
import puppeteer, { type Browser, type Page } from 'puppeteer'
import axios from 'axios'
import { resolve as urlResolve } from 'url'
import type { CrawlProgress, CrawlResult, UrlStatusEntry } from './types'
import { getChromePath } from './chrome'

/** File extension and path patterns to exclude from SEO crawling */
const EXCLUDE_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|svg|webp|avif|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|zip|rar|doc|docx|xls|xlsx|ppt|pptx|exe|dmg|apk)$/i

const EXCLUDE_PATH_PATTERNS = [
  /\/wp-admin\//i,
  /\/wp-json\//i,
  /\/xmlrpc\.php/i,
  /\/feed\/?$/i,
  /\/trackback\/?$/i,
  /\/comment-page-\d+/i
]

/** Determine if a URL path is relevant for SEO auditing */
function isSeoAuditPath(pathname: string): boolean {
  const p = pathname.toLowerCase()
  if (EXCLUDE_EXTENSIONS.test(p)) return false
  if (EXCLUDE_PATH_PATTERNS.some((re) => re.test(p))) return false
  if (/\/(login|signin|auth|register|signup|logout|cart|checkout|payment|oauth|callback)(\/|$)/i.test(p)) return false
  if (/\/member\/(login|signin|auth|verify)(\/|$)/i.test(p)) return false
  if (/\/(wp-admin|administrator|wp-login)(\/|$)/i.test(p)) return false
  if (/\/(api|graphql|ajax|rpc)(\/|$)/i.test(p)) return false
  if (/\.(xml|rss|atom|txt|json|swf)(\?|$)/i.test(p)) return false
  if (/\b(print|download|export|embed|preview)(\b|\/|=)/i.test(p)) return false
  return true
}

function isSeoAuditUrl(u: string): boolean {
  try {
    return isSeoAuditPath(new URL(u).pathname)
  } catch {
    return false
  }
}

/** Noise vs meaningful URL parameter classification and tracking */
const NOISE_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gad_source', 'msclkid', 'ttclid', 'twclid',
  '_ga', '_gl', 'ref', 'source', 'mc_cid', 'mc_eid',
  'token', 'session', 'sid', 'csrf',
  'tab', 'modal', 'popup', 'lang', 'currency', 'theme', 'color',
  'hl', 'gl', 'ie', 'oe'
])

const MEANINGFUL_PARAMS = new Set([
  'type', 'parenttypeid', 'isannouncement', 'category', 'cat',
  'tag', 'genre', 'filter', 'status',
  'page', 'p', 'paged', 'offset',
  'locale', 'language',
  'q', 'query', 'keyword', 'search', 'id', 'slug',
  'product', 'item', 'post', 'article', 'news'
])

class ParamAnalyzer {
  paramStats = new Map<string, { paths: Set<string>; values: Set<string>; count: number }>()

  record(url: string): void {
    try {
      const urlObj = new URL(url)
      for (const [key, value] of urlObj.searchParams) {
        const k = key.toLowerCase()
        if (!this.paramStats.has(k)) this.paramStats.set(k, { paths: new Set(), values: new Set(), count: 0 })
        const stat = this.paramStats.get(k)!
        stat.paths.add(urlObj.pathname)
        stat.values.add(value)
        stat.count++
      }
    } catch {
      /* ignore */
    }
  }

  isMeaningful(param: string): boolean {
    const k = param.toLowerCase()
    if (NOISE_PARAMS.has(k)) return false
    if (MEANINGFUL_PARAMS.has(k)) return true
    const stat = this.paramStats.get(k)
    if (!stat) return false
    const uniqueValues = stat.values.size
    const uniquePaths = stat.paths.size
    if (uniquePaths >= 3) return true
    if (uniqueValues <= 10) return true
    if (uniqueValues > 50 && uniquePaths === 1) return false
    return false
  }
}

/** Normalize and deduplicate URLs by stripping noise params and trailing slashes */
function normalizeUrl(raw: string, base: string, analyzer: ParamAnalyzer, learnMode = false): string | null {
  try {
    const resolved = urlResolve(base, raw).split('#')[0]
    const urlObj = new URL(resolved)
    if (learnMode) analyzer.record(resolved)
    if (urlObj.search) {
      const kept = new URLSearchParams()
      for (const [key, value] of urlObj.searchParams) {
        if (analyzer.isMeaningful(key)) kept.set(key.toLowerCase(), value)
      }
      const sortedKept = new URLSearchParams([...kept.entries()].sort())
      urlObj.search = sortedKept.toString() ? '?' + sortedKept.toString() : ''
    }
    if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/'))  urlObj.pathname = urlObj.pathname.replace(/\/+$/, '')
    return urlObj.toString()
  } catch {
    return null
  }
}

/** Detect login/authentication walls on a page */
const LOGIN_WALL_SELECTORS = [
  'form[action*="login"]', 'form[action*="signin"]',
  'input[type="password"]', '[class*="login-form"]',
  '[id*="login-form"]', '[class*="signin"]'
]

async function isLoginWall(page: Page): Promise<boolean> {
  for (const sel of LOGIN_WALL_SELECTORS) {
    if (await page.$(sel)) return true
  }
  const url = page.url()
  return /\/(login|signin|auth|register|signup|member\/login)/i.test(new URL(url).pathname)
}

/** Helper functions for URL filtering and queue management */
function shouldExclude(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase()
    return EXCLUDE_EXTENSIONS.test(p) || EXCLUDE_PATH_PATTERNS.some((re) => re.test(p))
  } catch {
    return true
  }
}

function isInternal(url: string, rootHostNoWww: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./i, '')
    return host === rootHostNoWww
  } catch {
    return false
  }
}

function addToQueue(url: string, seen: Set<string>, queue: string[], rootHostNoWww: string): void {
  if (!url || !isInternal(url, rootHostNoWww) || shouldExclude(url) || seen.has(url)) return
  seen.add(url)
  queue.push(url)
}

/** Seed URL sources — fetch from sitemaps, Wayback Machine, and search engines */
async function fetchSitemapUrls(rootUrl: string, rootHostNoWww: string, analyzer: ParamAnalyzer): Promise<Set<string>> {
  const urls = new Set<string>()
  async function parse(sitemapUrl: string, depth = 0): Promise<void> {
    if (depth > 4) return
    try {
      const { data } = await axios.get(sitemapUrl, { timeout: 12000 })
      const subSitemaps = [...data.matchAll(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>/gi)].map(
        (m: RegExpMatchArray) => m[1].trim()
      )
      if (subSitemaps.length > 0) {
        for (const s of subSitemaps) await parse(s, depth + 1)
        return
      }
      for (const m of data.matchAll(/<loc>(.*?)<\/loc>/gi)) {
        const u = (m as RegExpMatchArray)[1].trim()
        if (!isInternal(u, rootHostNoWww)) continue
        analyzer.record(u)
        const normalized = normalizeUrl(u, rootUrl, analyzer)
        if (normalized && !shouldExclude(normalized)) urls.add(normalized)
      }
    } catch {
      /* ignore */
    }
  }
  const candidates = [
    '/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml',
    '/wp-sitemap.xml', '/news-sitemap.xml', '/pages-sitemap.xml'
  ]
  for (const c of candidates) {
    await parse(new URL(c, rootUrl).toString())
  }
  return urls
}

async function fetchWaybackUrls(domain: string, rootUrl: string, rootHostNoWww: string, analyzer: ParamAnalyzer): Promise<Set<string>> {
  const urls = new Set<string>()
  try {
    const cdxUrl = `http://web.archive.org/cdx/search/cdx?url=${domain}/*&output=text&fl=original&collapse=urlkey&limit=50000`
    const { data } = await axios.get(cdxUrl, { timeout: 40000 })
    for (const raw of data.split('\n')) {
      const url = raw.trim()
      if (!url || !isInternal(url, rootHostNoWww)) continue
      analyzer.record(url)
      const normalized = normalizeUrl(url, rootUrl, analyzer)
      if (normalized && !shouldExclude(normalized)) urls.add(normalized)
    }
  } catch {
    /* ignore */
  }
  return urls
}

async function fetchSearchEngineUrls(browser: Browser, engine: 'google' | 'bing', domain: string, rootUrl: string, rootHostNoWww: string, analyzer: ParamAnalyzer): Promise<Set<string>> {
  const urls = new Set<string>()
  const page = await browser.newPage()
  const client = await page.createCDPSession()
  await client.send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' })
  const config =
    engine === 'google'
      ? {
          url: (start: number) => `https://www.google.com/search?q=site:${domain}&num=100&start=${start}&hl=en`,
          next: '#pnnext',
          step: 100,
          captcha: 'form[action*="sorry"], #captcha-form',
          extract: async (p: Page) =>
            p.$$eval('a[href]', (as) =>
              as
                .map((a) => a.href)
                .filter((h) => h && !h.includes('google.com') && h.startsWith('http'))
            )
        }
      : {
          url: (first: number) => `https://www.bing.com/search?q=site:${domain}&count=50&first=${first}`,
          next: 'a.sb_pagN',
          step: 50,
          captcha: null as string | null,
          extract: async (p: Page) =>
            p.$$eval('h2 a[href]', (as) =>
              as
                .map((a) => a.href)
                .filter((h) => h && h.startsWith('http') && !h.includes('bing.com'))
            )
        }

  try {
    let offset = engine === 'google' ? 0 : 1
    let emptyRound = 0
    while (emptyRound < 2 && urls.size < 2000) {
      await page.goto(config.url(offset), { waitUntil: 'domcontentloaded', timeout: 20000 })
      if (config.captcha && (await page.$(config.captcha))) break
      const found = await config.extract(page)
      let newCount = 0
      for (const url of found) {
        analyzer.record(url)
        const normalized = normalizeUrl(url, rootUrl, analyzer)
        if (normalized && isInternal(normalized, rootHostNoWww) && !shouldExclude(normalized) && !urls.has(normalized)) {
          urls.add(normalized)
          newCount++
        }
      }
      emptyRound = newCount === 0 ? emptyRound + 1 : 0
      if (!(await page.$(config.next))) break
      offset += config.step
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000))
    }
  } catch {
    /* ignore */
  } finally {
    await page.close()
  }
  return urls
}

/** Concurrent page pool for parallel crawl workers */
function createWorkerPool(pages: Page[]): { acquire: () => Promise<Page>; release: (p: Page) => void } {
  const idle = [...pages]
  const waiting: ((p: Page) => void)[] = []
  return {
    acquire: (): Promise<Page> => new Promise((res) => (idle.length ? res(idle.shift()!) : waiting.push(res))),
    release: (p: Page): void => {
      waiting.length ? waiting.shift()!(p) : idle.push(p)
    }
  }
}

/** Crawl a single page: navigate, extract links, and add to crawl queue */
async function crawlPage(page: Page, url: string, visited: Map<string, { status: number; redirectTo: string | null } | null>, seen: Set<string>, queue: string[], rootUrl: string, rootHostNoWww: string, analyzer: ParamAnalyzer, timeout: number, maxRetry: number, retry = 0): Promise<void> {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    const status = response?.status() ?? 0
    let redirectTo: string | null = null
    if (status >= 200 && status < 400 && isInternal(page.url(), rootHostNoWww)) {
      await new Promise((r) => setTimeout(r, 2500))
      const normReq = normalizeUrl(url, rootUrl, analyzer) ?? url
      const normFinal = normalizeUrl(page.url(), rootUrl, analyzer) ?? page.url()
      if (normFinal !== normReq) redirectTo = normFinal
    }
    visited.set(url, { status, redirectTo })
    if (await isLoginWall(page)) return
    if (status >= 200 && status < 400 && isInternal(page.url(), rootHostNoWww)) {
      const rawLinks: string[] = await page.evaluate(() => {
        const urls: string[] = []
        const push = (v: string | null): void => {
          if (v && typeof v === 'string') urls.push(v)
        }
        document.querySelectorAll('a[href]').forEach((el) => push(el.getAttribute('href')))
        document.querySelectorAll('link[rel="alternate"][href]').forEach((el) => push(el.getAttribute('href')))
        document.querySelectorAll('link[rel="canonical"][href]').forEach((el) => push(el.getAttribute('href')))
        document.querySelectorAll('iframe[src]').forEach((el) => push(el.getAttribute('src')))
        document.querySelectorAll('form[action]').forEach((el) => push(el.getAttribute('action')))
        document.querySelectorAll('meta[http-equiv="refresh"][content]').forEach((el) => {
          const c = el.getAttribute('content') || ''
          const m = c.match(/url\s*=\s*(.+)$/i)
          if (m?.[1]) push(m[1].trim().replace(/^["']|["']$/g, ''))
        })
        return urls
      })
      for (const raw of rawLinks) {
        if (!raw) continue
        const resolved = normalizeUrl(raw, url, analyzer, true) ?? normalizeUrl(raw, url, analyzer)
        if (resolved && !visited.has(resolved)) addToQueue(resolved, seen, queue, rootHostNoWww)
      }
    }
  } catch {
    if (retry < maxRetry) {
      await new Promise((r) => setTimeout(r, 1000 * (retry + 1)))
      return crawlPage(page, url, visited, seen, queue, rootUrl, rootHostNoWww, analyzer, timeout, maxRetry, retry + 1)
    }
    visited.set(url, { status: 0, redirectTo: null })
  }
}

/** Main crawl entry point — orchestrate seed collection, recursive crawl, and result assembly */
export async function crawlUrls(rootUrl: string, onProgress: (p: CrawlProgress) => void, abortSignal?: { aborted: boolean }): Promise<CrawlResult> {
  const ROOT_URL = rootUrl.replace(/\/?$/, '/')
  const DOMAIN = new URL(ROOT_URL).hostname
  const ROOT_HOST_NO_WWW = DOMAIN.replace(/^www\./i, '')
  const MAX_PAGES = 10000
  const CONCURRENCY = 3
  const TIMEOUT = 30000
  const MAX_RETRY = 2
  const analyzer = new ParamAnalyzer()
  const visited = new Map<string, { status: number; redirectTo: string | null } | null>()
  const seen = new Set<string>()
  const queue: string[] = []

  onProgress({ phase: 'crawl', current: 0, total: 0, message: '啟動瀏覽器...' })

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromePath() || undefined,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--mute-audio', '--hide-scrollbars'
    ]
  })

  try {
    // Phase 1: Seed collection
    onProgress({ phase: 'seeds', current: 0, total: 4, message: '收集種子 URL（Sitemap）...' })

    const [sitemapUrls, waybackUrls] = await Promise.all([
      fetchSitemapUrls(ROOT_URL, ROOT_HOST_NO_WWW, analyzer),
      fetchWaybackUrls(DOMAIN, ROOT_URL, ROOT_HOST_NO_WWW, analyzer)
    ])

    if (abortSignal?.aborted) throw new Error('Aborted')

    onProgress({ phase: 'seeds', current: 2, total: 4, message: '搜尋引擎種子（Google/Bing）...' })

    const [googleUrls, bingUrls] = await Promise.all([
      fetchSearchEngineUrls(browser, 'google', DOMAIN, ROOT_URL, ROOT_HOST_NO_WWW, analyzer),
      fetchSearchEngineUrls(browser, 'bing', DOMAIN, ROOT_URL, ROOT_HOST_NO_WWW, analyzer)
    ])

    if (abortSignal?.aborted) throw new Error('Aborted')

    // Merge seeds
    const allSeeds = [
      normalizeUrl(ROOT_URL, ROOT_URL, analyzer),
      ...sitemapUrls,
      ...waybackUrls,
      ...googleUrls,
      ...bingUrls
    ]
    for (const u of allSeeds) {
      if (u) addToQueue(u, seen, queue, ROOT_HOST_NO_WWW)
    }

    onProgress({
      phase: 'seeds',
      current: 4,
      total: 4,
      message: `種子收集完成：${queue.length} 個 URL`
    })

    // Phase 2: Recursive crawl
    const crawlPages: Page[] = []
    for (let i = 0; i < CONCURRENCY; i++) {
      const p = await browser.newPage()
      const client = await p.createCDPSession()
      await client.send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (compatible; SEO-Crawler/6.0)' })
      await p.setRequestInterception(true)
      p.on('request', (req) => { ;['image', 'stylesheet', 'font', 'media'].includes(req.resourceType()) ? req.abort() : req.continue() })
      crawlPages.push(p)
    }

    const pool = createWorkerPool(crawlPages)
    const running = new Set<Promise<void>>()

    while ((queue.length > 0 || running.size > 0) && visited.size < MAX_PAGES) {
      if (abortSignal?.aborted) throw new Error('Aborted')

      while (queue.length > 0 && running.size < CONCURRENCY && visited.size + running.size < MAX_PAGES) {
        const url = queue.shift()!
        if (visited.has(url)) continue
        visited.set(url, null)

        const taskRef = { value: Promise.resolve() as Promise<void> }
        taskRef.value = (async (): Promise<void> => {
          const p = await pool.acquire()
          try {
            await crawlPage(p, url, visited, seen, queue, ROOT_URL, ROOT_HOST_NO_WWW, analyzer, TIMEOUT, MAX_RETRY)
          } finally {
            pool.release(p)
            running.delete(taskRef.value)
          }
        })()
        running.add(taskRef.value)
      }

      onProgress({
        phase: 'crawl',
        current: visited.size,
        total: visited.size + queue.length,
        message: `Crawled ${visited.size} pages / Queue ${queue.length} | 已爬取 ${visited.size} 頁 / 佇列 ${queue.length}`
      })

      await new Promise((r) => setTimeout(r, 50))
    }

    await Promise.allSettled([...running])

    // Build output
    const allUrls = [...visited.keys()].sort()
    const seoImpactUrls: string[] = []
    const seenFinal = new Set<string>()

    for (const [entryUrl, info] of visited) {
      if (!info || info.status < 200 || info.status >= 300) continue
      const finalU = info.redirectTo ? (normalizeUrl(info.redirectTo, ROOT_URL, analyzer) ?? info.redirectTo) : entryUrl
      if (!isInternal(finalU, ROOT_HOST_NO_WWW)) continue
      if (!isSeoAuditUrl(finalU)) continue
      const dedupeKey = normalizeUrl(finalU, ROOT_URL, analyzer) ?? finalU
      if (seenFinal.has(dedupeKey)) continue
      seenFinal.add(dedupeKey)
      seoImpactUrls.push(dedupeKey)
    }
    seoImpactUrls.sort()

    const urlStatusData: UrlStatusEntry[] = [...visited.entries()].map(([url, info]) => {
      const s = info?.status ?? 0
      const label = !s ? '❌ Error' : s < 300 ? '✅ OK' : s < 400 ? '↩️ Redirect' : s < 500 ? '⚠ 4xx' : '💀 5xx'
      return { url, status: s, redirectTo: info?.redirectTo ?? null, label }
    })

    onProgress({
      phase: 'done',
      current: visited.size,
      total: visited.size,
      message: `Crawl complete! ${visited.size} URLs, ${seoImpactUrls.length} SEO audit URLs | 爬取完成！共 ${visited.size} 個 URL，${seoImpactUrls.length} 個 SEO 審計 URL`
    })

    return { seoUrls: seoImpactUrls, allUrls, urlStatusData }
  } finally {
    await browser.close().catch(() => {})
  }
}
