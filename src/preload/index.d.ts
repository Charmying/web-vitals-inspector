import { ElectronAPI } from '@electron-toolkit/preload'

/** SEO analysis API exposed to the renderer process */
interface SeoAPI {
  startCrawl: (rootUrl: string) => Promise<{ seoUrls: string[]; allUrls: string[] }>
  parseUrlsFile: () => Promise<string[] | null>
  startAnalysis: (urls: string[]) => Promise<unknown[]>
  saveReport: (locale: string) => Promise<{ success: boolean; filePath?: string }>
  downloadUrls: (type: 'seo' | 'all') => Promise<boolean>
  abort: () => Promise<boolean>
  onProgress: (callback: (data: Record<string, unknown>) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SeoAPI
  }
}
