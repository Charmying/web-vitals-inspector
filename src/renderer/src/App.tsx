import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from './hooks/useTheme'
import { ThemeToggle } from './components/ThemeToggle'
import { HelpModal } from './components/HelpModal'
import { t, type UILocale } from './i18n'

type Mode = 'crawl' | 'single' | 'upload'
type Step = 'input' | 'urls' | 'settings' | 'running' | 'done'
type ReportLocale = 'en' | 'zh'

interface ProgressData {
  type: 'crawl' | 'analysis'
  phase?: string
  current: number
  total: number
  message?: string
  currentUrl?: string
  perfScore?: string
  seoScore?: string
}

/** Main application component with i18n, theming, and step-based workflow */
function App(): React.JSX.Element {
  const { theme, toggle: toggleTheme } = useTheme()

  const [uiLocale, setUiLocale] = useState<UILocale>(() => {
    const stored = localStorage.getItem('wvi-locale') as UILocale | null
    return stored === 'en' || stored === 'zh' ? stored : 'zh'
  })

  const [step, setStep] = useState<Step>('input')
  const [mode, setMode] = useState<Mode>('crawl')
  const [url, setUrl] = useState('')
  const [reportLocale, setReportLocale] = useState<ReportLocale>('zh')
  const [urls, setUrls] = useState<string[]>([])
  const [allCrawledUrls, setAllCrawledUrls] = useState<string[]>([])
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isCrawling, setIsCrawling] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const analysisStartRef = useRef<number>(0)

  /** Persist UI locale preference to localStorage */
  useEffect(() => {
    localStorage.setItem('wvi-locale', uiLocale)
  }, [uiLocale])

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  /** Listen for progress events from main process */
  useEffect(() => {
    if (!window.api?.onProgress) return
    const cleanup = window.api.onProgress((data) => {
      const p = data as unknown as ProgressData
      setProgress(p)
      if (p.type === 'crawl' && p.message) {
        addLog(p.message)
      } else if (p.type === 'analysis' && p.currentUrl) {
        const extra = p.perfScore && p.seoScore ? ` → Perf: ${p.perfScore} | SEO: ${p.seoScore}` : ''
        addLog(`[${p.current}/${p.total}] ${p.currentUrl}${extra}`)
      }
    })
    return cleanup
  }, [addLog])

  /** Auto-scroll log area to bottom on new entries */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  /** Handle start button click based on current mode */
  const handleStart = async (): Promise<void> => {
    setError(null)
    setLogs([])
    setProgress(null)

    if (!window.api) {
      setError(uiLocale === 'zh' ? 'API 橋接器不可用，請重新啟動應用程式' : 'API bridge unavailable. Please restart the application.')
      return
    }

    if (mode === 'single') {
      if (!url.trim() || !url.startsWith('http')) {
        setError(t(uiLocale, 'errorInvalidUrl'))
        return
      }
      setUrls([url.trim()])
      setStep('settings')
      addLog(`${t(uiLocale, 'single')} ${url.trim()}`)
      return
    }

    if (mode === 'upload') {
      addLog(`${t(uiLocale, 'selectFile')}...`)
      const parsed = await window.api.parseUrlsFile()
      if (!parsed || parsed.length === 0) {
        setError(t(uiLocale, 'errorNoFile'))
        return
      }
      setUrls(parsed)
      setAllCrawledUrls(parsed)
      addLog(t(uiLocale, 'fileLoaded', { count: parsed.length }))
      setStep('urls')
      return
    }

    if (!url.trim() || !url.startsWith('http')) {
      setError(t(uiLocale, 'errorInvalidUrl'))
      return
    }

    setIsCrawling(true)
    setIsRunning(true)
    addLog(`${t(uiLocale, 'crawlStart')} ${url.trim()}`)

    try {
      const result = await window.api.startCrawl(url.trim())
      setUrls(result.seoUrls)
      setAllCrawledUrls(result.allUrls)
      setIsCrawling(false)
      setIsRunning(false)
      addLog(t(uiLocale, 'crawlComplete', { count: result.seoUrls.length }))
      setStep('urls')
    } catch (err) {
      setIsCrawling(false)
      setIsRunning(false)
      setError(`${t(uiLocale, 'crawlFailed')} ${(err as Error).message}`)
    }
  }

  /** Start Lighthouse analysis on selected URLs */
  const handleAnalysis = async (): Promise<void> => {
    if (!window.api) {
      setError(uiLocale === 'zh' ? 'API 橋接器不可用，請重新啟動應用程式' : 'API bridge unavailable. Please restart the application.')
      return
    }
    setError(null)
    setIsRunning(true)
    setStep('running')
    setAnalysisComplete(false)
    analysisStartRef.current = Date.now()
    addLog(t(uiLocale, 'analysisStart', { count: urls.length }))
    addLog(`${t(uiLocale, 'reportLangLog')} ${reportLocale === 'zh' ? '中文' : 'English'}`)

    try {
      await window.api.startAnalysis(urls)
      setIsRunning(false)
      setAnalysisComplete(true)
      setStep('done')
      addLog(t(uiLocale, 'analysisDone'))
    } catch (err) {
      setIsRunning(false)
      setError(`${t(uiLocale, 'analysisFailed')} ${(err as Error).message}`)
    }
  }

  /** Save analysis report as Excel file */
  const handleSaveReport = async (): Promise<void> => {
    if (!window.api) {
      setError(uiLocale === 'zh' ? 'API 橋接器不可用，請重新啟動應用程式' : 'API bridge unavailable. Please restart the application.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.saveReport(reportLocale)
      if (result.success) {
        addLog(`${t(uiLocale, 'saveSuccess')} ${result.filePath}`)
      } else {
        addLog(t(uiLocale, 'saveCancelled'))
      }
    } catch (err) {
      setError(`${t(uiLocale, 'saveFailed')} ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  /** Download URL list as .txt file via main process dialog */
  const handleDownloadUrls = async (type: 'seo' | 'all'): Promise<void> => {
    if (!window.api) return
    await window.api.downloadUrls(type)
  }

  /** Abort current crawl or analysis operation */
  const handleAbort = async (): Promise<void> => {
    if (!window.api) return
    await window.api.abort()
    setIsCrawling(false)
    setIsRunning(false)
    addLog(t(uiLocale, 'aborted'))
    setStep('input')
  }

  /** Reset all state to initial values */
  const handleReset = (): void => {
    setStep('input')
    setUrl('')
    setUrls([])
    setAllCrawledUrls([])
    setProgress(null)
    setLogs([])
    setError(null)
    setIsRunning(false)
    setIsCrawling(false)
    setAnalysisComplete(false)
  }

  /** Calculate estimated time remaining for analysis */
  const getEta = (): string | null => {
    if (!progress || progress.type !== 'analysis' || progress.current < 2) return null
    const elapsed = Date.now() - analysisStartRef.current
    const perUrl = elapsed / progress.current
    const remaining = perUrl * (progress.total - progress.current)
    const totalSec = Math.floor(remaining / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    if (min > 0) return `${t(uiLocale, 'etaPrefix')} ${t(uiLocale, 'etaMinutes', { min, sec })}`
    return `${t(uiLocale, 'etaPrefix')} ${t(uiLocale, 'etaSeconds', { sec })}`
  }

  const steps = [
    { key: 'input', label: t(uiLocale, 'stepInput') },
    { key: 'urls', label: t(uiLocale, 'stepUrls') },
    { key: 'settings', label: t(uiLocale, 'stepSettings') },
    { key: 'running', label: t(uiLocale, 'stepRunning') },
    { key: 'done', label: t(uiLocale, 'stepDone') }
  ]

  const stepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="app">
      {/* Header with glass effect */}
      <header className="app-header">
        <div className="header-top">
          <div className="header-left">
            <h1 className="app-logo">
              <span>Web Vitals</span> Inspector
            </h1>
          </div>
          <div className="header-controls">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button className="icon-btn lang-btn" onClick={() => setUiLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}> {uiLocale === 'zh' ? 'EN' : '中'}</button>
            <button className="icon-btn" onClick={() => setShowHelp(true)} aria-label="Help">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            {step !== 'input' && (<button className="icon-btn reset-btn" onClick={handleReset}>{t(uiLocale, 'resetBtn')}</button>)}
          </div>
        </div>

        {/* Step indicator */}
        <div className="stepper">
          {steps.map((s, i) => (
            <div key={s.key} className="stepper-item">
              <div className={`stepper-dot ${i < stepIndex ? 'completed' : i === stepIndex ? 'active' : 'pending'}`}>{i < stepIndex ? '✓' : i + 1}</div>
              <span className={`stepper-label ${i < stepIndex ? 'completed' : i === stepIndex ? 'active' : 'pending'}`}>{s.label}</span>
              {i < steps.length - 1 && (<div className={`stepper-line ${ i < stepIndex - 1 ? 'completed' : i === stepIndex - 1 ? 'active' : 'pending'}`} />)}
            </div>
          ))}
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        {/* Step 1: Input mode and URL */}
        {step === 'input' && !isCrawling && (
          <div className="animate-fadeInUp" style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>{t(uiLocale, 'selectMode')}</h2>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24}}>
              {(
                [
                  ['crawl', '🌐', t(uiLocale, 'modeCrawl'), t(uiLocale, 'modeCrawlDesc')],
                  ['single', '📄', t(uiLocale, 'modeSingle'), t(uiLocale, 'modeSingleDesc')],
                  ['upload', '📁', t(uiLocale, 'modeUpload'), t(uiLocale, 'modeUploadDesc')]
                ] as [Mode, string, string, string][]
              ).map(([m, icon, label, desc]) => (
                <button key={m} onClick={() => setMode(m)} className={`mode-card ${mode === m ? 'selected' : ''}`}>
                  <div className="mode-card-icon">{icon}</div>
                  <div className="mode-card-title">{label}</div>
                  <div className="mode-card-desc">{desc}</div>
                </button>
              ))}
            </div>

            {mode !== 'upload' && (
              <div style={{ marginBottom: 16 }}>
                <label className="label">{mode === 'crawl' ? t(uiLocale, 'rootUrl') : t(uiLocale, 'singleUrl')}</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t(uiLocale, 'urlPlaceholder')} className="input" onKeyDown={(e) => e.key === 'Enter' && handleStart()} />
              </div>
            )}

            {error && (
              <div className="error-alert" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <button onClick={handleStart} className="btn btn-primary btn-full" disabled={isRunning}>{mode === 'crawl' ? t(uiLocale, 'startCrawl') : mode === 'single' ? t(uiLocale, 'nextStep') : t(uiLocale, 'selectFile')}</button>
          </div>
        )}

        {/* Crawl in progress — shown within step 1 */}
        {step === 'input' && isCrawling && (
          <div className="animate-fadeInUp" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 className="section-title">{t(uiLocale, 'crawling')}</h2>
              <button onClick={handleAbort} className="btn btn-danger btn-sm">{t(uiLocale, 'abort')}</button>
            </div>

            {progress && progress.total > 0 && (
              <div className="progress-bar-container">
                <div className="progress-labels">
                  <span>{progress.current} / {progress.total}</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{width: `${Math.min((progress.current / progress.total) * 100, 100)}%`}} />
                </div>
                {progress.currentUrl && (
                  <div className="progress-url">{progress.currentUrl}</div>
                )}
              </div>
            )}

            <div className="log-area" style={{ marginTop: 16 }}>
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>

            {error && (
              <div className="error-alert" style={{ marginTop: 16 }}>{error}</div>
            )}
          </div>
        )}

        {/* Step 2: URL List with download options */}
        {step === 'urls' && (
          <div className="animate-fadeInUp" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div>
                <h2 className="section-title">{t(uiLocale, 'urlListTitle')}</h2>
                <span className="url-count">
                  {mode === 'crawl' && allCrawledUrls.length > urls.length ? t(uiLocale, 'urlCountSeo', { seo: urls.length, total: allCrawledUrls.length }) : t(uiLocale, 'urlCount', { count: urls.length })}
                </span>
              </div>
              <div className="download-btns">
                {mode === 'crawl' && allCrawledUrls.length > 0 && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadUrls('seo')}>⬇ {t(uiLocale, 'downloadSeoUrls')}</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadUrls('all')}>⬇ {t(uiLocale, 'downloadAllUrls')}</button>
                  </>
                )}
              </div>
            </div>

            <div className="url-table-container">
              <table className="url-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th>
                    <th>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {urls.map((u, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-tertiary)' }}>{i + 1}</td>
                      <td className="url-cell">{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {urls.length === 0 && (
              <div className="error-alert" style={{ marginBottom: 12 }}>{t(uiLocale, 'noSeoUrls')}</div>
            )}

            <button onClick={() => setStep('settings')} className="btn btn-primary btn-full" style={{ marginTop: urls.length > 0 ? 16 : 0 }} disabled={urls.length === 0}>{t(uiLocale, 'confirmUrls')}</button>
          </div>
        )}

        {/* Step 3: Analysis Settings */}
        {step === 'settings' && (
          <div className="animate-fadeInUp" style={{ maxWidth: 520, margin: '0 auto' }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>{t(uiLocale, 'settingsTitle')}</h2>

            <div style={{ marginBottom: 24 }}>
              <label className="label">{t(uiLocale, 'reportLanguage')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(
                  [
                    ['en', '🇺🇸 English'],
                    ['zh', '🇹🇼 中文']
                  ] as [ReportLocale, string][]
                ).map(([loc, label]) => (
                  <button key={loc} onClick={() => setReportLocale(loc)} className={`locale-card ${reportLocale === loc ? 'selected' : ''}`}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="summary-card" style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>{t(uiLocale, 'analysisSummary')}</h3>
              <div className="summary-row">
                <span className="summary-label">{t(uiLocale, 'pagesCount')}</span>
                <span className="summary-value">{urls.length}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">{t(uiLocale, 'reportLang')}</span>
                <span className="summary-value">{reportLocale === 'zh' ? '中文' : 'English'}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">{t(uiLocale, 'outputFormat')}</span>
                <span className="summary-value">{t(uiLocale, 'outputDesc')}</span>
              </div>
            </div>

            {error && (
              <div className="error-alert" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <button onClick={handleAnalysis} className="btn btn-success btn-full">🚀 {t(uiLocale, 'startAnalysis')}</button>
          </div>
        )}

        {/* Step 4: Running with progress and ETA */}
        {step === 'running' && (
          <div className="animate-fadeInUp" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 className="section-title">{progress?.type === 'crawl' ? t(uiLocale, 'crawling') : t(uiLocale, 'analyzing')}</h2>
              {isRunning && (
                <button onClick={handleAbort} className="btn btn-danger btn-sm">{t(uiLocale, 'abort')}</button>
              )}
            </div>

            {progress && progress.total > 0 && (
              <div className="progress-bar-container">
                <div className="progress-labels">
                  <span>{progress.current} / {progress.total}</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min((progress.current / progress.total) * 100, 100)}%` }} />
                </div>
                {progress.currentUrl && (
                  <div className="progress-url">{progress.currentUrl}</div>
                )}
                {getEta() && <div className="eta-display">{getEta()}</div>}
              </div>
            )}

            <div className="log-area" style={{ marginTop: 16 }}>
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>

            {error && (
              <div className="error-alert" style={{ marginTop: 16 }}>{error}</div>
            )}
          </div>
        )}

        {/* Step 5: Done — save report | 步驟 5: 完成 — 儲存報告 */}
        {step === 'done' && analysisComplete && (
          <div className="animate-fadeInUp" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="success-card" style={{ marginBottom: 24 }}>
              <div className="success-icon">🎉</div>
              <h2 className="success-title">{t(uiLocale, 'analysisComplete')}</h2>
              <p className="success-desc">{t(uiLocale, 'pagesAnalyzed', { count: urls.length })}</p>
            </div>

            <div className="card card-padded" style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>{t(uiLocale, 'reportContents')}</h3>
              <div className="sheet-grid">
                {[
                  [
                    '📊',
                    t(uiLocale, 'sheetUrlStatus'),
                    t(uiLocale, 'sheetUrlStatusDesc')
                  ],
                  [
                    '📋',
                    t(uiLocale, 'sheetExecSummary'),
                    t(uiLocale, 'sheetExecSummaryDesc')
                  ],
                  [
                    '📌',
                    t(uiLocale, 'sheetTopIssues'),
                    t(uiLocale, 'sheetTopIssuesDesc')
                  ],
                  [
                    '🔍',
                    t(uiLocale, 'sheetIssueDetails'),
                    t(uiLocale, 'sheetIssueDetailsDesc')
                  ],
                  [
                    '📄',
                    t(uiLocale, 'sheetPageData'),
                    t(uiLocale, 'sheetPageDataDesc')
                  ],
                  [
                    '📖',
                    t(uiLocale, 'sheetGlossary'),
                    t(uiLocale, 'sheetGlossaryDesc')
                  ]
                ].map(([icon, name, desc]) => (
                  <div key={name} className="sheet-item">
                    <span className="sheet-icon">{icon}</span>
                    <div>
                      <div className="sheet-name">{name}</div>
                      <div className="sheet-desc">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSaveReport} disabled={saving} className="btn btn-primary btn-full" style={{ marginBottom: 16 }}>{saving ? t(uiLocale, 'saving') : `💾 ${t(uiLocale, 'saveReport')}`}</button>

            {error && (
              <div className="error-alert" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <details>
              <summary>{t(uiLocale, 'viewLog')}</summary>
              <div className="log-area" style={{ height: 240, borderRadius: 0, border: 'none' }}>
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </details>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">Web Vitals Inspector — SEO Audit Tool powered by Lighthouse</footer>

      {/* Help modal */}
      {showHelp && <HelpModal locale={uiLocale} onClose={() => setShowHelp(false)} />}
    </div>
  )
}

export default App
