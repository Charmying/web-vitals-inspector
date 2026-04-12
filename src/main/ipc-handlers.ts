import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import { crawlUrls } from './seo/crawler'
import { analyzeUrls } from './seo/analyzer'
import { generateExcelReport } from './seo/report-generator'
import type { Locale, UrlStatusEntry, AnalysisResult } from './seo/types'

/** Shared state across IPC calls */
let lastCrawlUrlStatus: UrlStatusEntry[] | null = null
let lastCrawlSeoUrls: string[] = []
let lastCrawlAllUrls: string[] = []
let lastAnalysisResults: AnalysisResult[] = []
let analysisStartTime = 0
let abortController: { aborted: boolean } = { aborted: false }

/** Register all IPC handlers for the SEO analysis workflow */
export function registerIpcHandlers(): void {
  /** Start website crawl to discover URLs */
  ipcMain.handle(
    'seo:start-crawl',
    async (event, rootUrl: string): Promise<{ seoUrls: string[]; allUrls: string[] }> => {
      abortController = { aborted: false }
      const result = await crawlUrls(rootUrl, (progress) => {
        event.sender.send('seo:progress', { type: 'crawl', ...progress })
      }, abortController)
      lastCrawlUrlStatus = result.urlStatusData
      lastCrawlSeoUrls = result.seoUrls
      lastCrawlAllUrls = result.allUrls
      return { seoUrls: result.seoUrls, allUrls: result.allUrls }
    }
  )

  /** Open file dialog and parse a .txt file containing URLs */
  ipcMain.handle('seo:parse-urls-file', async (): Promise<string[] | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select URL list file',
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const content = fs.readFileSync(result.filePaths[0], 'utf-8')
    const urls = content.split('\n').map((l) => l.trim()).filter((l) => l && l.startsWith('http'))
    return urls.length > 0 ? urls : null
  })

  /** Run Lighthouse analysis on a list of URLs */
  ipcMain.handle(
    'seo:start-analysis',
    async (event, urls: string[]): Promise<AnalysisResult[]> => {
      abortController = { aborted: false }
      analysisStartTime = Date.now()
      const results = await analyzeUrls(urls, (progress) => {
        event.sender.send('seo:progress', { type: 'analysis', ...progress })
      }, abortController)
      lastAnalysisResults = results
      return results
    }
  )

  /**  Generate Excel report and save to user-selected path  */
  ipcMain.handle(
    'seo:save-report',
    async (_event, locale: Locale): Promise<{ success: boolean; filePath?: string }> => {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false }
      const result = await dialog.showSaveDialog(win, {
        title: 'Save SEO Report',
        defaultPath: 'seo_lighthouse_report.xlsx',
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      })
      if (result.canceled || !result.filePath) return { success: false }
      try {
        const reportDate = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
        const buffer = await generateExcelReport(
          lastCrawlUrlStatus,
          lastAnalysisResults,
          locale,
          reportDate,
          analysisStartTime || Date.now()
        )
        fs.writeFileSync(result.filePath, buffer)
        return { success: true, filePath: result.filePath }
      } catch (err) {
        console.error('Report generation failed:', err)
        return { success: false }
      }
    }
  )

  /** Download crawled URLs as a .txt file */
  ipcMain.handle('seo:download-urls', async (_event, type: 'seo' | 'all'): Promise<boolean> => {
    const urls = type === 'seo' ? lastCrawlSeoUrls : lastCrawlAllUrls
    const win = BrowserWindow.getFocusedWindow()
    if (!win || urls.length === 0) return false
    const result = await dialog.showSaveDialog(win, {
      title: type === 'seo' ? 'Save SEO URLs' : 'Save All URLs',
      defaultPath: type === 'seo' ? 'seo_urls.txt' : 'all_urls.txt',
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return false
    fs.writeFileSync(result.filePath, urls.join('\n'), 'utf-8')
    return true
  })

  /** Abort current crawl or analysis operation */
  ipcMain.handle('seo:abort', async () => {
    abortController.aborted = true
    return true
  })
}
