/** SEO analyzer module - runs Lighthouse audits and Puppeteer-based metadata extraction */
import https from 'https'
import http from 'http'
import puppeteer from 'puppeteer'
import type lighthouse from 'lighthouse'
import type { AnalysisProgress, AnalysisResult, LhrSlim, SeoMeta, TechChecks } from './types'
import { getChromePath } from './chrome'

const LH_RETRY = 3
const PAGE_TIMEOUT = 60000
const LH_TIMEOUT = 150000


const LH_CHROME_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',

  '--remote-debugging-port=0',

  '--window-size=1350,940',

  '--disable-translate',
  '--disable-extensions',

  '--disable-background-networking',
  '--safebrowsing-disable-auto-update',
  '--disable-sync',

  '--metrics-recording-only',
  '--disable-default-apps',
  '--mute-audio',
  '--no-default-browser-check',

  '--no-first-run',

  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-popup-blocking',
  '--disable-client-side-phishing-detection',
  '--disable-hang-monitor',
  '--password-store=basic',

  '--use-mock-keychain',
  '--disable-prompt-on-repost',
  '--disable-domain-reliability',

  '--disable-renderer-backgrounding',
  '--disable-infobars',
  '--disable-device-discovery-notifications',

  '--force-color-profile=srgb',
  '--hide-scrollbars',
]

/** ========================= Lighthouse runner - module-level singleton ========================= */

let _lhRunner: typeof lighthouse | null = null

function extractLhFunction(mod: unknown): typeof lighthouse | null {
  if (typeof mod === 'function') return mod as unknown as typeof lighthouse
  if (mod && typeof mod === 'object') {
    const m = mod as Record<string, unknown>
    if (typeof m.default === 'function') return m.default as typeof lighthouse
    if (typeof m.lighthouse === 'function') return m.lighthouse as typeof lighthouse
    // Handle double-wrapped default (some bundler configs produce { default: { default: fn } })
    if (m.default && typeof m.default === 'object') {
      const inner = m.default as Record<string, unknown>
      if (typeof inner.default === 'function') return inner.default as typeof lighthouse
      if (typeof inner.lighthouse === 'function') return inner.lighthouse as typeof lighthouse
    }
  }
  return null
}

async function getLighthouseRunner(): Promise<typeof lighthouse> {
  if (_lhRunner) return _lhRunner
  try {
    const lhMod = await import('lighthouse')
    const fn = extractLhFunction(lhMod)

    if (!fn) {
      const keys = lhMod && typeof lhMod === 'object' ? Object.keys(lhMod as object) : []
      throw new Error(
        `lighthouse module loaded but has no callable export. ` +
          `Exported keys: [${keys.join(', ')}]`
      )
    }

    _lhRunner = fn
    console.info('[analyzer] Lighthouse module loaded successfully')
    return _lhRunner
  } catch (err) {
    console.error('[analyzer] Failed to load Lighthouse module:', (err as Error).message)
    throw err
  }
}

/** ========================= LHR slim extraction ========================= */

/** Extract a slim subset of Lighthouse report data (categories + audits) */
function extractLhrSlim(lhr: Record<string, unknown>): LhrSlim | null {
  if (!lhr || typeof lhr !== 'object') return null
  const slim: LhrSlim = { categories: {}, audits: {} }
  const cats = (lhr.categories ?? {}) as Record<string, Record<string, unknown>>
  for (const [catId, cat] of Object.entries(cats)) {
    if (!cat || typeof cat !== 'object') continue
    slim.categories[catId] = {
      score: cat.score as number | null,
      auditRefs: ((cat.auditRefs as { id: string }[]) ?? []).map((r) => ({ id: r.id }))
    }
  }
  const audits = (lhr.audits ?? {}) as Record<string, Record<string, unknown>>
  for (const [id, audit] of Object.entries(audits)) {
    if (!audit || typeof audit !== 'object') continue
    slim.audits[id] = {
      score: audit.score as number | null,
      scoreDisplayMode: (audit.scoreDisplayMode as string) ?? '',
      title: (audit.title as string) ?? '',
      description: (audit.description as string) ?? '',
      displayValue: (audit.displayValue as string) ?? ''
    }
  }
  return slim
}

/** ========================= Lighthouse execution ========================= */

async function runLighthouse(
  url: string,
  abortSignal?: { aborted: boolean }
): Promise<Record<string, unknown> | null> {
  const chromePath = getChromePath()

  let runLH: typeof lighthouse
  try {
    runLH = await getLighthouseRunner()
  } catch (err) {
    console.error(`[LH] Cannot run Lighthouse for "${url}": ${(err as Error).message}`)
    return null
  }

  for (let attempt = 1; attempt <= LH_RETRY; attempt++) {
    if (abortSignal?.aborted) return null

    let browser: import('puppeteer').Browser | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: chromePath || undefined,
        args: LH_CHROME_FLAGS
      })

      const wsEndpoint = browser.wsEndpoint()
      if (!wsEndpoint) {
        throw new Error(
          'Chrome wsEndpoint() returned an empty string - pipe transport is active. ' +
            'The --remote-debugging-port=0 flag was not accepted by this Chrome build.'
        )
      }

      const portStr = new URL(wsEndpoint).port
      const parsedPort = parseInt(portStr, 10)
      if (!portStr || isNaN(parsedPort) || parsedPort <= 0) {
        throw new Error(`Cannot parse a valid debugging port from wsEndpoint: "${wsEndpoint}"`)
      }

      const lhPromise = runLH(url, {
        port: parsedPort,
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error(
                `Lighthouse audit timed out after ${LH_TIMEOUT / 1000}s - ` +
                  `page may be too slow or unresponsive`
              )
            ),
          LH_TIMEOUT
        )
      })

      let lhResult: Awaited<ReturnType<typeof lighthouse>>
      try {
        lhResult = await Promise.race([lhPromise, timeoutPromise])
      } finally {
        // ALWAYS clear the timer regardless of outcome to prevent leaks.
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        lhPromise.catch(() => {})
      }

      // Lighthouse.runnerResult can be undefined if the run was aborted internally.
      const lhr = (lhResult?.lhr as unknown as Record<string, unknown>) ?? null
      if (!lhr) {
        throw new Error(
          'Lighthouse returned a RunnerResult with no LHR payload - ' +
            'the audit was likely aborted internally'
        )
      }

      const catKeys = Object.keys((lhr.categories ?? {}) as Record<string, unknown>)
      if (catKeys.length === 0) {
        throw new Error(
          'Lighthouse returned zero categories - Chrome may have failed to load ' +
            'the page or the server returned a non-HTML response'
        )
      }

      const allScoresNull = catKeys.every((k) => {
        const cat = (lhr.categories as Record<string, { score: number | null }>)[k]
        return cat?.score == null
      })
      if (allScoresNull) {
        throw new Error(
          'All category scores are null - measurement issue (Chrome navigated but ' +
            'could not compute metrics). Retrying with a fresh Chrome process.'
        )
      }

      // Log scores for observability (null = page loaded but not scoreable).
      const scoreLog = catKeys
        .map((k) => {
          const score = ((lhr.categories as Record<string, { score: number | null }>)[k]).score
          return `${k}:${score != null ? Math.round(score * 100) : 'null'}`
        })
        .join(' | ')
      console.info(`[LH] attempt ${attempt} OK - "${url}" - ${scoreLog}`)

      return lhr
    } catch (err) {
      const msg = (err as Error).message ?? String(err)
      console.warn(`[LH] attempt ${attempt}/${LH_RETRY} FAILED - "${url}"\n     -> ${msg}`)

      if (attempt === LH_RETRY) {
        console.error(`[LH] All ${LH_RETRY} attempts exhausted for "${url}"`)
        return null
      }
      if (abortSignal?.aborted) return null

      await new Promise((r) => setTimeout(r, 3000 * attempt))
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (browser) {
        await browser.close().catch(() => {})
        // Extra 800ms after close to ensure the OS fully reclaims the port
        // used by --remote-debugging-port=0 before the next Chrome launch.
        await new Promise((r) => setTimeout(r, 800))
      }
    }
  }

  return null
}

/** ========================= SEO metadata extraction (Puppeteer, shared browser) ========================= */

/** Extract SEO metadata from a page using Puppeteer (title, meta tags, headings, images, etc.) */
async function getSEOData(url: string, browser: import('puppeteer').Browser): Promise<SeoMeta | null> {
  let page: import('puppeteer').Page | null = null
  try {
    page = await browser.newPage()
    try {
      const client = await page.createCDPSession()
      await client.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (compatible; SEO-Analyzer/5.0; +https://github.com/seo-audit)'
      })
    } catch {
      // CDP session setup is best-effort; page navigation still proceeds.
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })

    const data = await page.evaluate(() => {
      const getMeta = (sel: string, attr = 'content'): string | null =>
        document.querySelector(sel)?.getAttribute(attr) ?? null

      const title = document.title || ''
      const description = getMeta('meta[name="description"]')
      const canonical = getMeta('link[rel="canonical"]', 'href')
      const robots = getMeta('meta[name="robots"]') ?? ''
      const viewport = getMeta('meta[name="viewport"]')
      const lang = document.documentElement.lang || ''
      const ogTitle = getMeta('meta[property="og:title"]')
      const ogDesc = getMeta('meta[property="og:description"]')
      const ogImage = getMeta('meta[property="og:image"]')
      const h1Els = [...document.querySelectorAll('h1')]
      const h2Els = [...document.querySelectorAll('h2')]
      const h1Text = h1Els.map((el) => (el as HTMLElement).innerText.trim()).filter(Boolean)
      const imgs = [...document.images]
      const imgTotal = imgs.length
      const imgNoAlt = imgs.filter((i) => !i.hasAttribute('alt')).length
      const allLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
      const origin = window.location.origin
      const internalLinks = allLinks.filter((a) => {
        try {
          return new URL(a.href).origin === origin
        } catch {
          return false
        }
      })

      const bodyText = document.body?.innerText || ''
      const words =
        bodyText.match(/[\u4e00-\u9fff]|[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+/gu) || []
      const wordCount = words.length
      const schemas = [
        ...document.querySelectorAll('script[type="application/ld+json"]')
      ].flatMap((s) => {
        try {
          const json = JSON.parse(s.textContent || '')
          const types: string[] = Array.isArray(json)
            ? json.map((j: Record<string, string>) => j['@type'])
            : [json['@type']]
          return types.filter(Boolean)
        } catch {
          return []
        }
      })

      const hreflangLinks = [
        ...document.querySelectorAll('link[rel="alternate"][hreflang]')
      ].map((l) => l.getAttribute('hreflang')!)

      return {
        title,
        description,
        canonical,
        robots,
        viewport,
        lang,
        ogTitle,
        ogDesc,
        ogImage,
        h1Count: h1Els.length,
        h1Text,
        h2Count: h2Els.length,
        imgTotal,
        imgNoAlt,
        internalLinkCount: internalLinks.length,
        wordCount,
        schemas,
        hreflangLinks,
        hasOgTitle: !!ogTitle,
        hasOgDesc: !!ogDesc,
        hasOgImage: !!ogImage
      }
    })

    return data
  } catch {
    return null
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

/** ========================= Technical SEO checks ========================= */

/** Check technical SEO indicators: HTTPS, robots.txt, sitemap.xml */
const fetchHead = (url: string): Promise<{ status: number | null; ok: boolean }> =>
  new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http
    try {
      const req = mod.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
        resolve({ status: res.statusCode ?? null, ok: (res.statusCode ?? 999) < 400 })
      })
      req.on('error', () => resolve({ status: null, ok: false }))
      req.on('timeout', () => {
        req.destroy()
        resolve({ status: null, ok: false })
      })
      req.end()
    } catch {
      resolve({ status: null, ok: false })
    }
  })

/** Run technical SEO checks for a single URL origin */
async function getTechChecks(url: string): Promise<TechChecks> {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return { isHttps: false, robotsTxtOk: false, sitemapOk: false }
  }
  const isHttps = url.startsWith('https://')
  const [robotsRes, sitemapRes] = await Promise.all([
    fetchHead(`${origin}/robots.txt`),
    fetchHead(`${origin}/sitemap.xml`)
  ])
  return { isHttps, robotsTxtOk: robotsRes.ok, sitemapOk: sitemapRes.ok }
}

/** ========================= Shared browser health management ========================= */

/** Check whether a Browser instance is still usable by calling a lightweight CDP method */
async function isBrowserHealthy(browser: import('puppeteer').Browser): Promise<boolean> {
  try {
    await browser.pages()
    return true
  } catch {
    return false
  }
}

/** Return the current browser if healthy; otherwise close it and launch a fresh one */
async function ensureHealthyBrowser(
  current: import('puppeteer').Browser,
  chromePath: string
): Promise<import('puppeteer').Browser> {
  if (await isBrowserHealthy(current)) return current
  console.warn('[analyzer] Shared browser disconnected - relaunching...')
  await current.close().catch(() => {})
  return puppeteer.launch({
    headless: true,
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--mute-audio',
      '--hide-scrollbars'
    ]
  })
}

/** ========================= Public entry point ========================= */

/** Main analysis function - iterate URLs sequentially, run Lighthouse + Puppeteer + tech checks */
export async function analyzeUrls(
  urls: string[],
  onProgress: (p: AnalysisProgress) => void,
  abortSignal?: { aborted: boolean }
): Promise<AnalysisResult[]> {
  if (urls.length === 0) return []

  const allResults: AnalysisResult[] = []
  const pct = (v: number | null | undefined): string =>
    v != null ? String(Math.round(v * 100)) : 'N/A'

  const chromePath = getChromePath()
  if (!chromePath) {
    console.warn(
      '[analyzer] No Chrome executable found - Lighthouse will rely on Puppeteer default path'
    )
  }

  try {
    await getLighthouseRunner()
    console.info('[analyzer] Lighthouse pre-warm successful')
  } catch (err) {
    console.warn(
      '[analyzer] Lighthouse pre-warm failed (will retry per URL):',
      (err as Error).message
    )
  }

  let sharedBrowser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--mute-audio',
      '--hide-scrollbars'
    ]
  })

  try {
    for (let i = 0; i < urls.length; i++) {
      if (abortSignal?.aborted) throw new Error('Aborted')

      const url = urls[i]
      onProgress({ current: i + 1, total: urls.length, currentUrl: url })

      // Run Lighthouse in its own isolated Chrome process.
      const fullLhr = await runLighthouse(url, abortSignal)
      if (abortSignal?.aborted) throw new Error('Aborted')
      const lhr = extractLhrSlim(fullLhr as Record<string, unknown>)

      // Ensure shared metadata browser is still alive before using it.
      sharedBrowser = await ensureHealthyBrowser(sharedBrowser, chromePath)

      // Puppeteer SEO metadata extraction.
      const meta = await getSEOData(url, sharedBrowser)

      // Technical SEO checks (HTTP HEAD requests).
      const tech = await getTechChecks(url)

      allResults.push({ url, lhr, meta, tech })

      const perfScore = lhr ? pct(lhr.categories?.performance?.score) : 'N/A'
      const seoScore = lhr ? pct(lhr.categories?.seo?.score) : 'N/A'

      onProgress({
        current: i + 1,
        total: urls.length,
        currentUrl: url,
        perfScore,
        seoScore
      })

      if (typeof globalThis.gc === 'function') globalThis.gc()
    }
  } finally {
    await sharedBrowser.close().catch(() => {})
  }

  return allResults
}
