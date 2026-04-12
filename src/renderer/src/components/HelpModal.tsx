import { t, type UILocale } from '../i18n'

/** Help modal dialog with usage instructions and .txt format guide */
export function HelpModal({ locale, onClose} : { locale: UILocale, onClose: () => void }): React.JSX.Element {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t(locale, 'helpTitle')}</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <section>
            <h3>{t(locale, 'helpOverview')}</h3>
            <p>{t(locale, 'helpOverviewText')}</p>
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
