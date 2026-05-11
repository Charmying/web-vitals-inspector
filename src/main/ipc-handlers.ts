/** IPC handlers — the bridge between the React renderer and the SEO pipeline */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import { crawlUrls } from './seo/crawler'
import { analyzeUrls } from './seo/analyzer'
import { generateExcelReport } from './seo/report-generator'
import { checkUrlStatuses } from './seo/url-checker'
import type { Locale, UrlStatusEntry, AnalysisResult } from './seo/types'
import { isHttpUrl, type DownloadUrlsResult, type ParseUrlsFileResult, type SaveReportResult } from '../shared/ipc'

const MAX_URL_FILE_BYTES = 5 * 1024 * 1024
const MAX_URL_COUNT = 10000
const DEFAULT_ANALYSIS_CHUNK_SIZE = 200
const LARGE_ANALYSIS_THRESHOLD = 1000

/** Shared state across IPC calls — reset at the start of each long-running job */
let lastCrawlUrlStatus: UrlStatusEntry[] | null = null
let lastCrawlSeoUrls: string[] = []
let lastCrawlAllUrls: string[] = []
let lastAnalysisResults: AnalysisResult[] = []
let analysisStartTime = 0
let analysisDurationMs = 0
let abortController: { aborted: boolean } = { aborted: false }
let activeJobId = 0

/** Strip UTF-8 BOM (common when .txt is saved from Windows Notepad) */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/** Extract hostname from a URL for filename suggestions, safely falling back on failure */
function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return 'site'
  }
}

/** Pad zero — used for building yyyyMMdd_HHmmss timestamps */
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** yyyyMMdd-HHmmss in local time, safe across all platforms */
function localTimestamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  )
}

/** Human-readable local date/time for report body (respects user's OS locale) */
function localeDateTime(d = new Date()): string {
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
}

function sanitizeUrls(inputs: string[]): string[] {
  const seen = new Set<string>()
  const urls: string[] = []

  for (const raw of inputs) {
    const line = raw.trim()
    if (!line || !isHttpUrl(line)) continue
    if (seen.has(line)) continue
    seen.add(line)
    urls.push(line)
    if (urls.length >= MAX_URL_COUNT) break
  }

  return urls
}

function getAnalysisChunkSize(totalUrls: number): number {
  const raw = process.env.SEO_ANALYSIS_CHUNK_SIZE
  const parsed = Number(raw)
  if (Number.isInteger(parsed) && parsed > 0) {
    return Math.min(parsed, totalUrls)
  }
  if (totalUrls >= LARGE_ANALYSIS_THRESHOLD) {
    return Math.min(DEFAULT_ANALYSIS_CHUNK_SIZE, totalUrls)
  }
  return totalUrls
}

function beginJob(): { jobId: number; signal: { aborted: boolean } } {
  activeJobId += 1
  abortController = { aborted: false }
  return { jobId: activeJobId, signal: abortController }
}

/** Register all IPC handlers for the SEO analysis workflow */
export function registerIpcHandlers(): void {
  /** Start website crawl to discover URLs */
  ipcMain.handle(
    'seo:start-crawl',
    async (event, rootUrl: string, locale?: 'en' | 'zh'): Promise<{ seoUrls: string[]; allUrls: string[] }> => {
      if (!isHttpUrl(rootUrl)) throw new Error('Invalid root URL. Only http:// and https:// URLs are allowed.')

      const { jobId, signal } = beginJob()
      lastCrawlUrlStatus = null
      lastCrawlSeoUrls = []
      lastCrawlAllUrls = []
      const result = await crawlUrls(
        rootUrl,
        (progress) => {
          if (jobId !== activeJobId || signal.aborted) return
          event.sender.send('seo:progress', { type: 'crawl', ...progress })
        },
        signal,
        locale === 'en' ? 'en' : 'zh'
      )
      if (jobId !== activeJobId || signal.aborted) throw new Error('Crawl aborted or superseded by a newer job.')
      lastCrawlUrlStatus = result.urlStatusData
      lastCrawlSeoUrls = result.seoUrls
      lastCrawlAllUrls = result.allUrls
      return { seoUrls: result.seoUrls, allUrls: result.allUrls }
    }
  )

  /** Open file dialog and parse a .txt file containing URLs (one per line) */
  ipcMain.handle('seo:parse-urls-file', async (): Promise<ParseUrlsFileResult> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { status: 'error', reason: 'no-window' }
    const result = await dialog.showOpenDialog(win, {
      title: 'Select URL list file',
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { status: 'cancelled' }

    let content: string
    try {
      const stat = fs.statSync(result.filePaths[0])
      if (stat.size > MAX_URL_FILE_BYTES) {
        console.error('[ipc] URL list file is too large:', stat.size)
        return { status: 'error', reason: 'too-large' }
      }

      const buf = fs.readFileSync(result.filePaths[0])
      if (buf.includes(0x00)) {
        console.error('[ipc] URL list file appears to be binary, aborting parse.')
        return { status: 'error', reason: 'binary' }
      }

      content = buf.toString('utf-8')
    } catch (err) {
      console.error('[ipc] Failed to read URL list file:', (err as Error).message)
      return {
        status: 'error',
        reason: 'read-failed',
        message: (err as Error).message
      }
    }

    const urls = sanitizeUrls(stripBom(content).split(/\r?\n/))
    if (urls.length === 0) return { status: 'error', reason: 'no-valid-urls' }

    lastCrawlUrlStatus = null
    lastCrawlSeoUrls = urls
    lastCrawlAllUrls = urls
    return { status: 'loaded', urls }
  })

  /** Run Lighthouse analysis on a list of URLs */
  ipcMain.handle(
    'seo:start-analysis',
    async (event, urls: string[]): Promise<AnalysisResult[]> => {
      const cleanUrls = sanitizeUrls(Array.isArray(urls) ? urls : [])
      if (cleanUrls.length === 0) {
        throw new Error('No valid URLs to analyze.')
      }

      // CRITICAL: Create job and signal BEFORE any async operations
      const { jobId, signal } = beginJob()
      
      const crawlAllUrlSet = new Set(lastCrawlAllUrls)
      const isFromCurrentCrawl =
        crawlAllUrlSet.size > 0 && cleanUrls.every((u) => crawlAllUrlSet.has(u))
      
      // If URLs are not from a crawl (e.g., uploaded file or single URL),
      // check their HTTP status and redirects before analysis
      if (!isFromCurrentCrawl) {
        lastCrawlSeoUrls = cleanUrls
        lastCrawlAllUrls = cleanUrls
        
        console.log(`[ipc] Starting URL status check for ${cleanUrls.length} URLs...`)
        
        // Check URL statuses with progress reporting
        try {
          const statusResults = await checkUrlStatuses(
            cleanUrls,
            (current, total, url) => {
              if (jobId !== activeJobId || signal.aborted) return
              event.sender.send('seo:progress', {
                type: 'url-check',
                phase: 'checking',
                current,
                total,
                currentUrl: url
              })
            },
            signal
          )
          
          if (jobId !== activeJobId || signal.aborted) {
            throw new Error('URL check aborted or superseded by a newer job.')
          }
          
          console.log(`[ipc] URL status check completed. Results: ${statusResults.length} entries`)
          if (statusResults.length > 0) {
            console.log(`[ipc] Sample result:`, statusResults[0])
          }
          
          lastCrawlUrlStatus = statusResults.length > 0 ? statusResults : null
        } catch (err) {
          if (jobId !== activeJobId || signal.aborted) {
            throw new Error('URL check aborted or superseded by a newer job.')
          }
          console.error('[ipc] URL status check failed:', (err as Error).message)
          console.error('[ipc] Error stack:', (err as Error).stack)
          lastCrawlUrlStatus = null
        }
      }

      analysisStartTime = Date.now()
      analysisDurationMs = 0
      lastAnalysisResults = []
      const totalUrls = cleanUrls.length
      const chunkSize = getAnalysisChunkSize(totalUrls)
      const chunkCount = Math.ceil(totalUrls / chunkSize)
      const aggregated: AnalysisResult[] = []

      console.log(
        `[ipc] Starting analysis: ${totalUrls} URLs in ${chunkCount} chunk(s), chunk size=${chunkSize}`
      )

      // `onPartial` lets the analyzer hand us completed rows as they arrive.
      // We merge completed chunks + current chunk so abort still preserves
      // maximum progress for partial reporting.
      try {
        for (let offset = 0; offset < totalUrls; offset += chunkSize) {
          if (jobId !== activeJobId || signal.aborted) {
            throw new Error('Analysis aborted or superseded by a newer job.')
          }

          const chunkIndex = Math.floor(offset / chunkSize)
          const chunkUrls = cleanUrls.slice(offset, offset + chunkSize)

          const chunkResults = await analyzeUrls(
            chunkUrls,
            (progress) => {
              if (jobId !== activeJobId || signal.aborted) return
              event.sender.send('seo:progress', {
                type: 'analysis',
                current: offset + progress.current,
                total: totalUrls,
                currentUrl: progress.currentUrl,
                perfScore: progress.perfScore,
                seoScore: progress.seoScore
              })
            },
            signal,
            (partial) => {
              if (jobId !== activeJobId || signal.aborted) return
              lastAnalysisResults = [...aggregated, ...partial]
            }
          )

          if (jobId !== activeJobId || signal.aborted) {
            throw new Error('Analysis aborted or superseded by a newer job.')
          }

          aggregated.push(...chunkResults)
          lastAnalysisResults = aggregated.slice()

          console.log(
            `[ipc] Analysis chunk ${chunkIndex + 1}/${chunkCount} done: ` +
              `${chunkResults.length} results, total accumulated=${aggregated.length}`
          )

          if (typeof globalThis.gc === 'function') {
            globalThis.gc()
            console.log(`[ipc] GC triggered after chunk ${chunkIndex + 1}/${chunkCount}`)
          }
        }

        return aggregated
      } finally {
        if (jobId === activeJobId && analysisStartTime > 0) {
          analysisDurationMs = Math.max(Date.now() - analysisStartTime, 0)
        }
        // Force GC after analysis completes
        if (typeof globalThis.gc === 'function') {
          globalThis.gc()
          console.log('[ipc] GC triggered after analysis completion')
        }
      }
    }
  )

  /** Generate Excel report and save to user-selected path */
  ipcMain.handle(
    'seo:save-report',
    async (_event, locale: Locale): Promise<SaveReportResult> => {
      if (locale !== 'en' && locale !== 'zh') throw new Error('Unsupported report locale.')

      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { status: 'error', message: 'No active application window.' }

      // Suggest a filename that embeds the audited hostname + local timestamp —
      // far more useful than a generic name when a user keeps many reports.
      const firstUrl =
        lastCrawlSeoUrls[0] ||
        lastCrawlAllUrls[0] ||
        lastAnalysisResults[0]?.url ||
        ''
      const hostPart = firstUrl ? `-${safeHostname(firstUrl)}` : ''
      const defaultName = `seo_lighthouse_report${hostPart}-${localTimestamp()}.xlsx`

      const result = await dialog.showSaveDialog(win, {
        title: 'Save SEO Report',
        defaultPath: defaultName,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      })
      if (result.canceled || !result.filePath) return { status: 'cancelled' }

      try {
        const reportDate = localeDateTime()
        
        console.log(`[ipc] Generating report. lastCrawlUrlStatus:`, lastCrawlUrlStatus ? `${lastCrawlUrlStatus.length} entries` : 'null')
        console.log(`[ipc] lastAnalysisResults: ${lastAnalysisResults.length} entries`)
        
        // Build URL status data that matches ONLY the analyzed URLs
        const analyzedUrlSet = new Set(lastAnalysisResults.map((r) => r.url))
        const urlStatus = lastCrawlUrlStatus
          ? lastCrawlUrlStatus.filter((entry) => analyzedUrlSet.has(entry.url))
          : lastAnalysisResults.map((r) => ({
              url: r.url,
              status: null,
              redirectTo: null,
              label:
                locale === 'zh'
                  ? 'ℹ 僅分析，未執行爬取'
                  : 'ℹ Analysis only, not crawled'
            }))
        
        console.log(`[ipc] Final urlStatus for report: ${urlStatus.length} entries`)
        if (urlStatus.length > 0) {
          console.log(`[ipc] Sample urlStatus:`, urlStatus[0])
        }
        
        const buffer = await generateExcelReport(
          urlStatus,
          lastAnalysisResults,
          locale,
          reportDate,
          analysisDurationMs
        )
        fs.writeFileSync(result.filePath, buffer)
        return { status: 'saved', filePath: result.filePath }
      } catch (err) {
        console.error('[ipc] Report generation failed:', err)
        return {
          status: 'error',
          message: err instanceof Error ? err.message : String(err)
        }
      }
    }
  )

  /** Download the crawled URL list as a .txt file */
  ipcMain.handle('seo:download-urls', async (_event, type: 'seo' | 'all'): Promise<DownloadUrlsResult> => {
    if (type !== 'seo' && type !== 'all') {
      return { status: 'error', message: 'Invalid download type.' }
    }

    const urls = type === 'seo' ? lastCrawlSeoUrls : lastCrawlAllUrls
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { status: 'error', message: 'No active application window.' }
    if (urls.length === 0) return { status: 'error', message: 'No URLs available to download.' }

    const host = urls[0] ? `-${safeHostname(urls[0])}` : ''
    const defaultName =
      type === 'seo' ? `seo_urls${host}.txt` : `all_urls${host}.txt`

    const result = await dialog.showSaveDialog(win, {
      title: type === 'seo' ? 'Save SEO URLs' : 'Save All URLs',
      defaultPath: defaultName,
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return { status: 'cancelled' }
    try {
      // Use platform-native newlines so the file opens cleanly in Notepad.
      const eol = process.platform === 'win32' ? '\r\n' : '\n'
      fs.writeFileSync(result.filePath, urls.join(eol), 'utf-8')
      return { status: 'saved', filePath: result.filePath, count: urls.length }
    } catch (err) {
      console.error('[ipc] Failed to write URL list:', (err as Error).message)
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err)
      }
    }
  })

  /** Abort the current crawl or analysis operation (cooperative) */
  ipcMain.handle('seo:abort', async () => {
    abortController.aborted = true
    return true
  })
}
