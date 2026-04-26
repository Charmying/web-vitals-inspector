import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme } from './hooks/useTheme'
import { ThemeToggle } from './components/ThemeToggle'
import { HelpModal } from './components/HelpModal'
import { t, type UILocale } from './i18n'
import { isHttpUrl } from '../../shared/ipc'

type Mode = 'crawl' | 'single' | 'upload'
type Step = 'input' | 'urls' | 'settings' | 'running' | 'done'
type ReportLocale = 'en' | 'zh'

/** Cap the in-UI log buffer so a 10k-page crawl never balloons renderer memory */
const MAX_LOG_LINES = 500

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

/** Main application component with i18n, theming, and a step-based workflow */
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
  const [crawledSeoUrls, setCrawledSeoUrls] = useState<string[]>([])
  const [urlFilter, setUrlFilter] = useState<'seo' | 'all'>('seo')
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isCrawling, setIsCrawling] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const [analysisWasPartial, setAnalysisWasPartial] = useState(false)
  const [completedAnalysisCount, setCompletedAnalysisCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const analysisStartRef = useRef<number>(0)
  const completedAnalysisCountRef = useRef(0)
  const helpBtnRef = useRef<HTMLButtonElement>(null)
  // Tracks intentional user aborts so catch blocks don't surface a confusing error.
  const isAbortingRef = useRef(false)
  // Tracks full resets triggered while an async operation is in flight so async
  // completions do not navigate away from the input screen after reset.
  const isResettingRef = useRef(false)
  // Monotonic token that invalidates stale async completions after reset/restart.
  const workflowTokenRef = useRef(0)
  useEffect(() => {
    localStorage.setItem('wvi-locale', uiLocale)
    document.documentElement.setAttribute('lang', uiLocale === 'zh' ? 'zh-Hant' : 'en')
  }, [uiLocale])

  // Reflect the app title in the OS window title (and keep it in sync with locale).
  useEffect(() => {
    document.title = t(uiLocale, 'appTitle')
  }, [uiLocale])

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => {
      const entry = `[${new Date().toLocaleTimeString()}] ${msg}`
      const next = prev.length >= MAX_LOG_LINES ? prev.slice(-MAX_LOG_LINES + 1) : prev
      return [...next, entry]
    })
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
        if (p.perfScore !== undefined || p.seoScore !== undefined) {
          setCompletedAnalysisCount((prev) => {
            const next = Math.max(prev, p.current)
            completedAnalysisCountRef.current = next
            return next
          })
        }
        const extra =
          p.perfScore && p.seoScore ? ` → Perf: ${p.perfScore} | SEO: ${p.seoScore}` : ''
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
    setNotice(null)
    setLogs([])
    setProgress(null)
    setAnalysisWasPartial(false)
    setCompletedAnalysisCount(0)
    completedAnalysisCountRef.current = 0

    if (!window.api) {
      setError(t(uiLocale, 'errorApiBridge'))
      return
    }

    if (mode === 'single') {
      const normalized = url.trim()
      if (!normalized || !isHttpUrl(normalized)) {
        setError(t(uiLocale, 'errorInvalidUrl'))
        return
      }
      setUrls([normalized])
      setAllCrawledUrls([normalized])
      setCrawledSeoUrls([])
      setStep('settings')
      addLog(`${t(uiLocale, 'single')} ${normalized}`)
      return
    }

    if (mode === 'upload') {
      addLog(`${t(uiLocale, 'selectFile')}...`)
      try {
        const parsed = await window.api.parseUrlsFile()
        if (parsed.status === 'cancelled') {
          return
        }
        if (parsed.status === 'error') {
          switch (parsed.reason) {
            case 'too-large':
              setError(t(uiLocale, 'errorFileTooLarge'))
              break
            case 'binary':
              setError(t(uiLocale, 'errorFileBinary'))
              break
            case 'no-valid-urls':
              setError(t(uiLocale, 'errorNoValidUrls'))
              break
            case 'read-failed':
              setError(
                parsed.message
                  ? `${t(uiLocale, 'errorFileRead')} ${parsed.message}`
                  : t(uiLocale, 'errorFileRead')
              )
              break
            case 'no-window':
              setError(t(uiLocale, 'errorWindowUnavailable'))
              break
          }
          return
        }
        setUrls(parsed.urls)
        setAllCrawledUrls(parsed.urls)
        setCrawledSeoUrls([])
        addLog(t(uiLocale, 'fileLoaded', { count: parsed.urls.length }))
        setStep('urls')
      } catch (err) {
        setError(`${t(uiLocale, 'errorFileRead')} ${(err as Error).message}`)
      }
      return
    }

    const normalized = url.trim()
    if (!normalized || !isHttpUrl(normalized)) {
      setError(t(uiLocale, 'errorInvalidUrl'))
      return
    }

    setIsCrawling(true)
    setIsRunning(true)
    isAbortingRef.current = false
    isResettingRef.current = false
    const workflowToken = ++workflowTokenRef.current
    addLog(`${t(uiLocale, 'crawlStart')} ${normalized}`)

    try {
      const result = await window.api.startCrawl(normalized, uiLocale)
      if (workflowToken !== workflowTokenRef.current) return
      setCrawledSeoUrls(result.seoUrls)
      setAllCrawledUrls(result.allUrls)
      setUrls(result.seoUrls)
      setUrlFilter('seo')
      setIsCrawling(false)
      setIsRunning(false)
      if (!isResettingRef.current) {
        addLog(t(uiLocale, 'crawlComplete', { count: result.seoUrls.length }))
        setStep('urls')
      }
      isResettingRef.current = false
    } catch (err) {
      if (workflowToken !== workflowTokenRef.current) return
      setIsCrawling(false)
      setIsRunning(false)
      if (!isAbortingRef.current) {
        setError(`${t(uiLocale, 'crawlFailed')} ${(err as Error).message}`)
      }
      isAbortingRef.current = false
      isResettingRef.current = false
    }
  }

  /** Start Lighthouse analysis on the selected URLs */
  const handleAnalysis = async (): Promise<void> => {
    if (!window.api) {
      setError(t(uiLocale, 'errorApiBridge'))
      return
    }
    setError(null)
    setNotice(null)
    setIsRunning(true)
    setStep('running')
    setAnalysisComplete(false)
    setAnalysisWasPartial(false)
    setCompletedAnalysisCount(0)
    completedAnalysisCountRef.current = 0
    isAbortingRef.current = false
    isResettingRef.current = false
    const workflowToken = ++workflowTokenRef.current
    // Reset stale crawl progress so the heading never shows "Crawling..." during analysis
    setProgress(null)
    analysisStartRef.current = Date.now()
    addLog(t(uiLocale, 'analysisStart', { count: urls.length }))
    addLog(`${t(uiLocale, 'reportLangLog')} ${reportLocale === 'zh' ? '中文' : 'English'}`)

    try {
      await window.api.startAnalysis(urls)
      if (workflowToken !== workflowTokenRef.current) return
      setIsRunning(false)
      setAnalysisWasPartial(false)
      setCompletedAnalysisCount(urls.length)
      completedAnalysisCountRef.current = urls.length
      if (!isResettingRef.current) {
        setAnalysisComplete(true)
        setStep('done')
        addLog(t(uiLocale, 'analysisDone'))
      }
      isResettingRef.current = false
    } catch (err) {
      if (workflowToken !== workflowTokenRef.current) return
      // Keep user on `done` step so any partial results collected by the main
      // process can still be saved as a report — a far better UX than losing
      // the entire run on a timeout or user-initiated abort. Skip the navigation
      // if the user explicitly reset — handleReset already switched to 'input'.
      setIsRunning(false)
      if (isAbortingRef.current && !isResettingRef.current) {
        addLog(t(uiLocale, 'aborted'))
      }
      if (!isResettingRef.current) {
        const doneCount = completedAnalysisCountRef.current
        setAnalysisWasPartial(true)
        if (doneCount > 0) {
          addLog(t(uiLocale, 'analysisPartialLog', { done: doneCount, total: urls.length }))
        }
        setAnalysisComplete(true)
        setStep('done')
      }
      if (!isAbortingRef.current) {
        setError(`${t(uiLocale, 'analysisFailed')} ${(err as Error).message}`)
      }
      isAbortingRef.current = false
      isResettingRef.current = false
    }
  }

  /** Save analysis report as Excel file */
  const handleSaveReport = async (): Promise<void> => {
    if (!window.api) {
      setError(t(uiLocale, 'errorApiBridge'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.saveReport(reportLocale)
      if (result.status === 'saved') {
        addLog(`${t(uiLocale, 'saveSuccess')} ${result.filePath}`)
      } else if (result.status === 'cancelled') {
        addLog(t(uiLocale, 'saveCancelled'))
      } else {
        setError(`${t(uiLocale, 'saveFailed')} ${result.message}`)
      }
    } catch (err) {
      setError(`${t(uiLocale, 'saveFailed')} ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  /** Stable close handler for HelpModal — must not be recreated on every render
   * to avoid triggering the modal's focus-management effect during rapid progress updates */
  const handleCloseHelp = useCallback(() => setShowHelp(false), [])

  /** Switch between SEO-only and all-URLs views */
  const handleUrlFilterChange = (filter: 'seo' | 'all'): void => {
    setUrlFilter(filter)
    setUrls(filter === 'seo' ? crawledSeoUrls : allCrawledUrls)
  }

  /** Download URL list as .txt file via main process dialog */
  const handleDownloadUrls = async (type: 'seo' | 'all'): Promise<void> => {
    if (!window.api) return
    setError(null)
    setNotice(null)
    const result = await window.api.downloadUrls(type)
    if (result.status === 'saved') {
      setNotice(t(uiLocale, 'downloadSaved', { filePath: result.filePath }))
      addLog(t(uiLocale, 'downloadSaved', { filePath: result.filePath }))
      return
    }
    if (result.status === 'cancelled') {
      setNotice(t(uiLocale, 'downloadCancelled'))
      return
    }
    setError(`${t(uiLocale, 'downloadFailed')} ${result.message}`)
  }

  /** Abort current crawl or analysis operation */
  const handleAbort = async (): Promise<void> => {
    if (!window.api) return
    isAbortingRef.current = true
    await window.api.abort()
    setIsCrawling(false)
    // When aborting a crawl, go back to input; when aborting an analysis, stay
    // on the running screen until the main process flushes partial results.
    if (step === 'running') {
      setIsRunning(false)
      addLog(t(uiLocale, 'aborting'))
    } else {
      setIsRunning(false)
      addLog(t(uiLocale, 'aborted'))
      setStep('input')
    }
  }

  /** Reset all state to initial values — also aborts any in-flight operation */
  const handleReset = (): void => {
    if (isRunning) {
      workflowTokenRef.current += 1
      isAbortingRef.current = true
      isResettingRef.current = true
      window.api?.abort()
    }
    setStep('input')
    setMode('crawl')
    setUrl('')
    setUrls([])
    setAllCrawledUrls([])
    setCrawledSeoUrls([])
    setUrlFilter('seo')
    setReportLocale('zh')
    setProgress(null)
    setLogs([])
    setError(null)
    setNotice(null)
    setIsRunning(false)
    setIsCrawling(false)
    setAnalysisComplete(false)
    setAnalysisWasPartial(false)
    setCompletedAnalysisCount(0)
    completedAnalysisCountRef.current = 0
    setSaving(false)
    setShowHelp(false)
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

  const steps = useMemo(
    () => [
      { key: 'input', label: t(uiLocale, 'stepInput') },
      { key: 'urls', label: t(uiLocale, 'stepUrls') },
      { key: 'settings', label: t(uiLocale, 'stepSettings') },
      { key: 'running', label: t(uiLocale, 'stepRunning') },
      { key: 'done', label: t(uiLocale, 'stepDone') }
    ],
    [uiLocale]
  )

  const stepIndex = steps.findIndex((s) => s.key === step)
  const progressPct =
    progress && progress.total > 0
      ? Math.min(Math.round((progress.current / progress.total) * 100), 100)
      : 0

  const inputGuideText =
    mode === 'crawl'
      ? t(uiLocale, 'inputGuideCrawl')
      : mode === 'single'
        ? t(uiLocale, 'inputGuideSingle')
        : t(uiLocale, 'inputGuideUpload')

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
            <ThemeToggle theme={theme} onToggle={toggleTheme} label={t(uiLocale, 'themeToggleLabel')} />
            <button
              className="icon-btn lang-btn"
              onClick={() => setUiLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}
              aria-label={uiLocale === 'zh' ? t(uiLocale, 'switchToEn') : t(uiLocale, 'switchToZh')}
            >
              {uiLocale === 'zh' ? 'EN' : '中'}
            </button>
            <button
              ref={helpBtnRef}
              className="icon-btn"
              onClick={() => setShowHelp(true)}
              aria-label={t(uiLocale, 'helpBtn')}
              title={t(uiLocale, 'helpBtn')}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            {step !== 'input' && (
              <button
                className="icon-btn reset-btn"
                onClick={handleReset}
                aria-label={t(uiLocale, 'resetBtn')}
              >
                {t(uiLocale, 'resetBtn')}
              </button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="stepper" role="navigation" aria-label={t(uiLocale, 'stepperAriaLabel')}>
          {steps.map((s, i) => {
            const state = i < stepIndex ? 'completed' : i === stepIndex ? 'active' : 'pending'
            const lineState =
              i < stepIndex - 1 ? 'completed' : i === stepIndex - 1 ? 'active' : 'pending'
            return (
              <div key={s.key} className="stepper-item">
                <div
                  className={`stepper-dot ${state}`}
                  aria-current={state === 'active' ? 'step' : undefined}
                >
                  {state === 'completed' ? '✓' : i + 1}
                </div>
                <span className={`stepper-label ${state}`}>{s.label}</span>
                {i < steps.length - 1 && <div className={`stepper-line ${lineState}`} />}
              </div>
            )
          })}
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        {/* Step 1: Input mode and URL */}
        {step === 'input' && !isCrawling && (
          <div className="animate-fadeInUp" style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>
              {t(uiLocale, 'selectMode')}
            </h2>
            <p className="section-guide" style={{ marginBottom: 18 }}>
              {inputGuideText}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginBottom: 24
              }}
            >
              {(
                [
                  ['crawl', '🌐', t(uiLocale, 'modeCrawl'), t(uiLocale, 'modeCrawlDesc')],
                  ['single', '📄', t(uiLocale, 'modeSingle'), t(uiLocale, 'modeSingleDesc')],
                  ['upload', '📁', t(uiLocale, 'modeUpload'), t(uiLocale, 'modeUploadDesc')]
                ] as [Mode, string, string, string][]
              ).map(([m, icon, label, desc]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`mode-card ${mode === m ? 'selected' : ''}`}
                  aria-pressed={mode === m}
                >
                  <div className="mode-card-icon">{icon}</div>
                  <div className="mode-card-title">{label}</div>
                  <div className="mode-card-desc">{desc}</div>
                </button>
              ))}
            </div>

            {mode !== 'upload' && (
              <div style={{ marginBottom: 16 }}>
                <label className="label" htmlFor="wvi-root-url">
                  {mode === 'crawl' ? t(uiLocale, 'rootUrl') : t(uiLocale, 'singleUrl')}
                </label>
                <input
                  id="wvi-root-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t(uiLocale, 'urlPlaceholder')}
                  className="input"
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleStart()
                    }
                  }}
                />
              </div>
            )}

            {error && (
              <div className="error-alert" role="alert" style={{ marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button onClick={handleStart} className="btn btn-primary btn-full" disabled={isRunning}>
              {mode === 'crawl'
                ? t(uiLocale, 'startCrawl')
                : mode === 'single'
                  ? t(uiLocale, 'nextStep')
                  : t(uiLocale, 'selectFile')}
            </button>
          </div>
        )}

        {/* Crawl in progress — shown within step 1 */}
        {step === 'input' && isCrawling && (
          <div className="animate-fadeInUp" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 className="section-title">{t(uiLocale, 'crawling')}</h2>
              <button onClick={handleAbort} className="btn btn-danger btn-sm">
                {t(uiLocale, 'abort')}
              </button>
            </div>
            <p className="section-guide" style={{ marginBottom: 12 }}>
              {t(uiLocale, 'runningGuide')}
            </p>

            {progress && progress.total > 0 && (
              <div className="progress-bar-container">
                <div className="progress-labels">
                  <span>
                    {progress.current} / {progress.total}
                  </span>
                  <span>{progressPct}%</span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={t(uiLocale, 'crawling')}
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                {progress.currentUrl && <div className="progress-url">{progress.currentUrl}</div>}
              </div>
            )}

            <div className="log-area" role="log" aria-label={t(uiLocale, 'logAreaLabel')} style={{ marginTop: 16 }}>
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>

            {error && (
              <div className="error-alert" role="alert" style={{ marginTop: 16 }}>
                {error}
              </div>
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
                  {mode === 'crawl' && allCrawledUrls.length > 0
                    ? t(uiLocale, 'urlCountSeo', { seo: crawledSeoUrls.length, total: allCrawledUrls.length })
                    : t(uiLocale, 'urlCount', { count: urls.length })}
                </span>
              </div>
              <div className="download-btns">
                {mode === 'crawl' && allCrawledUrls.length > 0 && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDownloadUrls('seo')}
                    >
                      ⬇ {t(uiLocale, 'downloadSeoUrls')}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDownloadUrls('all')}
                    >
                      ⬇ {t(uiLocale, 'downloadAllUrls')}
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="section-guide" style={{ marginBottom: 12 }}>
              {t(uiLocale, 'urlListGuide')}
            </p>

            {notice && (
              <div className="notice-alert" role="status" style={{ marginBottom: 12 }}>
                {notice}
              </div>
            )}

            {error && (
              <div className="error-alert" role="alert" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}

            {mode === 'crawl' && crawledSeoUrls.length < allCrawledUrls.length && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  className={`btn btn-sm ${urlFilter === 'seo' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleUrlFilterChange('seo')}
                  aria-pressed={urlFilter === 'seo'}
                >
                  {t(uiLocale, 'filterSeo', { count: crawledSeoUrls.length })}
                </button>
                <button
                  className={`btn btn-sm ${urlFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleUrlFilterChange('all')}
                  aria-pressed={urlFilter === 'all'}
                >
                  {t(uiLocale, 'filterAll', { count: allCrawledUrls.length })}
                </button>
              </div>
            )}

            <div className="url-table-container">
              <table className="url-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }} scope="col">#</th>
                    <th scope="col">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {urls.map((u, i) => (
                    <tr key={u}>
                      <td style={{ color: 'var(--text-tertiary)' }}>{i + 1}</td>
                      <td className="url-cell">{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {urls.length === 0 && (
              <div className="error-alert" role="alert" style={{ marginBottom: 12 }}>
                {t(uiLocale, 'noSeoUrls')}
              </div>
            )}

            <button
              onClick={() => setStep('settings')}
              className="btn btn-primary btn-full"
              style={{ marginTop: urls.length > 0 ? 16 : 0 }}
              disabled={urls.length === 0}
            >
              {t(uiLocale, 'confirmUrls')}
            </button>
          </div>
        )}

        {/* Step 3: Analysis Settings */}
        {step === 'settings' && (
          <div className="animate-fadeInUp" style={{ maxWidth: 520, margin: '0 auto' }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>
              {t(uiLocale, 'settingsTitle')}
            </h2>
            <p className="section-guide" style={{ marginBottom: 18 }}>
              {t(uiLocale, 'settingsGuide')}
            </p>

            <div style={{ marginBottom: 24 }}>
              <label className="label">{t(uiLocale, 'reportLanguage')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(
                  [
                    ['en', '🇺🇸 English'],
                    ['zh', '🇹🇼 中文']
                  ] as [ReportLocale, string][]
                ).map(([loc, label]) => (
                  <button
                    key={loc}
                    onClick={() => setReportLocale(loc)}
                    className={`locale-card ${reportLocale === loc ? 'selected' : ''}`}
                    aria-pressed={reportLocale === loc}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="summary-card" style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 12,
                  color: 'var(--text-primary)'
                }}
              >
                {t(uiLocale, 'analysisSummary')}
              </h3>
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
              <div className="error-alert" role="alert" style={{ marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button onClick={handleAnalysis} className="btn btn-success btn-full">
              🚀 {t(uiLocale, 'startAnalysis')}
            </button>
          </div>
        )}

        {/* Step 4: Running with progress and ETA */}
        {step === 'running' && (
          <div className="animate-fadeInUp" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 className="section-title">
                {progress?.type === 'crawl' ? t(uiLocale, 'crawling') : t(uiLocale, 'analyzing')}
              </h2>
              {isRunning && (
                <button onClick={handleAbort} className="btn btn-danger btn-sm">
                  {t(uiLocale, 'abort')}
                </button>
              )}
            </div>
            <p className="section-guide" style={{ marginBottom: 12 }}>
              {t(uiLocale, 'runningGuide')}
            </p>

            {progress && progress.total > 0 && (
              <div className="progress-bar-container">
                <div className="progress-labels">
                  <span>
                    {progress.current} / {progress.total}
                  </span>
                  <span>{progressPct}%</span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={progress?.type === 'crawl' ? t(uiLocale, 'crawling') : t(uiLocale, 'analyzing')}
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                {progress.currentUrl && <div className="progress-url">{progress.currentUrl}</div>}
                {(() => { const eta = getEta(); return eta ? <div className="eta-display">{eta}</div> : null })()}
              </div>
            )}

            <div className="log-area" role="log" aria-label={t(uiLocale, 'logAreaLabel')} style={{ marginTop: 16 }}>
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>

            {error && (
              <div className="error-alert" role="alert" style={{ marginTop: 16 }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Done — save report */}
        {step === 'done' && analysisComplete && (
          <div className="animate-fadeInUp" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="success-card" style={{ marginBottom: 24 }}>
              <div className="success-icon" aria-hidden="true">✓</div>
              <h2 className="success-title">
                {analysisWasPartial ? t(uiLocale, 'analysisPartial') : t(uiLocale, 'analysisComplete')}
              </h2>
              <p className="success-desc">
                {analysisWasPartial
                  ? t(uiLocale, 'pagesAnalyzedPartial', {
                      done: completedAnalysisCount,
                      total: urls.length
                    })
                  : t(uiLocale, 'pagesAnalyzed', { count: completedAnalysisCount || urls.length })}
              </p>
              <p className="success-desc" style={{ marginTop: 6 }}>
                {analysisWasPartial ? t(uiLocale, 'doneGuidePartial') : t(uiLocale, 'doneGuide')}
              </p>
            </div>

            <div className="card card-padded" style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 14,
                  color: 'var(--text-primary)'
                }}
              >
                {t(uiLocale, 'reportContents')}
              </h3>
              <div className="sheet-grid">
                {[
                  ['📊', t(uiLocale, 'sheetUrlStatus'), t(uiLocale, 'sheetUrlStatusDesc')],
                  ['📋', t(uiLocale, 'sheetExecSummary'), t(uiLocale, 'sheetExecSummaryDesc')],
                  ['📌', t(uiLocale, 'sheetTopIssues'), t(uiLocale, 'sheetTopIssuesDesc')],
                  ['🔍', t(uiLocale, 'sheetIssueDetails'), t(uiLocale, 'sheetIssueDetailsDesc')],
                  ['📄', t(uiLocale, 'sheetPageData'), t(uiLocale, 'sheetPageDataDesc')],
                  ['📖', t(uiLocale, 'sheetGlossary'), t(uiLocale, 'sheetGlossaryDesc')]
                ].map(([icon, name, desc]) => (
                  <div key={icon} className="sheet-item">
                    <span className="sheet-icon">{icon}</span>
                    <div>
                      <div className="sheet-name">{name}</div>
                      <div className="sheet-desc">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveReport}
              disabled={saving}
              className="btn btn-primary btn-full"
              style={{ marginBottom: 16 }}
            >
              {saving ? t(uiLocale, 'saving') : `💾 ${t(uiLocale, 'saveReport')}`}
            </button>
            <p className="section-guide" style={{ marginTop: -6, marginBottom: 16 }}>
              {t(uiLocale, 'saveHint')}
            </p>

            {error && (
              <div className="error-alert" role="alert" style={{ marginBottom: 16 }}>
                {error}
              </div>
            )}

            <details>
              <summary>{t(uiLocale, 'viewLog')}</summary>
              <div className="log-area" role="log" aria-label={t(uiLocale, 'logAreaLabel')} style={{ height: 240, borderRadius: 0, border: 'none' }}>
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </details>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        {t(uiLocale, 'footerLine')}
      </footer>

      {/* Help modal */}
      {showHelp && <HelpModal locale={uiLocale} onClose={handleCloseHelp} returnFocusRef={helpBtnRef} />}
    </div>
  )
}

export default App
