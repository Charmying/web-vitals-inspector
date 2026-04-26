import { useEffect, useRef } from 'react'
import { t, type UILocale } from '../i18n'

const FOCUSABLE_SELECTOR =  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Help modal dialog with usage instructions and .txt format guide */
export function HelpModal({
  locale,
  onClose,
  returnFocusRef
}: {
  locale: UILocale
  onClose: () => void
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>
}): React.JSX.Element {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const triggerEl = returnFocusRef?.current
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    closeBtnRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      triggerEl?.focus()
    }
  }, [onClose, returnFocusRef])

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        aria-describedby="help-overview"
      >
        <div className="modal-header">
          <h2 id="help-title">{t(locale, 'helpTitle')}</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="modal-close"
            aria-label={t(locale, 'helpClose')}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <section>
            <h3>{t(locale, 'helpOverview')}</h3>
            <p id="help-overview">{t(locale, 'helpOverviewText')}</p>
          </section>
          <section>
            <h3>{t(locale, 'helpModes')}</h3>
            <ul>
              <li>
                <strong>🌐 {t(locale, 'helpCrawlLabel')}</strong> —{' '}
                {t(locale, 'helpCrawlText')}
              </li>
              <li>
                <strong>📄 {t(locale, 'helpSingleLabel')}</strong> —{' '}
                {t(locale, 'helpSingleText')}
              </li>
              <li>
                <strong>📁 {t(locale, 'helpUploadLabel')}</strong> —{' '}
                {t(locale, 'helpUploadText')}
              </li>
            </ul>
          </section>
          <section>
            <h3>{t(locale, 'helpTxtFormat')}</h3>
            <p>{t(locale, 'helpTxtFormatText')}</p>
            <div className="code-block">
              <div className="code-label">{t(locale, 'helpTxtExample')}</div>
              <pre>
{`https://example.com/
https://example.com/about
https://example.com/products/item-1
https://example.com/blog/post-title
`}
              </pre>
            </div>
          </section>
          <section>
            <h3>{t(locale, 'helpTips')}</h3>
            <ul>
              <li>{t(locale, 'helpTip1')}</li>
              <li>{t(locale, 'helpTip2')}</li>
              <li>{t(locale, 'helpTip3')}</li>
              <li>{t(locale, 'helpTip4')}</li>
              <li>{t(locale, 'helpTip5')}</li>
              <li>{t(locale, 'helpTip6')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
