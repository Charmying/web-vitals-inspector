/**
 * SEO analyzer — runs Lighthouse audits and Puppeteer-based metadata extraction.
 * Architecture: Chrome Pool
 */

import https from 'https'
import http from 'http'
import { execSync } from 'child_process'
import v8 from 'v8'
import puppeteer from 'puppeteer'
import type lighthouse from 'lighthouse'
import type { AnalysisProgress, AnalysisResult, LhrSlim, SeoMeta, TechChecks } from './types'
import { getChromePath } from './chrome'

/* ========================= Tuning constants ========================= */

/** Maximum Lighthouse retry attempts per URL */
const LH_RETRY = 3
/** Per-page Puppeteer navigation timeout (ms) */
const PAGE_TIMEOUT = 60_000
/** Lighthouse audit timeout per URL (ms) */
const LH_TIMEOUT = 150_000
/** Concurrent Chrome instances (Lighthouse pool size + 1 shared metadata browser) */
const PARALLEL_WORKERS = 3
/**
 * Recycle a Chrome slot after this many Lighthouse uses.
 * Chrome's V8 heap accumulates page-specific garbage; recycling keeps it bounded.
 */
const RECYCLE_AFTER_USES = 25
/**
 * Heap fractions for memory back-pressure.
 * Thresholds are derived from runtime V8 heap limits.
 */
const PAUSE_HEAP_FRACTION = 0.80
const RESUME_HEAP_FRACTION = 0.60

/* ========================= Chrome flags ========================= */

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
  '--log-level=3',
  '--disable-features=InterestFeedContentSuggestions,ChromeWhatsNewUI',
]

/* ========================= Memory back-pressure ========================= */

/**
 * Block until heap usage drops below RESUME_HEAP_FRACTION of the current runtime heap limit.
 * Forces GC while waiting so the runtime can reclaim large LHR objects.
 */
function getHeapLimitMb(): number {
  try {
    const limitBytes = v8.getHeapStatistics().heap_size_limit
    if (Number.isFinite(limitBytes) && limitBytes > 0) {
      return Math.round(limitBytes / 1024 / 1024)
    }
  } catch {
    // Fallback when statistics are temporarily unavailable.
  }
  return 4096
}

async function waitForMemoryBudget(abortSignal?: { aborted: boolean }): Promise<boolean> {
  const heapLimitMb = getHeapLimitMb()
  const limitBytes = heapLimitMb * 1024 * 1024
  const pauseBytes = limitBytes * PAUSE_HEAP_FRACTION
  const resumeBytes = limitBytes * RESUME_HEAP_FRACTION

  const initial = process.memoryUsage().heapUsed
  if (initial < pauseBytes) return true

  console.warn(
    `[analyzer] Memory pressure: ${Math.round(initial / 1024 / 1024)} MB / ${heapLimitMb} MB` +
      ` — pausing until < ${Math.round(resumeBytes / 1024 / 1024)} MB`
  )

  let waited = 0
  while (true) {
    if (abortSignal?.aborted) {
      console.info('[analyzer] Memory wait cancelled by abort signal')
      return false
    }
    if (typeof globalThis.gc === 'function') globalThis.gc()
    await new Promise<void>((r) => setTimeout(r, 500))
    waited += 500

    const current = process.memoryUsage().heapUsed
    if (current < resumeBytes) {
      console.info(
        `[analyzer] Memory recovered: ${Math.round(current / 1024 / 1024)} MB (after ${waited} ms)`
      )
      return true
    }
    if (waited % 5_000 === 0) {
      console.warn(
        `[analyzer] Waiting for memory: ${Math.round(current / 1024 / 1024)} MB (${waited / 1000}s elapsed)`
      )
    }
    // Safety valve — never deadlock the analysis pipeline
    if (waited >= 120_000) {
      console.error('[analyzer] Memory wait timeout (120s) — skipping this attempt to avoid OOM')
      return false
    }
  }
}

/* ========================= Chrome process tree killing ========================= */

/**
 * Gracefully close a Puppeteer browser, then force-kill the entire OS process
 * tree by PID.  This is the only reliable way to prevent Chrome sub-processes
 * (renderer, GPU, utility) from lingering for tens of seconds after close().
 */
async function forceKillChrome(browser: import('puppeteer').Browser): Promise<void> {
  const proc = browser.process()
  const pid = proc?.pid ?? null

  // 1. Graceful close (best-effort, 3-second timeout)
  try {
    const pages = await Promise.race<import('puppeteer').Page[]>([
      browser.pages(),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 2_000)),
    ]).catch(() => [] as import('puppeteer').Page[])
    await Promise.allSettled(pages.map((p) => p.close()))
    browser.disconnect()
    await Promise.race([browser.close(), new Promise<void>((r) => setTimeout(r, 3_000))])
  } catch {
    /* ignore — we kill by PID next */
  }

  if (!pid) return

  // 2. Force-kill by PID to eliminate all sub-processes
  try {
    if (process.platform === 'win32') {
      // /F = force-terminate, /T = include child process tree
      execSync(`taskkill /F /T /PID ${pid}`, { timeout: 5_000, stdio: 'ignore' })
    } else {
      // Kill process group (all children die with Chrome)
      try { process.kill(-pid, 'SIGKILL') } catch { /* not a group leader */ }
      try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
    }
  } catch {
    /* already dead */
  }

  // 3. Wait for PID to actually disappear (up to 3 seconds)
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0) // signal 0 = existence check only
      await new Promise<void>((r) => setTimeout(r, 100))
    } catch {
      break // process is gone
    }
  }
}

/* ========================= Chrome Pool ========================= */

interface ChromeSlot {
  browser: import('puppeteer').Browser
  pid: number | null
  useCount: number
  slotId: number
}

/**
 * Fixed-size pool of Chrome instances for Lighthouse analysis.
 *
 * Invariants upheld by this pool:
 *  • At most `size` Chrome processes are alive simultaneously — ever.
 *  • Each slot is recycled (force-killed + relaunched) after RECYCLE_AFTER_USES
 *    runs, or whenever a health-check finds it unresponsive.
 *  • acquire() blocks until a slot is free, creating natural back-pressure.
 *  • shutdown() force-kills every Chrome regardless of whether they are healthy.
 */
class ChromePool {
  private slots: ChromeSlot[] = []
  private idleIndices: number[] = []
  private waiters: ((index: number) => void)[] = []
  private slotIdCounter = 0

  constructor(
    private readonly chromePath: string,
    private readonly poolSize: number
  ) {}

  async initialize(): Promise<void> {
    for (let i = 0; i < this.poolSize; i++) {
      this.slots.push(await this.launchSlot())
      this.idleIndices.push(i)
    }
    console.info(`[ChromePool] Initialized ${this.poolSize} Chrome instances`)
  }

  private async launchSlot(): Promise<ChromeSlot> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: this.chromePath || undefined,
      args: LH_CHROME_FLAGS,
    })
    const pid = browser.process()?.pid ?? null
    const slotId = ++this.slotIdCounter
    console.info(`[ChromePool] Launched slot #${slotId} (PID: ${pid})`)
    return { browser, pid, useCount: 0, slotId }
  }

  /**
   * Acquire an idle Chrome slot. Blocks until one becomes available.
   * Recycles the slot (force-kill + relaunch) if overused or unhealthy.
   */
  async acquire(): Promise<number> {
    const index = await new Promise<number>((resolve) => {
      if (this.idleIndices.length > 0) {
        resolve(this.idleIndices.pop()!)
      } else {
        this.waiters.push(resolve)
      }
    })

    const slot = this.slots[index]
    const overused = slot.useCount >= RECYCLE_AFTER_USES
    const unhealthy = !overused && !(await isBrowserHealthy(slot.browser))

    if (overused || unhealthy) {
      const reason = overused ? `${slot.useCount} uses` : 'unhealthy'
      console.info(`[ChromePool] Recycling slot ${index} (${reason})`)
      await forceKillChrome(slot.browser)
      this.slots[index] = await this.launchSlot()
    }

    return index
  }

  getBrowser(index: number): import('puppeteer').Browser {
    return this.slots[index].browser
  }

  /**
   * Return a slot to the pool. Cleans up pages Lighthouse may have left open,
   * then wakes the next waiter or pushes back to idle queue.
   */
  async release(index: number): Promise<void> {
    this.slots[index].useCount++

    // Close any lingering Lighthouse pages (best-effort).
    // Keeping orphan pages alive can accumulate renderer memory over long runs.
    try {
      const pages = await this.slots[index].browser.pages().catch(() => [])
      await Promise.allSettled(
        pages.map(async (page) => {
          try {
            await page.close().catch(() => {})
          } catch { /* ignore */ }
        })
      )
    } catch { /* ignore */ }

    if (this.waiters.length > 0) {
      this.waiters.shift()!(index)
    } else {
      this.idleIndices.push(index)
    }
  }

  async recycle(index: number, reason: string): Promise<void> {
    console.info(`[ChromePool] Recycling slot ${index} (${reason})`)
    await forceKillChrome(this.slots[index].browser)
    this.slots[index] = await this.launchSlot()

    if (this.waiters.length > 0) {
      this.waiters.shift()!(index)
    } else {
      this.idleIndices.push(index)
    }
  }

  async shutdown(): Promise<void> {
    console.info(`[ChromePool] Shutting down ${this.slots.length} Chrome slots…`)
    await Promise.allSettled(this.slots.map((slot) => forceKillChrome(slot.browser)))
    this.slots = []
    this.idleIndices = []
    this.waiters = []
  }
}

/* ========================= Parallel processing helpers ========================= */

/**
 * Process an array of items with bounded concurrency.
 * Per-item errors are caught and yield null in the results array; only
 * intentional 'Aborted' signals propagate and halt all workers.
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
  onItemDone?: (result: R, index: number, completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let completed = 0
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      try {
        results[index] = await processor(items[index], index)
      } catch (err) {
        const msg = (err as Error).message ?? String(err)
        if (msg === 'Aborted') throw err
        console.error(`[batch] Worker error for item ${index}:`, msg)
        results[index] = null as unknown as R
      }
      completed++
      onItemDone?.(results[index], index, completed, items.length)
      onProgress?.(completed, items.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  )
  return results
}

/* ========================= Lighthouse runner (module-level singleton) ========================= */

let _lhRunner: typeof lighthouse | null = null
let _lighthouseRunChain: Promise<void> = Promise.resolve()

async function runExclusiveLighthouse<T>(operation: () => Promise<T>): Promise<T> {
  const previous = _lighthouseRunChain
  let release!: () => void
  _lighthouseRunChain = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous.catch(() => {})

  try {
    return await operation()
  } finally {
    release()
  }
}

function extractLhFunction(mod: unknown): typeof lighthouse | null {
  if (typeof mod === 'function') return mod as unknown as typeof lighthouse
  if (mod && typeof mod === 'object') {
    const m = mod as Record<string, unknown>
    if (typeof m.default === 'function') return m.default as typeof lighthouse
    if (typeof m.lighthouse === 'function') return m.lighthouse as typeof lighthouse
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
        `lighthouse module has no callable export. Keys: [${keys.join(', ')}]`
      )
    }
    _lhRunner = fn
    console.info('[analyzer] Lighthouse module loaded successfully')
    return _lhRunner
  } catch (err) {
    console.error('[analyzer] Failed to load Lighthouse:', (err as Error).message)
    throw err
  }
}

/* ========================= LHR slim extraction ========================= */

/** Extract a compact subset of the Lighthouse report (categories + audits only). */
function extractLhrSlim(lhr: Record<string, unknown>): LhrSlim | null {
  if (!lhr || typeof lhr !== 'object') return null
  const slim: LhrSlim = { categories: {}, audits: {} }

  const cats = (lhr.categories ?? {}) as Record<string, Record<string, unknown>>
  for (const [catId, cat] of Object.entries(cats)) {
    if (!cat || typeof cat !== 'object') continue
    slim.categories[catId] = {
      score: cat.score as number | null,
      auditRefs: ((cat.auditRefs as { id: string }[]) ?? []).map((r) => ({ id: r.id })),
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
      displayValue: (audit.displayValue as string) ?? '',
    }
  }
  return slim
}

/* ========================= Lighthouse execution (pool-based) ========================= */

/**
 * Run a Lighthouse audit for one URL using a Chrome slot from the pool.
 *
 * Per-attempt flow:
 *  1. waitForMemoryBudget()  — pauses if heap is critically high.
 *  2. pool.acquire()         — blocks until a Chrome slot is idle.
 *  3. Run Lighthouse against that Chrome's debugging port.
 *  4. pool.release()         — always in finally, cleaning up Lighthouse pages.
 *
 * Up to LH_RETRY attempts are made before returning null.
 */
async function runLighthouseInPool(
  url: string,
  pool: ChromePool,
  abortSignal?: { aborted: boolean }
): Promise<Record<string, unknown> | null> {
  let runLH: typeof lighthouse
  try {
    runLH = await getLighthouseRunner()
  } catch (err) {
    console.error(`[LH] Cannot run Lighthouse for "${url}": ${(err as Error).message}`)
    return null
  }

  for (let attempt = 1; attempt <= LH_RETRY; attempt++) {
    if (abortSignal?.aborted) return null

    // Memory back-pressure: wait before consuming a Chrome slot
    const memoryReady = await waitForMemoryBudget(abortSignal)
    if (!memoryReady) {
      if (abortSignal?.aborted) return null
      throw new Error('Memory pressure remained high for 120s')
    }

    let slotIndex = -1
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let recycleSlotReason: string | null = null

    try {
      slotIndex = await pool.acquire()
      if (abortSignal?.aborted) return null

      const browser = pool.getBrowser(slotIndex)
      const wsEndpoint = browser.wsEndpoint()
      if (!wsEndpoint) {
        throw new Error('Chrome wsEndpoint() is empty — remote-debugging-port=0 was not accepted')
      }
      const portStr = new URL(wsEndpoint).port
      const parsedPort = parseInt(portStr, 10)
      if (!portStr || isNaN(parsedPort) || parsedPort <= 0) {
        throw new Error(`Cannot parse debugging port from wsEndpoint: "${wsEndpoint}"`)
      }

      const lhResult = await runExclusiveLighthouse(async () => {
        const lhPromise = runLH(url, {
          port: parsedPort,
          logLevel: 'error',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        })

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`Lighthouse timed out after ${LH_TIMEOUT / 1000}s`)),
            LH_TIMEOUT
          )
        })

        try {
          return await Promise.race([lhPromise, timeoutPromise])
        } finally {
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
          lhPromise.catch(() => {})
        }
      })

      const lhr = (lhResult?.lhr as unknown as Record<string, unknown>) ?? null
      if (!lhr) throw new Error('Lighthouse returned a RunnerResult with no LHR payload')

      const catKeys = Object.keys((lhr.categories ?? {}) as Record<string, unknown>)
      if (catKeys.length === 0) {
        throw new Error('Lighthouse returned zero categories — Chrome failed to load the page')
      }
      const allScoresNull = catKeys.every((k) => {
        const cat = (lhr.categories as Record<string, { score: number | null }>)[k]
        return cat?.score == null
      })
      if (allScoresNull) throw new Error('All category scores are null — retrying')

      const scoreLog = catKeys
        .map((k) => {
          const score = (lhr.categories as Record<string, { score: number | null }>)[k]?.score
          return `${k}:${score != null ? Math.round(score * 100) : 'null'}`
        })
        .join(' | ')
      console.info(`[LH] attempt ${attempt} OK — "${url}" — ${scoreLog}`)
      return lhr
    } catch (err) {
      const msg = (err as Error).message ?? String(err)
      if (slotIndex >= 0 && msg !== 'Aborted') {
        recycleSlotReason = `audit failure: ${msg}`
      }
      console.warn(`[LH] attempt ${attempt}/${LH_RETRY} FAILED — "${url}"\n     → ${msg}`)
      if (attempt === LH_RETRY) {
        console.error(`[LH] All ${LH_RETRY} attempts exhausted for "${url}"`)
        return null
      }
      if (abortSignal?.aborted) return null
      await new Promise<void>((r) => setTimeout(r, 3_000 * attempt))
    } finally {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
      if (slotIndex >= 0) {
        if (recycleSlotReason) {
          await pool.recycle(slotIndex, recycleSlotReason)
        } else {
          await pool.release(slotIndex)
        }
      }
    }
  }

  return null
}

/* ========================= SEO metadata extraction (Puppeteer, shared browser) ========================= */

/** Extract SEO metadata from a page using Puppeteer. */
async function getSEOData(
  url: string,
  browser: import('puppeteer').Browser
): Promise<SeoMeta | null> {
  let page: import('puppeteer').Page | null = null
  try {
    page = await browser.newPage()
    page.on('console', () => {})
    page.on('pageerror', () => {})

    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const type = req.resourceType()
      if (type === 'font' || type === 'image' || type === 'media') {
        req.abort()
      } else {
        req.continue()
      }
    })

    try {
      const client = await page.createCDPSession()
      await client.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (compatible; SEO-Analyzer/5.0; +https://github.com/seo-audit)',
      })
    } catch { /* CDP is best-effort */ }

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
        try { return new URL(a.href).origin === origin } catch { return false }
      })
      const bodyText = document.body?.innerText || ''
      const words =
        bodyText.match(/[\u4e00-\u9fff]|[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+/gu) || []
      const wordCount = words.length
      const schemas = [
        ...document.querySelectorAll('script[type="application/ld+json"]'),
      ].flatMap((s) => {
        try {
          const json = JSON.parse(s.textContent || '')
          const types: string[] = Array.isArray(json)
            ? json.map((j: Record<string, string>) => j['@type'])
            : [json['@type']]
          return types.filter(Boolean)
        } catch { return [] }
      })
      const hreflangLinks = [
        ...document.querySelectorAll('link[rel="alternate"][hreflang]'),
      ].map((l) => l.getAttribute('hreflang')!)

      return {
        title, description, canonical, robots, viewport, lang,
        ogTitle, ogDesc, ogImage,
        h1Count: h1Els.length, h1Text,
        h2Count: h2Els.length,
        imgTotal, imgNoAlt,
        internalLinkCount: internalLinks.length,
        wordCount, schemas, hreflangLinks,
        hasOgTitle: !!ogTitle, hasOgDesc: !!ogDesc, hasOgImage: !!ogImage,
      }
    })

    return data
  } catch {
    return null
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

/* ========================= Technical SEO checks ========================= */

const fetchHead = (url: string): Promise<{ status: number | null; ok: boolean }> =>
  new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http
    try {
      const req = mod.request(url, { method: 'HEAD', timeout: 8_000 }, (res) => {
        resolve({ status: res.statusCode ?? null, ok: (res.statusCode ?? 999) < 400 })
      })
      req.on('error', () => resolve({ status: null, ok: false }))
      req.on('timeout', () => { req.destroy(); resolve({ status: null, ok: false }) })
      req.end()
    } catch {
      resolve({ status: null, ok: false })
    }
  })

async function getTechChecks(url: string): Promise<TechChecks> {
  let origin: string
  try { origin = new URL(url).origin } catch {
    return { isHttps: false, robotsTxtOk: false, sitemapOk: false }
  }
  const isHttps = url.startsWith('https://')
  const [robotsRes, sitemapRes] = await Promise.all([
    fetchHead(`${origin}/robots.txt`),
    fetchHead(`${origin}/sitemap.xml`),
  ])
  return { isHttps, robotsTxtOk: robotsRes.ok, sitemapOk: sitemapRes.ok }
}

/* ========================= Shared browser health management ========================= */

async function isBrowserHealthy(browser: import('puppeteer').Browser): Promise<boolean> {
  try { await browser.pages(); return true } catch { return false }
}

/** Serialise shared-browser restarts so at most one relaunch happens at a time. */
let _sharedBrowserRestartChain: Promise<import('puppeteer').Browser | null> =
  Promise.resolve(null)

async function ensureHealthyBrowser(
  current: import('puppeteer').Browser,
  chromePath: string
): Promise<import('puppeteer').Browser> {
  if (await isBrowserHealthy(current)) return current

  const restartOp = _sharedBrowserRestartChain.then(async (previous) => {
    if (previous && (await isBrowserHealthy(previous))) return previous
    console.warn('[analyzer] Shared browser disconnected — relaunching…')
    await forceKillChrome(current).catch(() => {})
    return puppeteer.launch({
      headless: true,
      executablePath: chromePath || undefined,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--mute-audio', '--hide-scrollbars', '--log-level=3',
      ],
    })
  })
  _sharedBrowserRestartChain = restartOp
  return restartOp
}

/* ========================= Public entry point ========================= */

/**
 * Analyse an array of URLs with Lighthouse + Puppeteer metadata extraction.
 *
 * Memory-safety guarantees:
 *  • Exactly PARALLEL_WORKERS Chrome processes are alive for Lighthouse at all times.
 *  • 1 additional shared Chrome process is used for metadata extraction.
 *  • Chrome slots are force-killed after RECYCLE_AFTER_USES runs (prevents
 *    per-Chrome memory growth from accumulated page data).
 *  • waitForMemoryBudget() pauses before each URL when heap >= 80 % of limit.
 *  • Full Lighthouse LHR objects (5–15 MB each) are freed immediately after
 *    slim extraction by deleting all enumerable properties.
 *  • GC is triggered after every PARALLEL_WORKERS URLs.
 *  • pool.shutdown() in the finally block force-kills all Chrome processes,
 *    guaranteeing zero lingering Chrome sub-processes after the job ends.
 */
export async function analyzeUrls(
  urls: string[],
  onProgress: (p: AnalysisProgress) => void,
  abortSignal?: { aborted: boolean },
  onPartial?: (results: AnalysisResult[]) => void
): Promise<AnalysisResult[]> {
  if (urls.length === 0) return []

  const chromePath = getChromePath()
  if (!chromePath) {
    console.warn('[analyzer] No Chrome executable found — relying on Puppeteer default path')
  }

  // Pre-warm Lighthouse to avoid cold-start latency on the first URL
  try {
    await getLighthouseRunner()
    console.info('[analyzer] Lighthouse pre-warm successful')
  } catch (err) {
    console.warn('[analyzer] Lighthouse pre-warm failed (will retry per URL):', (err as Error).message)
  }

  _sharedBrowserRestartChain = Promise.resolve(null)

  /* ========================= Initialise Chrome pool (Lighthouse) + shared browser (metadata) ========================= */
  const pool = new ChromePool(chromePath, PARALLEL_WORKERS)
  await pool.initialize()

  let sharedBrowser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--mute-audio', '--hide-scrollbars', '--log-level=3',
    ],
  })

  console.info(
    `[analyzer] Starting analysis: ${urls.length} URLs × ${PARALLEL_WORKERS} workers` +
      ` (Chrome recycle every ${RECYCLE_AFTER_USES} uses)`
  )

  try {
    const partialResultsByIndex: Array<AnalysisResult | null> = new Array(urls.length).fill(null)

    const results = await processBatch(
      urls,
      async (url) => {
        if (abortSignal?.aborted) throw new Error('Aborted')

        try {
          /* ========================= Lighthouse via pool ========================= */
          const fullLhr = await runLighthouseInPool(url, pool, abortSignal)
          if (abortSignal?.aborted) throw new Error('Aborted')

          // Extract slim LHR, then immediately free the multi-MB full object
          let lhr: LhrSlim | null = null
          if (fullLhr) {
            try { lhr = extractLhrSlim(fullLhr) } catch (e) {
              console.warn(`[analyzer] LHR slim extraction failed for "${url}":`, e)
            }
            // Delete all properties so GC can reclaim on the next collection
            for (const key in fullLhr) {
              delete (fullLhr as Record<string, unknown>)[key]
            }
          }

          /* ========================= Shared browser: metadata + tech checks (in parallel) ========================= */
          try {
            sharedBrowser = await ensureHealthyBrowser(sharedBrowser, chromePath)
          } catch (e) {
            console.warn(`[analyzer] Shared browser health check failed for "${url}":`, e)
          }

          const [meta, tech] = await Promise.all([
            getSEOData(url, sharedBrowser),
            getTechChecks(url),
          ])

          return { url, lhr, meta, tech } as AnalysisResult
        } catch (err) {
          const msg = (err as Error).message ?? String(err)
          if (msg === 'Aborted') throw new Error('Aborted')
          console.error(`[analyzer] Unexpected error for "${url}" — recording partial result:`, msg)
          return {
            url, lhr: null, meta: null,
            tech: { isHttps: url.startsWith('https://'), robotsTxtOk: false, sitemapOk: false },
          } as AnalysisResult
        }
      },
      PARALLEL_WORKERS,
      (completed, total) => {
        const currentUrl = urls[completed - 1] || ''
        onProgress({ current: completed, total, currentUrl, perfScore: 'Processing…', seoScore: 'Processing…' })

        // GC after every full parallel batch to reclaim LHR objects promptly
        if (completed % PARALLEL_WORKERS === 0 && typeof globalThis.gc === 'function') {
          globalThis.gc()
          const { heapUsed, heapTotal } = process.memoryUsage()
          console.info(
            `[analyzer] GC @ ${completed}/${total}` +
              ` | Heap: ${Math.round(heapUsed / 1024 / 1024)} MB` +
              ` / ${Math.round(heapTotal / 1024 / 1024)} MB`
          )
        }
      },
      (result, index) => {
        if (!onPartial) return
        if (result && typeof result === 'object') {
          partialResultsByIndex[index] = result as AnalysisResult
          onPartial(partialResultsByIndex.filter((r): r is AnalysisResult => r !== null))
        }
      }
    )

    const validResults = results.filter((r): r is AnalysisResult => r != null)
    onPartial?.(validResults.slice())
    return validResults
  } finally {
    /* ========================= Guaranteed cleanup — runs even on abort or unhandled errors ========================= */
    await pool.shutdown()                              // force-kills all Lighthouse Chromes
    await forceKillChrome(sharedBrowser).catch(() => {}) // force-kills metadata Chrome

    if (typeof globalThis.gc === 'function') {
      globalThis.gc()
      const { heapUsed } = process.memoryUsage()
      console.info(`[analyzer] Final GC | Heap: ${Math.round(heapUsed / 1024 / 1024)} MB`)
    }
  }
}
