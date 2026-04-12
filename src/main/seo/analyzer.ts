/** SEO analyzer module — runs Lighthouse audits and Puppeteer-based metadata extraction */
import https from 'https'
import http from 'http'
import puppeteer from 'puppeteer'
import type lighthouse from 'lighthouse'
import type { AnalysisProgress, AnalysisResult, LhrSlim, SeoMeta, TechChecks } from './types'
import { getChromePath } from './chrome'

const LH_RETRY = 2
const PAGE_TIMEOUT = 60000
const LH_TIMEOUT = 300000

/** Extract a slim subset of Lighthouse report data (categories + audits) */
function extractLhrSlim(lhr: Record<string, unknown>): LhrSlim | null {
  if (!lhr) return null
  const slim: LhrSlim = { categories: {}, audits: {} }
  const cats = (lhr.categories ?? {}) as Record<string, Record<string, unknown>>
  for (const [catId, cat] of Object.entries(cats)) {
    slim.categories[catId] = {
      score: cat.score as number | null,
      auditRefs: ((cat.auditRefs as { id: string }[]) ?? []).map((r) => ({ id: r.id }))
    }
  }
  const audits = (lhr.audits ?? {}) as Record<string, Record<string, unknown>>
  for (const [id, audit] of Object.entries(audits)) {
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

/** Run Lighthouse audit programmatically with retry logic.
 *
 * Lighthouse 13+ is ESM-only. Since `lighthouse` is declared external in
 * electron.vite.config.ts it is NOT bundled — `import('lighthouse')` resolves
 * from node_modules at runtime via Electron's Node.js, which supports ESM
 * dynamic imports from a CJS context.
 *
 * This replaces the previous CLI subprocess approach which required `node` to
 * be present in the system PATH — causing silent failures on machines that do
 * not have a standalone Node.js installation.
 */
async function runLighthouse(url: string): Promise<Record<string, unknown> | null> {
  const chromePath = getChromePath()

  for (let attempt = 1; attempt <= LH_RETRY; attempt++) {
    let browser: import('puppeteer').Browser | null = null
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: chromePath || undefined,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--mute-audio',
          '--hide-scrollbars'
        ]
      })

      const chromePort = parseInt(new URL(browser.wsEndpoint()).port, 10)

      const { default: runLH } = (await import('lighthouse')) as {
        default: typeof lighthouse
      }

      const lhResult = await Promise.race([
        runLH(url, {
          port: chromePort,
          logLevel: 'error',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Lighthouse timeout (${LH_TIMEOUT}ms)`)), LH_TIMEOUT)
        )
      ])

      return (lhResult?.lhr as unknown as Record<string, unknown>) ?? null
    } catch (err) {
      console.warn(`⚠ Lighthouse attempt ${attempt}/${LH_RETRY}: ${(err as Error).message}`)
      if (attempt === LH_RETRY) return null
      await new Promise((r) => setTimeout(r, 3000))
    } finally {
      await browser?.close().catch(() => {})
    }
  }
  return null
}

/** Extract SEO metadata from a page using Puppeteer (title, meta tags, headings, images, etc.) */
async function getSEOData(url: string, browser: import('puppeteer').Browser): Promise<SeoMeta | null> {
  let page: import('puppeteer').Page | null = null
  try {
    page = await browser.newPage()
    const client = await page.createCDPSession()
    await client.send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (compatible; SEO-Analyzer/5.0; +https://github.com/seo-audit)' })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })

    const data = await page.evaluate(() => {
      const getMeta = (sel: string, attr = 'content'): string | null => document.querySelector(sel)?.getAttribute(attr) ?? null

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
      const h1Text = h1Els.map((el) => el.innerText.trim()).filter(Boolean)
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
      const words = bodyText.match(/[\u4e00-\u9fff]|[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+/gu) || []
      const wordCount = words.length
      const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => {
        try {
          const json = JSON.parse(s.textContent || '')
          const types: string[] = Array.isArray(json) ? json.map((j: Record<string, string>) => j['@type']) : [json['@type']]
          return types.filter(Boolean)
        } catch {
          return []
        }
      })

      const hreflangLinks = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang')!)

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

/** Main analysis function — iterate URLs sequentially, run Lighthouse + Puppeteer + tech checks */
export async function analyzeUrls(urls: string[], onProgress: (p: AnalysisProgress) => void, abortSignal?: { aborted: boolean }): Promise<AnalysisResult[]> {
  if (urls.length === 0) return []

  const allResults: AnalysisResult[] = []
  const pct = (v: number | null | undefined): string => v != null ? String(Math.round(v * 100)) : 'N/A'

  const chromePath = getChromePath()
  const sharedBrowser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--mute-audio', '--hide-scrollbars'
    ]
  })

  try {
    for (let i = 0; i < urls.length; i++) {
      if (abortSignal?.aborted) throw new Error('Aborted')

      const url = urls[i]
      onProgress({ current: i + 1, total: urls.length, currentUrl: url })

      // Run Lighthouse
      const fullLhr = await runLighthouse(url)
      const lhr = extractLhrSlim(fullLhr as Record<string, unknown>)

      // Puppeteer SEO data
      const meta = await getSEOData(url, sharedBrowser)

      // Tech checks
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

      // Attempt GC
      if (typeof globalThis.gc === 'function') globalThis.gc()
    }
  } finally {
    await sharedBrowser.close().catch(() => {})
  }

  return allResults
}
