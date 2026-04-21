/** IPC handlers — the bridge between the React renderer and the SEO pipeline */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import { crawlUrls } from './seo/crawler'
import { analyzeUrls } from './seo/analyzer'
import { generateExcelReport } from './seo/report-generator'
import type { Locale, UrlStatusEntry, AnalysisResult } from './seo/types'

/** Shared state across IPC calls — reset at the start of each long-running job */
let lastCrawlUrlStatus: UrlStatusEntry[] | null = null
let lastCrawlSeoUrls: string[] = []
let lastCrawlAllUrls: string[] = []
let lastAnalysisResults: AnalysisResult[] = []
let analysisStartTime = 0
let abortController: { aborted: boolean } = { aborted: false }

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

/** Register all IPC handlers for the SEO analysis workflow */
export function registerIpcHandlers(): void {
  /** Start website crawl to discover URLs */
  ipcMain.handle(
    'seo:start-crawl',
    async (event, rootUrl: string): Promise<{ seoUrls: string[]; allUrls: string[] }> => {
      abortController = { aborted: false }
      // Reset crawl state so stale data never leaks into a fresh run
      lastCrawlUrlStatus = null
      lastCrawlSeoUrls = []
      lastCrawlAllUrls = []
      const result = await crawlUrls(
        rootUrl,
        (progress) => {
          event.sender.send('seo:progress', { type: 'crawl', ...progress })
        },
        abortController
      )
      lastCrawlUrlStatus = result.urlStatusData
      lastCrawlSeoUrls = result.seoUrls
      lastCrawlAllUrls = result.allUrls
      return { seoUrls: result.seoUrls, allUrls: result.allUrls }
    }
  )

  /** Open file dialog and parse a .txt file containing URLs (one per line) */
  ipcMain.handle('seo:parse-urls-file', async (): Promise<string[] | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select URL list file',
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    let content: string
    try {
      content = fs.readFileSync(result.filePaths[0], 'utf-8')
    } catch (err) {
      console.error('[ipc] Failed to read URL list file:', (err as Error).message)
      return null
    }

    // Strip BOM, normalize line endings, dedupe while preserving order.
    const seen = new Set<string>()
    const urls: string[] = []
    for (const raw of stripBom(content).split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || !/^https?:\/\//i.test(line)) continue
      if (seen.has(line)) continue
      seen.add(line)
      urls.push(line)
    }
    if (urls.length === 0) return null

    lastCrawlUrlStatus = null
    lastCrawlSeoUrls = urls
    lastCrawlAllUrls = urls
    return urls
  })

  /** Run Lighthouse analysis on a list of URLs */
  ipcMain.handle(
    'seo:start-analysis',
    async (event, urls: string[]): Promise<AnalysisResult[]> => {
      abortController = { aborted: false }
      analysisStartTime = Date.now()
      // Clear previous results so a failed/partial run never bleeds into the report
      lastAnalysisResults = []
      // `onPartial` lets the analyzer hand us completed rows as they arrive —
      // if the user aborts mid-run we keep whatever finished, so a partial
      // report is still available.
      const results = await analyzeUrls(
        urls,
        (progress) => {
          event.sender.send('seo:progress', { type: 'analysis', ...progress })
        },
        abortController,
        (partial) => {
          lastAnalysisResults = partial
        }
      )
      lastAnalysisResults = results
      return results
    }
  )

  /** Generate Excel report and save to user-selected path */
  ipcMain.handle(
    'seo:save-report',
    async (_event, locale: Locale): Promise<{ success: boolean; filePath?: string }> => {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false }

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
      if (result.canceled || !result.filePath) return { success: false }

      try {
        const reportDate = localeDateTime()
        const urlStatus =
          lastCrawlUrlStatus ??
          lastAnalysisResults.map((r) => ({
            url: r.url,
            status: r.lhr ? 200 : 0,
            redirectTo: null,
            label: r.lhr ? '✅ OK' : '❌ Error'
          }))
        const buffer = await generateExcelReport(
          urlStatus,
          lastAnalysisResults,
          locale,
          reportDate,
          analysisStartTime || Date.now()
        )
        fs.writeFileSync(result.filePath, buffer)
        return { success: true, filePath: result.filePath }
      } catch (err) {
        console.error('[ipc] Report generation failed:', err)
        return { success: false }
      }
    }
  )

  /** Download the crawled URL list as a .txt file */
  ipcMain.handle('seo:download-urls', async (_event, type: 'seo' | 'all'): Promise<boolean> => {
    const urls = type === 'seo' ? lastCrawlSeoUrls : lastCrawlAllUrls
    const win = BrowserWindow.getFocusedWindow()
    if (!win || urls.length === 0) return false

    const host = urls[0] ? `-${safeHostname(urls[0])}` : ''
    const defaultName =
      type === 'seo' ? `seo_urls${host}.txt` : `all_urls${host}.txt`

    const result = await dialog.showSaveDialog(win, {
      title: type === 'seo' ? 'Save SEO URLs' : 'Save All URLs',
      defaultPath: defaultName,
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return false
    try {
      // Use platform-native newlines so the file opens cleanly in Notepad.
      const eol = process.platform === 'win32' ? '\r\n' : '\n'
      fs.writeFileSync(result.filePath, urls.join(eol), 'utf-8')
      return true
    } catch (err) {
      console.error('[ipc] Failed to write URL list:', (err as Error).message)
      return false
    }
  })

  /** Abort the current crawl or analysis operation (cooperative) */
  ipcMain.handle('seo:abort', async () => {
    abortController.aborted = true
    return true
  })
}
