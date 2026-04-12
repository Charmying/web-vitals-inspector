/** Report internationalization module — provides translations for Excel report content */
import type { Locale } from './types'

type SheetNames = {
  urlStatus: string
  executiveSummary: string
  topIssues: string
  issues: string
  pageData: string
  glossary: string
}

type Labels = {
  noData: string
  none: string
  lhFailed: string
  lhFailedDesc: string
  failed: string
  warning: string
  missing: string
  issue: string
  suggest: string
  lighthouse: string
  customRule: string
  p0Indexing: string
  p1Tech: string
  p2Onpage: string
  p3Advanced: string
  catPerf: string
  catA11y: string
  catBP: string
  catSEO: string
  convP0: string
  convP1: string
  convP2: string
  convP3: string
  statusOk: string
  statusRedirect: string
  status4xx: string
  status5xx: string
  statusErr: string
}

type ExecLabels = {
  basic: string
  reportDate: string
  totalPages: string
  elapsed: string
  p0Section: string
  p0Total: string
  p0Highest: string
  noHttps: string
  googleDemote: string
  noCanon: string
  dupRisk: string
  noindex: string
  intentional: string
  noTitle: string
  rankImpact: string
  p1Section: string
  perfAvg: string
  cwv: string
  seoAvg: string
  lhSeo: string
  perfRed: string
  needOpt: string
  noRobots: string
  noSitemap: string
  top5: string
  fullSiteIssues: string
  p2Section: string
  noDesc: string
  noH1: string
  thinContent: string
  dupTitle: string
  cannibalization: string
  dupDesc: string
  p3Section: string
  noSchema: string
  richSnippetLoss: string
  noOgImage: string
  socialBad: string
  highlight: string
  bestPerf: string
  bestPractice: string
  worstPerf: string
  priorityTarget: string
  decision: string
  conclusion: string
  resourceEst: string
}

/** Sheet names for the 6 report worksheets */
export function getSheetNames(locale: Locale): SheetNames {
  return locale === 'zh'
    ? {
        urlStatus: 'URL 狀態',
        executiveSummary: '主管摘要',
        topIssues: '高頻問題',
        issues: '問題明細',
        pageData: '每頁數據',
        glossary: '術語解釋'
      }
    : {
        urlStatus: 'URL Status',
        executiveSummary: 'Executive Summary',
        topIssues: 'Top Issues',
        issues: 'Issue Details',
        pageData: 'Page Data',
        glossary: 'Glossary'
      }
}

/** Column headers for each report sheet */
export function getUrlStatusHeaders(locale: Locale): string[] {
  return locale === 'zh' ? ['URL', 'HTTP Status', 'Redirect To', '狀態'] : ['URL', 'HTTP Status', 'Redirect To', 'Status']
}

export function getPageDataHeaders(locale: Locale): string[] {
  return locale === 'zh'
    ? [
        '網址', '報告日期',
        'Performance', 'Accessibility', 'Best Practices', 'SEO',
        'Performance等級', 'SEO等級',
        'LCP', 'CLS', 'TBT (INP proxy)', 'FCP', 'Speed Index',
        'HTTPS', 'robots.txt', 'Sitemap', 'Canonical', 'Robots Meta',
        'Title', 'Title字元數', 'Description', 'Description字元數',
        'H1數量', 'H1內容', 'H2數量',
        '圖片總數', '圖片缺Alt',
        'Viewport', 'Lang', 'hreflang', 'Schema類型',
        '內部連結數', '字數',
        'OG:Title', 'OG:Description', 'OG:Image'
      ]
    : [
        'URL', 'Report Date',
        'Performance', 'Accessibility', 'Best Practices', 'SEO',
        'Performance Grade', 'SEO Grade',
        'LCP', 'CLS', 'TBT (INP proxy)', 'FCP', 'Speed Index',
        'HTTPS', 'robots.txt', 'Sitemap', 'Canonical', 'Robots Meta',
        'Title', 'Title Length', 'Description', 'Description Length',
        'H1 Count', 'H1 Content', 'H2 Count',
        'Image Total', 'Images Missing Alt',
        'Viewport', 'Lang', 'hreflang', 'Schema Types',
        'Internal Links', 'Word Count',
        'OG:Title', 'OG:Description', 'OG:Image'
      ]
}

export function getIssuesHeaders(locale: Locale): string[] {
  return locale === 'zh'
    ? [
        '網址', '來源', '分類', '問題ID', '問題標題', '說明',
        '狀態', '分數', '顯示值',
        '優先度', '影響層級',
        '建議解決方案', '商業影響', '預估轉換影響'
      ]
    : [
        'URL', 'Source', 'Category', 'Issue ID', 'Issue Title', 'Description',
        'Status', 'Score', 'Display Value',
        'Priority', 'Impact Level',
        'Suggested Solution', 'Business Impact', 'Estimated Conversion Impact'
      ]
}

export function getTopIssuesHeaders(locale: Locale, total: number): string[] {
  return locale === 'zh'
    ? [
        '排名', '優先度', '問題ID', '問題標題',
        '受影響頁面數', `覆蓋率（共${total}頁）`,
        '建議解法', '商業影響', '範例網址（前3）'
      ]
    : [
        'Rank', 'Priority', 'Issue ID', 'Issue Title',
        'Affected Pages', `Coverage (${total} pages)`,
        'Suggested Fix', 'Business Impact', 'Sample URLs (Top 3)'
      ]
}

export function getExecSummaryHeaders(locale: Locale): string[] {
  return locale === 'zh' ? ['分類', '指標', '數值', '狀態', '說明'] : ['Category', 'Metric', 'Value', 'Status', 'Note']
}

export function getGlossaryHeaders(locale: Locale): string[] {
  return locale === 'zh' ? ['分類', '欄位 / 術語', '白話解釋（1-3 句）'] : ['Category', 'Field / Term', 'Explanation']
}

/** UI labels used in issue sheets and status display */
export function getLabels(locale: Locale): Labels {
  return locale === 'zh'
    ? {
        noData: '（無）',
        none: '無',
        lhFailed: 'Lighthouse 執行失敗',
        lhFailedDesc: '請確認 Chrome 已安裝，或網頁是否需要登入',
        failed: '❌ 失敗',
        warning: '⚠ 警告',
        missing: '❌ 缺失',
        issue: '❌ 問題',
        suggest: '⚠ 建議',
        lighthouse: 'Lighthouse',
        customRule: '自訂規則',
        p0Indexing: '🚨 P0 Indexing',
        p1Tech: '🔧 P1 技術SEO',
        p2Onpage: '📝 P2 On-page',
        p3Advanced: '📎 P3 進階',
        catPerf: '⚡ 效能',
        catA11y: '♿ 無障礙',
        catBP: '✅ 最佳實踐',
        catSEO: '🔍 SEO',
        convP0: '直接影響索引，潛在流量歸零',
        convP1: '影響 Core Web Vitals 或關鍵排名因素，轉換率可能下降 15-30%',
        convP2: '影響 SERP 表現與 CTR，轉換率可能下降 5-15%',
        convP3: '影響較小，長期持續優化',
        statusOk: '✅ 正常',
        statusRedirect: '↩️ 重導向',
        status4xx: '⚠ 4xx',
        status5xx: '💀 5xx',
        statusErr: '❌ 錯誤'
      }
    : {
        noData: '(N/A)',
        none: 'None',
        lhFailed: 'Lighthouse execution failed',
        lhFailedDesc: 'Please check that Chrome is installed and the page does not require login',
        failed: '❌ Failed',
        warning: '⚠ Warning',
        missing: '❌ Missing',
        issue: '❌ Issue',
        suggest: '⚠ Suggestion',
        lighthouse: 'Lighthouse',
        customRule: 'Custom Rule',
        p0Indexing: '🚨 P0 Indexing',
        p1Tech: '🔧 P1 Technical SEO',
        p2Onpage: '📝 P2 On-page',
        p3Advanced: '📎 P3 Advanced',
        catPerf: '⚡ Performance',
        catA11y: '♿ Accessibility',
        catBP: '✅ Best Practices',
        catSEO: '🔍 SEO',
        convP0: 'Directly affects indexing, potential traffic drops to zero',
        convP1: 'Affects Core Web Vitals or key ranking factors, conversion may drop 15-30%',
        convP2: 'Affects SERP performance and CTR, conversion may drop 5-15%',
        convP3: 'Minor impact, optimize over time',
        statusOk: '✅ OK',
        statusRedirect: '↩️ Redirect',
        status4xx: '⚠ 4xx',
        status5xx: '💀  5xx',
        statusErr: '❌ Error'
      }
}

/** Recommended fix actions for each SEO issue ID */
export function getSolutionMap(locale: Locale): Record<string, string> {
  if (locale === 'zh') {
    return {
      'missing-canonical': '每頁加上 <link rel="canonical" href="正規網址">，避免重複內容分散 PageRank',
      'noindex-page': '確認是否故意設置 noindex；若非刻意，立即移除 meta robots noindex',
      'page-nofollow': '確認是否故意設置 nofollow；若非刻意，移除以恢復 PageRank 流動',
      'missing-https': '申請 SSL 憑證，所有 HTTP 301 強制跳轉至 HTTPS',
      'robots-txt-missing': '建立 /robots.txt：User-agent: * / Allow: / 並提交至 Search Console',
      'missing-title': '為頁面加入唯一且描述性的 <title>，包含核心關鍵字',
      'largest-contentful-paint': '① 壓縮主視覺並轉 WebP/AVIF ② 加 fetchpriority="high" ③ 啟用 CDN ④ 預連線 preconnect',
      'first-contentful-paint': '① 最佳化關鍵渲染路徑 ② 內聯關鍵 CSS ③ font-display: swap',
      'cumulative-layout-shift': '① 所有圖片/影片設 width+height ② 避免動態插入 above-the-fold 內容 ③ font-display: optional',
      'total-blocking-time': '① 拆分 JS Bundle（code splitting）② 移除未使用 JS ③ 長任務拆分至 < 50ms ④ 考慮 Web Worker',
      'interaction-to-next-paint': '① 減少事件處理器執行時間 ② 使用 scheduler.yield() ③ 避免同步 DOM 強制重排',
      'speed-index': '① 減少主執行緒阻塞 ② 延遲非關鍵資源 ③ SSR 或預渲染',
      'mainthread-work-breakdown': '① code splitting ② 移除未使用 JS ③ 延遲非必要第三方腳本',
      'unused-javascript': '① tree shaking ② 動態 import() ③ 移除未使用第三方套件',
      'unused-css-rules': '① PurgeCSS 移除無用樣式 ② 按頁面拆分 CSS',
      'render-blocking-insight': '① 非關鍵 CSS 改 media="print" 後 onload 切換 ② JS 加 async/defer',
      'font-display-insight': '① 所有字型加 font-display: swap 或 optional',
      'uses-optimized-images': '① 轉 WebP/AVIF ② 壓縮品質 75-85% ③ 啟用 CDN 自動壓縮',
      'uses-responsive-images': '① 使用 srcset + sizes ② 依裝置提供不同尺寸',
      'uses-text-compression': '① 啟用 Brotli（優先）或 Gzip 伺服器壓縮',
      'uses-long-cache-ttl': '① 靜態資源設 Cache-Control: max-age=31536000, immutable',
      'sitemap-missing': '建立 XML Sitemap 並提交至 Google Search Console',
      'missing-viewport': '加上 <meta name="viewport" content="width=device-width, initial-scale=1">',
      'missing-description': '補上 meta description，50-160 字元，包含主要關鍵字與行動呼籲',
      'title-too-short': '擴寫 Title 至 30-60 字元，加入核心關鍵字與品牌名',
      'title-too-long': '縮短 Title 至 60 字元以內（Google 約截斷 580px）',
      'desc-too-short': '補充 description 至 50 字元以上，完整描述頁面價值',
      'desc-too-long': '縮短 description 至 160 字元以內，避免 SERP 被截斷',
      'missing-h1': '新增一個包含核心關鍵字的 H1 標題',
      'multiple-h1': '保留最重要的 H1，其餘降階為 H2',
      'thin-content': '補充至少 300 字高品質內容，涵蓋使用者搜尋意圖',
      'duplicate-title': '每頁使用唯一 Title，反映各自內容主題，避免關鍵字自相殘殺',
      'duplicate-description': '每頁使用唯一 Description，避免 Google 自動改寫 SERP 摘要',
      'img-missing-alt': '為每張圖片補上描述性 alt 屬性',
      'missing-h2': '加入 H2 作為段落標題，強化內容結構與語義',
      'crawlable-anchors': '確認 <a> href 為實際 URL，移除 javascript: 或空 # 連結',
      'meta-description': '補上或調整 meta description（50-160 字元）',
      'document-title': '確保每頁有唯一且有意義的 <title>',
      'tap-targets': '按鈕/連結最小 48x48px，間距至少 8px',
      'color-contrast': '調整文字與背景對比度至 4.5:1（WCAG AA）以上',
      'hreflang': '多語系頁面加上 hreflang + x-default',
      'robots-txt': '確認 /robots.txt 允許 Googlebot 爬取重要頁面',
      'missing-lang': 'HTML 標籤加上 lang 屬性（如 lang="vi"）',
      'missing-hreflang': '多語系頁面加 <link rel="alternate" hreflang="xx" href="...">',
      'missing-schema': '加入 JSON-LD：Organization / BreadcrumbList / Product / FAQPage',
      'missing-og-image': '<meta property="og:image" content="https://...1200x630.jpg">',
      'missing-og-title': '<meta property="og:title" content="頁面標題">',
      'missing-og-description': '<meta property="og:description" content="頁面描述">',
      'no-internal-links': '加入相關頁面的內部連結，建立主題群（Topic Cluster）'
    }
  }
  return {
    'missing-canonical': 'Add <link rel="canonical" href="canonical-url"> to every page to prevent duplicate content from diluting PageRank',
    'noindex-page': 'Verify if noindex is intentional; if not, remove the meta robots noindex directive immediately',
    'page-nofollow': 'Verify if nofollow is intentional; if not, remove it to restore PageRank flow',
    'missing-https': 'Obtain an SSL certificate and 301 redirect all HTTP URLs to HTTPS',
    'robots-txt-missing': 'Create /robots.txt with User-agent: * / Allow: / and submit to Search Console',
    'missing-title': 'Add a unique, descriptive <title> tag containing core keywords',
    'largest-contentful-paint': '① Compress hero image & convert to WebP/AVIF ② Add fetchpriority="high" ③ Enable CDN ④ Preconnect origins',
    'first-contentful-paint': '① Optimize critical rendering path ② Inline critical CSS ③ Use font-display: swap',
    'cumulative-layout-shift': '① Set width+height on all images/videos ② Avoid dynamic above-the-fold insertions ③ Use font-display: optional',
    'total-blocking-time': '① Code splitting ② Remove unused JS ③ Break long tasks to < 50ms ④ Consider Web Workers',
    'interaction-to-next-paint': '① Reduce event handler execution time ② Use scheduler.yield() ③ Avoid synchronous forced reflows',
    'speed-index': '① Reduce main-thread blocking ② Defer non-critical resources ③ Use SSR or prerendering',
    'mainthread-work-breakdown': '① Code splitting ② Remove unused JS ③ Defer non-essential third-party scripts',
    'unused-javascript': '① Tree shaking ② Dynamic import() ③ Remove unused third-party packages',
    'unused-css-rules': '① Use PurgeCSS to remove unused styles ② Split CSS per page',
    'render-blocking-insight': '① Non-critical CSS: use media="print" with onload switch ② Add async/defer to JS',
    'font-display-insight': '① Add font-display: swap or optional to all fonts',
    'uses-optimized-images': '① Convert to WebP/AVIF ② Compress quality to 75-85% ③ Enable CDN auto-compression',
    'uses-responsive-images': '① Use srcset + sizes ② Serve different sizes per device',
    'uses-text-compression': '① Enable Brotli (preferred) or Gzip server compression',
    'uses-long-cache-ttl': '① Set Cache-Control: max-age=31536000, immutable for static assets',
    'sitemap-missing': 'Create XML Sitemap and submit to Google Search Console',
    'missing-viewport': 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    'missing-description': 'Add meta description (50-160 characters) with primary keywords and call to action',
    'title-too-short': 'Expand title to 30-60 characters with core keywords and brand name',
    'title-too-long': 'Shorten title to under 60 characters (Google truncates at ~580px)',
    'desc-too-short': 'Expand description to 50+ characters with complete page value proposition',
    'desc-too-long': 'Shorten description to under 160 characters to prevent SERP truncation',
    'missing-h1': 'Add one H1 heading containing core keywords',
    'multiple-h1': 'Keep the most important H1 and demote others to H2',
    'thin-content': 'Add at least 300 words of high-quality content matching user search intent',
    'duplicate-title': 'Use unique titles for each page reflecting their specific content to avoid keyword cannibalization',
    'duplicate-description': 'Use unique descriptions for each page to prevent Google from auto-rewriting SERP snippets',
    'img-missing-alt': 'Add descriptive alt attributes to all images',
    'missing-h2': 'Add H2 subheadings to strengthen content structure and semantics',
    'crawlable-anchors': 'Ensure <a> href contains real URLs; remove javascript: or empty # links',
    'meta-description': 'Add or adjust meta description (50-160 characters)',
    'document-title': 'Ensure every page has a unique, meaningful <title>',
    'tap-targets': 'Ensure buttons/links are at least 48x48px with 8px spacing',
    'color-contrast': 'Adjust text-background contrast ratio to 4.5:1 (WCAG AA) or above',
    'hreflang': 'Add hreflang + x-default for multilingual pages',
    'robots-txt': 'Verify /robots.txt allows Googlebot to crawl important pages',
    'missing-lang': 'Add lang attribute to HTML tag (e.g., lang="en")',
    'missing-hreflang': 'Add <link rel="alternate" hreflang="xx" href="..."> for multilingual pages',
    'missing-schema': 'Add JSON-LD: Organization / BreadcrumbList / Product / FAQPage',
    'missing-og-image': '<meta property="og:image" content="https://...1200x630.jpg">',
    'missing-og-title': '<meta property="og:title" content="Page Title">',
    'missing-og-description': '<meta property="og:description" content="Page Description">',
    'no-internal-links': 'Add internal links to related pages to build topic clusters'
  }
}

/** Business impact descriptions for each SEO issue ID */
export function getBusinessMap(locale: Locale): Record<string, string> {
  if (locale === 'zh') {
    return {
      'missing-canonical': '重複內容分散 PageRank，Google 可能索引錯誤版本，自然流量損失 10-30%',
      'noindex-page': '此頁面完全不出現在搜尋結果，所有 SEO 投入歸零',
      'page-nofollow': 'PageRank 無法流動，內部連結權重傳遞中斷',
      'missing-https': 'Google 明確降權 HTTP 網站，瀏覽器顯示「不安全」，信任度歸零',
      'robots-txt-missing': '爬取預算無法控制，Google 可能浪費資源在無意義頁面',
      'missing-title': '嚴重影響 SERP 排名，Google 自動生成的 Title 效果極差',
      'largest-contentful-paint': 'LCP 每增加 1 秒，轉換率下降約 7%，跳出率上升 20-30%',
      'first-contentful-paint': 'FCP 過慢使用者感覺網站卡頓，廣告投放 ROI 下降',
      'cumulative-layout-shift': 'CLS > 0.1 排名降權，版面跳動破壞信任感，誤觸廣告',
      'total-blocking-time': 'TBT 是 INP 的 lab proxy，頁面卡頓造成使用者放棄（行動端最明顯）',
      'interaction-to-next-paint': 'INP > 200ms 為 Core Web Vitals 不合格，直接影響排名',
      'unused-javascript': '浪費頻寬、拖慢速度，增加使用者與伺服器流量成本',
      'render-blocking-insight': '阻塞首屏渲染，LCP 與 FCP 同步惡化',
      'sitemap-missing': '新頁面被 Google 發現速度降低，可能數週才被索引',
      'missing-viewport': '行動端版面異常，Google 行動優先索引嚴重受損',
      'missing-description': 'SERP 點擊率（CTR）平均下降 5-10%',
      'document-title': '排名直接受損，Google 無法判斷頁面主題',
      'meta-description': 'SERP CTR 下降，影響廣告文案參考基準',
      'missing-h1': 'Google 無法判斷頁面主題，排名關鍵字範圍縮小',
      'multiple-h1': '主題訊號分散，降低頁面在目標關鍵字的排名能力',
      'thin-content': 'Google 視為低品質內容，可能觸發演算法降權',
      'duplicate-title': 'Google 混淆頁面主題，造成關鍵字自相殘殺（cannibalization）',
      'duplicate-description': '失去差異化 SERP 展示機會，CTR 無法最佳化',
      'crawlable-anchors': '重要頁面無法被爬取，自然流量永久流失',
      'img-missing-alt': '影響圖片搜尋流量與無障礙合規',
      'color-contrast': '無障礙合規風險，Google 無障礙分數降',
      'missing-schema': 'Rich Snippet 機會損失，CTR 下降 20-30%',
      'missing-og-image': '社群分享無圖片，互動率下降 40-60%',
      'no-internal-links': '沒有內部連結，PageRank 無法流動，網站結構扁平',
      _perf: '效能問題直接影響 Core Web Vitals 評分與 Google 排名',
      _seo: '影響 Google 索引率與自然搜尋流量',
      _a11y: '影響無障礙合規評分，損害品牌形象',
      _bp: '影響安全性與使用者信任度'
    }
  }
  return {
    'missing-canonical': 'Duplicate content dilutes PageRank; Google may index the wrong version, causing 10-30% organic traffic loss',
    'noindex-page': 'This page is completely invisible in search results; all SEO investment is wasted',
    'page-nofollow': 'PageRank flow is interrupted; internal link authority cannot transfer',
    'missing-https': 'Google explicitly downgrades HTTP sites; browser shows "Not Secure", destroying trust',
    'robots-txt-missing': 'Crawl budget cannot be controlled; Google may waste resources on low-value pages',
    'missing-title': 'Severe SERP ranking impact; Google auto-generated titles perform very poorly',
    'largest-contentful-paint': 'Each additional second of LCP reduces conversion by ~7% and increases bounce rate by 20-30%',
    'first-contentful-paint': 'Slow FCP makes users feel the site is sluggish; ad ROI drops',
    'cumulative-layout-shift': 'CLS > 0.1 causes ranking demotion; layout shifts destroy trust and cause accidental clicks',
    'total-blocking-time': 'TBT is the lab proxy for INP; page jank causes user abandonment (most noticeable on mobile)',
    'interaction-to-next-paint': 'INP > 200ms fails Core Web Vitals; directly impacts ranking',
    'unused-javascript': 'Wastes bandwidth, slows down pages, increases traffic costs for users and servers',
    'render-blocking-insight': 'Blocks first-screen rendering; LCP and FCP degrade simultaneously',
    'sitemap-missing': 'New pages are discovered slower by Google; may take weeks to be indexed',
    'missing-viewport': 'Mobile layout breaks; Google mobile-first indexing severely impacted',
    'missing-description': 'SERP CTR drops 5-10% on average',
    'document-title': 'Rankings directly harmed; Google cannot determine page topic',
    'meta-description': 'SERP CTR drops; impacts ad copy benchmarking',
    'missing-h1': 'Google cannot determine page topic; keyword ranking scope narrows',
    'multiple-h1': 'Topic signals diluted; reduces ranking ability for target keywords',
    'thin-content': 'Google treats as low-quality content; may trigger algorithmic demotion',
    'duplicate-title': 'Google confuses page topics; causes keyword cannibalization between your own pages',
    'duplicate-description': 'Loses differentiated SERP display opportunities; CTR cannot be optimized',
    'crawlable-anchors': 'Important pages cannot be crawled; organic traffic permanently lost',
    'img-missing-alt': 'Impacts image search traffic and accessibility compliance',
    'color-contrast': 'Accessibility compliance risk; Google accessibility score drops',
    'missing-schema': 'Rich Snippet opportunity lost; CTR drops 20-30%',
    'missing-og-image': 'No image on social shares; engagement drops 40-60%',
    'no-internal-links': 'No internal links; PageRank cannot flow; site structure is flat',
    _perf: 'Performance issues directly affect Core Web Vitals scores and Google rankings',
    _seo: 'Affects Google indexing rate and organic search traffic',
    _a11y: 'Affects accessibility compliance scores; damages brand image',
    _bp: 'Affects security and user trust'
  }
}

/** Executive summary labels for the overview sheet */
export function getExecLabels(locale: Locale): ExecLabels {
  const zh = locale === 'zh'
  return {
    basic: zh ? '📋 基本' : '📋 Basic',
    reportDate: zh ? '報告日期' : 'Report Date',
    totalPages: zh ? '分析頁面數' : 'Pages Analyzed',
    elapsed: zh ? '耗時（秒）' : 'Elapsed (sec)',
    p0Section: zh ? '🚨 P0 索引層' : '🚨 P0 Indexing',
    p0Total: zh ? '⚠ P0 問題總數' : '⚠ P0 Total Issues',
    p0Highest: zh ? '最高優先——影響能否被收錄' : 'Highest priority — affects whether pages can be indexed',
    noHttps: zh ? '缺少 HTTPS' : 'Missing HTTPS',
    googleDemote: zh ? 'Google 明確降權' : 'Google explicitly demotes',
    noCanon: zh ? '缺少 Canonical' : 'Missing Canonical',
    dupRisk: zh ? '重複內容風險' : 'Duplicate content risk',
    noindex: zh ? 'noindex 頁面' : 'noindex Pages',
    intentional: zh ? '確認是否故意' : 'Verify if intentional',
    noTitle: zh ? '缺少 Title' : 'Missing Title',
    rankImpact: zh ? '嚴重影響排名' : 'Severe ranking impact',
    p1Section: zh ? '🔧 P1 技術層' : '🔧 P1 Technical',
    perfAvg: zh ? 'Performance 平均' : 'Performance Avg',
    cwv: 'Core Web Vitals',
    seoAvg: zh ? 'SEO 平均' : 'SEO Avg',
    lhSeo: 'Lighthouse SEO',
    perfRed: zh ? '效能紅燈（<50）' : 'Performance Red (<50)',
    needOpt: zh ? '需立即優化' : 'Needs immediate optimization',
    noRobots: zh ? '缺少 robots.txt' : 'Missing robots.txt',
    noSitemap: zh ? '缺少 sitemap' : 'Missing sitemap',
    top5: zh ? 'Top 5 Lighthouse 問題' : 'Top 5 Lighthouse Issues',
    fullSiteIssues: zh ? '全站高頻問題' : 'Site-wide frequent issues',
    p2Section: zh ? '📝 P2 內容層' : '📝 P2 Content',
    noDesc: zh ? '缺少 Description' : 'Missing Description',
    noH1: zh ? '缺少 H1' : 'Missing H1',
    thinContent: zh ? '內容過薄（<300字）' : 'Thin Content (<300 words)',
    dupTitle: zh ? '重複 Title 頁面數' : 'Duplicate Title Pages',
    cannibalization: zh ? '關鍵字自相殘殺' : 'Keyword cannibalization',
    dupDesc: zh ? '重複 Desc 頁面數' : 'Duplicate Desc Pages',
    p3Section: zh ? '📎 P3 進階' : '📎 P3 Advanced',
    noSchema: zh ? '缺少 Schema' : 'Missing Schema',
    richSnippetLoss: zh ? 'Rich Snippet 損失' : 'Rich Snippet loss',
    noOgImage: zh ? '缺少 og:image' : 'Missing og:image',
    socialBad: zh ? '社群分享效果差' : 'Poor social share display',
    highlight: zh ? '⭐ 亮點' : '⭐ Highlights',
    bestPerf: zh ? '效能最佳頁面' : 'Best Performance Page',
    bestPractice: zh ? '可參考為最佳實踐' : 'Reference as best practice',
    worstPerf: zh ? '效能最差頁面' : 'Worst Performance Page',
    priorityTarget: zh ? '優先優化目標' : 'Priority optimization target',
    decision: zh ? '📌 決策' : '📌 Decision',
    conclusion: zh ? '一句話結論' : 'One-line Conclusion',
    resourceEst: zh ? '預估資源投入' : 'Estimated Resources'
  }
}

/** Glossary data explaining all report terms */
export function getGlossaryData(locale: Locale): string[][] {
  if (locale === 'zh') {
    return [
      ['🏷️ 優先度', '🚨 P0 索引層', '最高優先。決定 Google「能不能找到你的頁面」。如果 P0 有問題，這個頁面等於不存在於搜尋結果中，其他所有優化都沒有意義。'],
      ['🏷️ 優先度', '🔧 P1 技術層', '高優先。決定 Google「願不願意給你好排名」。包含網站速度（Core Web Vitals）和基礎技術設定，直接影響排名高低。'],
      ['🏷️ 優先度', '📝 P2 內容層', '中優先。決定「使用者搜尋時會不會點進來」。包含標題、描述、內容品質，影響搜尋結果的點擊率（CTR）。'],
      ['🏷️ 優先度', '📎 P3 進階', '低優先。屬於加分項目，像是社群分享的顯示效果、結構化資料等。做了可以錦上添花，但不會直接影響排名。'],
      ['🏷️ 優先度', 'Critical / High / Medium / Low', '影響層級。Critical = 嚴重到可能讓頁面從搜尋結果消失；High = 明顯影響排名；Medium = 有感影響；Low = 微小影響。'],
      ['📄 報告檔案', 'URL 狀態', '所有爬取到的 URL 及其 HTTP 狀態碼、重導向目標，一目即可掌握全站 URL 健康度。'],
      ['📄 報告檔案', '主管摘要', '給主管看的一頁摘要。列出最關鍵的數字、最嚴重的問題、一句話結論、和預估需要投入多少資源修復。'],
      ['📄 報告檔案', '高頻問題', '給 PM 或技術主管看的優先問題排行榜（最多 20 個）。依照 P0→P3 排序，每個問題附上影響範圍和建議解法。'],
      ['📄 報告檔案', '問題明細', '給工程師看的完整問題清單。每一頁的每一個問題都列出來，包含具體的修復方式和預估影響。'],
      ['📄 報告檔案', '每頁數據', '每一頁的原始數據總覽。Lighthouse 分數、技術 SEO 狀態、On-page 資訊全部列在一起，方便交叉比對。'],
      ['📄 報告檔案', '術語解釋', '解釋報告中所有欄位和術語的意思。'],
      ['⚡ Core Web Vitals', 'LCP（Largest Contentful Paint）', '「最大內容繪製時間」。從使用者打開網頁到看到主要內容（大圖片或大標題）需要幾秒。Google 標準：≤ 2.5 秒合格，> 4 秒不合格。'],
      ['⚡ Core Web Vitals', 'CLS（Cumulative Layout Shift）', '「累計版面偏移」。網頁載入時內容是否會亂跳。Google 標準：≤ 0.1 合格，> 0.25 不合格。'],
      ['⚡ Core Web Vitals', 'TBT（Total Blocking Time）', '「總阻塞時間」。頁面載入過程中，JavaScript 卡住畫面多久。TBT 越長，使用者點東西越沒反應。TBT 是 INP 的實驗室替代指標。'],
      ['⚡ Core Web Vitals', 'INP（Interaction to Next Paint）', '「互動到下一次繪製」。衡量使用者點擊/打字後，畫面多快有回應。Google 標準：≤ 200ms 合格，> 500ms 不合格。'],
      ['⚡ Core Web Vitals', 'FCP（First Contentful Paint）', '「首次內容繪製」。打開網頁到畫面上出現第一個文字或圖片的時間。越快越好。'],
      ['⚡ Core Web Vitals', 'Speed Index', '「速度指數」。衡量頁面可見內容填滿的平均速度。數字越小越好。'],
      ['🔧 技術 SEO', 'HTTPS', '網站有沒有使用加密連線（https://）。Google 明確表示 HTTPS 是排名因素。'],
      ['🔧 技術 SEO', 'robots.txt', '告訴 Google 爬蟲「哪些頁面可以爬、哪些不要爬」的文字檔。'],
      ['🔧 技術 SEO', 'Sitemap', 'XML 格式的「網站地圖」。主動告訴 Google 你的網站有哪些頁面。'],
      ['🔧 技術 SEO', 'Canonical', '<link rel="canonical"> 標籤。告訴 Google 這一頁的正式版本網址是什麼。'],
      ['🔧 技術 SEO', 'Robots Meta', '<meta name="robots"> 標籤。可設定 noindex / nofollow。'],
      ['🔧 技術 SEO', 'Viewport', '<meta name="viewport"> 標籤。告訴手機瀏覽器網頁有做行動端適配。'],
      ['🔧 技術 SEO', 'Lang', 'HTML 的 lang 屬性。告訴 Google 頁面是什麼語言。'],
      ['🔧 技術 SEO', 'hreflang', '告訴 Google 頁面有其他語言版本的標籤。'],
      ['🔧 技術 SEO', 'Schema 類型', 'Schema.org 結構化資料（JSON-LD 格式），可觸發 Rich Snippet。'],
      ['📝 On-page SEO', 'Title / Title字元數', '<title> 標籤，是 Google 搜尋結果中最醒目的藍色連結文字。建議 30-60 字元。'],
      ['📝 On-page SEO', 'Description / Description字元數', 'meta description，Google 搜尋結果標題下方的灰色說明文字。建議 50-160 字元。'],
      ['📝 On-page SEO', 'H1數量 / H1內容', '一級標題 <h1>。每頁應只有一個 H1，且包含核心關鍵字。'],
      ['📝 On-page SEO', 'H2數量', '二級標題 <h2>。用來劃分段落結構。'],
      ['📝 On-page SEO', '圖片總數 / 圖片缺Alt', '圖片的 alt 屬性是圖片搜尋和無障礙的關鍵。'],
      ['📝 On-page SEO', '字數', '頁面文字總字數。< 300 字可能被判為薄內容。'],
      ['📎 進階', 'OG:Title / OG:Description / OG:Image', 'Open Graph 標籤。控制社群媒體分享時顯示的標題、說明和圖片。'],
      ['📎 進階', '內部連結數', '頁面連結到同網站其他頁的數量。影響 PageRank 流動。'],
    ]
  }
  return [
    ['🏷️ Priority', '🚨 P0 Indexing', 'Highest priority. Determines whether Google can find your pages. If P0 has issues, the page effectively does not exist in search results.'],
    ['🏷️ Priority', '🔧 P1 Technical', 'High priority. Determines whether Google will rank your pages well. Includes site speed (Core Web Vitals) and basic technical setup.'],
    ['🏷️ Priority', '📝 P2 Content', 'Medium priority. Determines whether users will click your search result. Includes title, description, and content quality.'],
    ['🏷️ Priority', '📎 P3 Advanced', 'Low priority. Bonus items like social share display and structured data. Nice to have but not directly impacting rankings.'],
    ['🏷️ Priority', 'Critical / High / Medium / Low', 'Impact level. Critical = page may disappear from search; High = noticeable ranking impact; Medium = moderate impact; Low = minor impact.'],
    ['📄 Report Sheets', 'URL Status', 'All crawled URLs with HTTP status codes and redirect targets. Quick overview of site-wide URL health.'],
    ['📄 Report Sheets', 'Executive Summary', 'One-page summary for executives. Key metrics, most severe issues, one-line conclusion, and estimated resources needed.'],
    ['📄 Report Sheets', 'Top Issues', 'Priority issue ranking for PMs/tech leads (up to 20). Sorted P0→P3 with impact scope and suggested fixes.'],
    ['📄 Report Sheets', 'Issue Details', 'Complete issue list for engineers. Every issue on every page with specific fix steps and estimated impact.'],
    ['📄 Report Sheets', 'Page Data', 'Raw per-page data overview. Lighthouse scores, technical SEO status, and on-page info side by side.'],
    ['📄 Report Sheets', 'Glossary', 'Explains all fields and terms used in this report.'],
    ['⚡ Core Web Vitals', 'LCP (Largest Contentful Paint)', 'Time until the largest content element (hero image or headline) is visible. Google standard: ≤ 2.5s good, > 4s poor.'],
    ['⚡ Core Web Vitals', 'CLS (Cumulative Layout Shift)', 'How much the page layout shifts during loading. Google standard: ≤ 0.1 good, > 0.25 poor.'],
    ['⚡ Core Web Vitals', 'TBT (Total Blocking Time)', 'How long JavaScript blocks the main thread during loading. TBT is the lab proxy for INP.'],
    ['⚡ Core Web Vitals', 'INP (Interaction to Next Paint)', 'How quickly the page responds after user interaction. Google standard: ≤ 200ms good, > 500ms poor.'],
    ['⚡ Core Web Vitals', 'FCP (First Contentful Paint)', 'Time until the first text or image appears on screen. Faster is better.'],
    ['⚡ Core Web Vitals', 'Speed Index', 'Measures how quickly visible content fills the page. Lower is better.'],
    ['🔧 Technical SEO', 'HTTPS', 'Whether the site uses encrypted connection (https://). Google explicitly considers HTTPS a ranking factor.'],
    ['🔧 Technical SEO', 'robots.txt', 'A text file telling Google which pages to crawl and which to skip.'],
    ['🔧 Technical SEO', 'Sitemap', 'XML site map that proactively tells Google what pages exist on your site.'],
    ['🔧 Technical SEO', 'Canonical', '<link rel="canonical"> tag. Tells Google the official URL version of this page.'],
    ['🔧 Technical SEO', 'Robots Meta', '<meta name="robots"> tag. Can set noindex / nofollow directives.'],
    ['🔧 Technical SEO', 'Viewport', '<meta name="viewport"> tag. Tells mobile browsers the page is mobile-optimized.'],
    ['🔧 Technical SEO', 'Lang', 'HTML lang attribute. Tells Google what language the page content is in.'],
    ['🔧 Technical SEO', 'hreflang', 'Tag telling Google that alternate language versions of this page exist.'],
    ['🔧 Technical SEO', 'Schema Types', 'Schema.org structured data (JSON-LD format) that can trigger Rich Snippets in search results.'],
    ['📝 On-page SEO', 'Title / Title Length', '<title> tag — the prominent blue link text in Google search results. Recommended: 30-60 characters.'],
    ['📝 On-page SEO', 'Description / Description Length', 'meta description — the gray text below the title in search results. Recommended: 50-160 characters.'],
    ['📝 On-page SEO', 'H1 Count / H1 Content', 'Primary heading <h1>. Each page should have exactly one H1 containing core keywords.'],
    ['📝 On-page SEO', 'H2 Count', 'Secondary headings <h2>. Used to structure content into sections.'],
    ['📝 On-page SEO', 'Image Total / Images Missing Alt', 'Image alt attributes are crucial for image search and accessibility.'],
    ['📝 On-page SEO', 'Word Count', 'Total word count of the page. < 300 words may be flagged as thin content.'],
    ['📎 Advanced', 'OG:Title / OG:Description / OG:Image', 'Open Graph tags. Controls how your page appears when shared on social media.'],
    ['📎 Advanced', 'Internal Links', 'Number of links to other pages on the same site. Affects PageRank flow.'],
  ]
}

/** Grade helper — convert numeric score to visual grade with emoji */
export function grade(s: number | string | null | undefined): string {
  if (s == null || s === '') return '-'
  const n = typeof s === 'string' ? parseInt(s) : s
  if (isNaN(n)) return '-'
  return n >= 90 ? '🟢 Good' : n >= 50 ? '🟡 Needs Work' : '🔴 Poor'
}

export function gradeZh(s: number | string | null | undefined): string {
  if (s == null || s === '') return '-'
  const n = typeof s === 'string' ? parseInt(s) : s
  if (isNaN(n)) return '-'
  return n >= 90 ? '🟢 良好' : n >= 50 ? '🟡 需改善' : '🔴 差'
}

export function getGrade(s: number | string | null | undefined, locale: Locale): string {
  return locale === 'zh' ? gradeZh(s) : grade(s)
}
