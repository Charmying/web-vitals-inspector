export type ParseUrlsFileErrorReason =
  | 'too-large'
  | 'binary'
  | 'no-valid-urls'
  | 'read-failed'
  | 'no-window'

export type ParseUrlsFileResult =
  | { status: 'loaded'; urls: string[] }
  | { status: 'cancelled' }
  | { status: 'error'; reason: ParseUrlsFileErrorReason; message?: string }

export type SaveReportResult =
  | { status: 'saved'; filePath: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export type DownloadUrlsResult =
  | { status: 'saved'; filePath: string; count: number }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
