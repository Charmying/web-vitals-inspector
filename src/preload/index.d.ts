import { ElectronAPI } from '@electron-toolkit/preload'
import type { DownloadUrlsResult, ParseUrlsFileResult, SaveReportResult } from '../shared/ipc'

/** SEO analysis API exposed to the renderer process */
interface SeoAPI {
  startCrawl: (rootUrl: string, locale?: 'en' | 'zh') => Promise<{ seoUrls: string[]; allUrls: string[] }>
  parseUrlsFile: () => Promise<ParseUrlsFileResult>
  startAnalysis: (urls: string[]) => Promise<unknown[]>
  saveReport: (locale: 'en' | 'zh') => Promise<SaveReportResult>
  downloadUrls: (type: 'seo' | 'all') => Promise<DownloadUrlsResult>
  abort: () => Promise<boolean>
  onProgress: (callback: (data: Record<string, unknown>) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SeoAPI
  }
}
