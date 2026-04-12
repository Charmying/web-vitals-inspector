import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/** API bridge between main process and renderer */
const api = {
  startCrawl: (rootUrl: string) => ipcRenderer.invoke('seo:start-crawl', rootUrl),
  parseUrlsFile: () => ipcRenderer.invoke('seo:parse-urls-file'),
  startAnalysis: (urls: string[]) => ipcRenderer.invoke('seo:start-analysis', urls),
  saveReport: (locale: string) => ipcRenderer.invoke('seo:save-report', locale),
  downloadUrls: (type: 'seo' | 'all') => ipcRenderer.invoke('seo:download-urls', type),
  abort: () => ipcRenderer.invoke('seo:abort'),
  onProgress: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on('seo:progress', handler)
    return () => ipcRenderer.removeListener('seo:progress', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
