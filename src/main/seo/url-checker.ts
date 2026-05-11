/** URL status checker — validates HTTP status and redirects for uploaded URL lists */
import puppeteer, { type Browser } from 'puppeteer'
import type { UrlStatusEntry } from './types'
import { getChromePath } from './chrome'

const CHECK_TIMEOUT = 15000
const MAX_RETRIES = 2
const CONCURRENCY = 5

/** Check a single URL's HTTP status and redirect chain using Puppeteer */
async function checkUrlStatus(
  browser: Browser,
  url: string,
  retries = 0
): Promise<UrlStatusEntry> {
  let page: import('puppeteer').Page | null = null
  try {
    page = await browser.newPage()

    // Suppress console noise coming from target pages
    page.on('console', () => {})
    page.on('pageerror', () => {})

    // Block heavy resources — we only need the HTTP response status
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const type = req.resourceType()
      if (type === 'font' || type === 'image' || type === 'media' || type === 'stylesheet') {
        req.abort()
      } else {
        req.continue()
      }
    })

    // Set a reasonable user agent
    try {
      const client = await page.createCDPSession()
      await client.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (compatible; SEO-Analyzer/5.0; +https://github.com/seo-audit)'
      })
    } catch {
      // CDP setup is best-effort
    }

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: CHECK_TIMEOUT
    })

    const status = response?.status() ?? 0
    const finalUrl = page.url()
    
    // Normalize URLs for comparison (strip trailing slash, hash, etc.)
    const normalizeForComparison = (u: string): string => {
      try {
        const parsed = new URL(u)
        parsed.hash = ''
        let path = parsed.pathname
        if (path !== '/' && path.endsWith('/')) {
          path = path.slice(0, -1)
        }
        parsed.pathname = path
        return parsed.toString()
      } catch {
        return u
      }
    }

    const normalizedOriginal = normalizeForComparison(url)
    const normalizedFinal = normalizeForComparison(finalUrl)
    const redirectTo = normalizedFinal !== normalizedOriginal ? finalUrl : null

    // Generate label based on status and redirect
    let label: string
    if (!status || status === 0) {
      label = '❌ Error'
    } else if (redirectTo) {
      label = '↩️ Redirect'
    } else if (status >= 200 && status < 300) {
      label = '✅ OK'
    } else if (status >= 300 && status < 400) {
      label = '↩️ Redirect'
    } else if (status >= 400 && status < 500) {
      label = '⚠ 4xx'
    } else {
      label = '💀 5xx'
    }

    return { url, status, redirectTo, label }
  } catch (err) {
    // Retry logic for transient failures
    if (retries < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * (retries + 1)))
      return checkUrlStatus(browser, url, retries + 1)
    }

    console.warn(`[url-checker] Failed to check "${url}":`, (err as Error).message)
    return {
      url,
      status: 0,
      redirectTo: null,
      label: '❌ Error'
    }
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

/** Check HTTP status and redirects for a list of URLs with progress reporting */
export async function checkUrlStatuses(
  urls: string[],
  onProgress?: (current: number, total: number, url: string) => void,
  abortSignal?: { aborted: boolean }
): Promise<UrlStatusEntry[]> {
  if (urls.length === 0) return []

  console.log(`[url-checker] Starting check for ${urls.length} URLs with concurrency ${CONCURRENCY}`)

  const chromePath = getChromePath()
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--mute-audio',
      '--hide-scrollbars',
      '--log-level=3',
    ]
  })

  const results: UrlStatusEntry[] = []
  const queue = [...urls]
  let completed = 0
  const running = new Set<Promise<void>>()

  try {
    while ((queue.length > 0 || running.size > 0) && !abortSignal?.aborted) {
      // Start new checks up to concurrency limit
      while (queue.length > 0 && running.size < CONCURRENCY && !abortSignal?.aborted) {
        const url = queue.shift()!
        
        const task = (async () => {
          const result = await checkUrlStatus(browser, url)
          results.push(result)
          completed++
          console.log(`[url-checker] [${completed}/${urls.length}] ${url} -> status: ${result.status}, redirect: ${result.redirectTo ? 'yes' : 'no'}`)
          onProgress?.(completed, urls.length, url)
        })()

        running.add(task)
        task.finally(() => running.delete(task))
      }

      // Wait for at least one task to complete
      if (running.size > 0) {
        await Promise.race(running)
      }
    }

    // Wait for all remaining tasks
    await Promise.allSettled(running)
  } finally {
    await browser.close().catch(() => {})
  }

  // Sort results to match original URL order
  const urlIndexMap = new Map(urls.map((url, idx) => [url, idx]))
  results.sort((a, b) => (urlIndexMap.get(a.url) ?? 0) - (urlIndexMap.get(b.url) ?? 0))

  console.log(`[url-checker] Check completed. Total results: ${results.length}`)

  return results
}
