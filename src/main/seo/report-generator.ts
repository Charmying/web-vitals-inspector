/** Excel report generator — produces a multi-sheet XLSX report from analysis results */
import ExcelJS from 'exceljs'
import type { Locale, AnalysisResult, UrlStatusEntry } from './types'
import { getSheetNames, getUrlStatusHeaders, getPageDataHeaders, getIssuesHeaders, getTopIssuesHeaders, getExecSummaryHeaders, getGlossaryHeaders, getGlossaryData, getLabels, getSolutionMap, getBusinessMap, getExecLabels, getGrade } from './i18n'

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
const clean = (v: string | null | undefined): string => (v ?? '').replace(/\[.*?\]\(.*?\)/g, '').replace(/`/g, '').replace(/\n+/g, ' ').trim().slice(0, 250)
const pct = (v: number | null | undefined): number | null => v != null ? Math.round(v * 100) : null
const av = (lhr: AnalysisResult['lhr'], key: string): string => {
  if (!lhr) return 'N/A'
  const audit = lhr.audits?.[key]
  if (!audit) return 'N/A'
  const val = audit.displayValue
  return val ? val : 'N/A'
}

/** Detect duplicate values across analysis results for deduplication warnings */
function detectDuplicates( results: AnalysisResult[], getter: (r: AnalysisResult) => string | null | undefined): Record<string, string[]> {
  const seen: Record<string, string[]> = {}
  for (const r of results) {
    const val = (getter(r) ?? '').trim()
    if (!val) continue
    if (!seen[val]) seen[val] = []
    seen[val].push(r.url)
  }
  const dupes: Record<string, string[]> = {}
  for (const [val, urls] of Object.entries(seen)) {
    if (urls.length > 1) dupes[val] = urls
  }
  return dupes
}

/** Apply consistent header row styling to a worksheet */
function styleHeaderRow(ws: ExcelJS.Worksheet, colCount: number): void {
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
  headerRow.alignment = { vertical: 'middle', wrapText: true }
  headerRow.height = 28
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c)
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' }
    }
  }
}

/** Auto-set column widths based on header text length */
function autoWidth(ws: ExcelJS.Worksheet, headers: string[], maxWidth = 50, minWidth = 10): void {
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1)
    col.width = Math.min(Math.max(h.length * 1.5 + 2, minWidth), maxWidth)
  })
}

/** Generate the complete Excel report with 6 sheets */
export async function generateExcelReport(urlStatusData: UrlStatusEntry[] | null, analysisResults: AnalysisResult[], locale: Locale, reportDate: string, analysisDurationMs: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Web Vitals Inspector'
  wb.created = new Date()

  const sheetNames = getSheetNames(locale)
  const labels = getLabels(locale)
  const solutionMap = getSolutionMap(locale)
  const businessMap = getBusinessMap(locale)
  const dupTitles = detectDuplicates(analysisResults, (r) => r.meta?.title)
  const dupDescs = detectDuplicates(analysisResults, (r) => r.meta?.description)

  /** ========================= Sheet 1: URL Status ========================= */
  const ws1 = wb.addWorksheet(sheetNames.urlStatus)
  const h1 = getUrlStatusHeaders(locale)
  ws1.addRow(h1)
  if (urlStatusData) {
    for (const entry of urlStatusData) {
      ws1.addRow([
        entry.url,
        entry.status ?? labels_noData(locale),
        entry.redirectTo ?? '',
        entry.label
      ])
    }
  }
  styleHeaderRow(ws1, h1.length)
  autoWidth(ws1, h1, 80)
  ws1.getColumn(1).width = 60

  /** ========================= Sheet 2: Executive Summary ========================= */
  generateExecSummarySheet(wb, sheetNames.executiveSummary, analysisResults, dupTitles, dupDescs, locale, reportDate, analysisDurationMs)

  /** ========================= Sheet 3: Top Issues ========================= */
  generateTopIssuesSheet(wb, sheetNames.topIssues, analysisResults, locale, solutionMap, businessMap, dupTitles, dupDescs)

  /** ========================= Sheet 4: Issue Details ========================= */
  generateIssuesSheet(wb, sheetNames.issues, analysisResults, dupTitles, dupDescs, locale, labels, solutionMap, businessMap)

  /** ========================= Sheet 5: Page Data ========================= */
  generatePageDataSheet(wb, sheetNames.pageData, analysisResults, locale, reportDate)

  /** ========================= Sheet 6: Glossary ========================= */
  const ws6 = wb.addWorksheet(sheetNames.glossary)
  const h6 = getGlossaryHeaders(locale)
  ws6.addRow(h6)
  for (const row of getGlossaryData(locale)) {
    ws6.addRow(row)
  }
  styleHeaderRow(ws6, h6.length)
  ws6.getColumn(1).width = 20
  ws6.getColumn(2).width = 35
  ws6.getColumn(3).width = 80

  // Return buffer
  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/** Sheet 5: Per-page data with Lighthouse scores and SEO metadata */
function generatePageDataSheet( wb: ExcelJS.Workbook, sheetName: string, results: AnalysisResult[], locale: Locale, reportDate: string): void {
  const ws = wb.addWorksheet(sheetName)
  const headers = getPageDataHeaders(locale)
  ws.addRow(headers)

  for (const { url, lhr, meta, tech } of results) {
    const cats = lhr?.categories ?? {}
    const perf = pct(cats.performance?.score)
    const a11y = pct(cats.accessibility?.score)
    const bp = pct(cats['best-practices']?.score)
    const seo = pct(cats.seo?.score)
    const hasMeta = meta !== null
    const hasLighthouse = lhr !== null
    const m = meta ?? ({} as Record<string, unknown>)
    const t = tech ?? ({} as Record<string, unknown>)
    const lighthouseStatus = hasLighthouse ? labels_lighthouseSuccess(locale) : labels_lighthouseFailed(locale)
    const metadataStatus = hasMeta ? labels_analyzed(locale) : labels_unavailable(locale)
    const metaText = <T extends string | null | undefined>(value: T): string => hasMeta ? (value ?? '') : labels_noData(locale)
    const metaCount = (value: number | null | undefined): number | string => hasMeta ? (value ?? '') : labels_noData(locale)
    const metaFlag = (ok: boolean): string => hasMeta ? (ok ? '✅' : '❌') : labels_noData(locale)

    ws.addRow([
      url, reportDate,
      lighthouseStatus,
      perf, a11y, bp, seo,
      getGrade(perf, locale), getGrade(seo, locale),
      av(lhr, 'largest-contentful-paint'),
      av(lhr, 'cumulative-layout-shift'),
      av(lhr, 'total-blocking-time'),
      av(lhr, 'first-contentful-paint'),
      av(lhr, 'speed-index'),
      (t as { isHttps?: boolean }).isHttps ? '✅' : '❌',
      (t as { robotsTxtOk?: boolean }).robotsTxtOk ? '✅' : '❌',
      (t as { sitemapOk?: boolean }).sitemapOk ? '✅' : '❌',
      metadataStatus,
      metaText((m as { canonical?: string | null }).canonical) || labels_noData(locale),
      metaText((m as { robots?: string }).robots) || labels_noData(locale),
      metaText((m as { title?: string }).title),
      hasMeta ? (((m as { title?: string }).title ?? '').length || '') : labels_noData(locale),
      metaText((m as { description?: string | null }).description),
      hasMeta ? (((m as { description?: string | null }).description ?? '').length || '') : labels_noData(locale),
      metaCount((m as { h1Count?: number }).h1Count),
      hasMeta ? (((m as { h1Text?: string[] }).h1Text ?? []).slice(0, 2).join(' | ') || labels_none(locale)) : labels_noData(locale),
      metaCount((m as { h2Count?: number }).h2Count),
      metaCount((m as { imgTotal?: number }).imgTotal),
      metaCount((m as { imgNoAlt?: number }).imgNoAlt),
      metaFlag(!!(m as { viewport?: string | null }).viewport),
      metaText((m as { lang?: string }).lang) || labels_noData(locale),
      hasMeta ? (((m as { hreflangLinks?: string[] }).hreflangLinks ?? []).join(', ') || labels_none(locale)) : labels_noData(locale),
      hasMeta ? (((m as { schemas?: string[] }).schemas ?? []).join(', ') || labels_none(locale)) : labels_noData(locale),
      metaCount((m as { internalLinkCount?: number }).internalLinkCount),
      metaCount((m as { wordCount?: number }).wordCount),
      metaText((m as { ogTitle?: string | null }).ogTitle) || labels_noData(locale),
      metaText((m as { ogDesc?: string | null }).ogDesc) || labels_noData(locale),
      metaText((m as { ogImage?: string | null }).ogImage) || labels_noData(locale)
    ])
  }

  styleHeaderRow(ws, headers.length)
  autoWidth(ws, headers)
  ws.getColumn(1).width = 60
}

function labels_noData(locale: Locale): string {
  return locale === 'zh' ? '（無）' : '(N/A)'
}

function labels_lighthouseSuccess(locale: Locale): string {
  return locale === 'zh' ? '已完成' : 'Completed'
}

function labels_lighthouseFailed(locale: Locale): string {
  return locale === 'zh' ? '失敗' : 'Failed'
}

function labels_analyzed(locale: Locale): string {
  return locale === 'zh' ? '已擷取' : 'Extracted'
}

function labels_unavailable(locale: Locale): string {
  return locale === 'zh' ? '無法擷取' : 'Unavailable'
}

function labels_none(locale: Locale): string {
  return locale === 'zh' ? '無' : 'None'
}

/** Sheet 4: Detailed issue list per page with fix recommendations */
function generateIssuesSheet(wb: ExcelJS.Workbook, sheetName: string, results: AnalysisResult[], dupTitles: Record<string, string[]>, dupDescs: Record<string, string[]>, locale: Locale, labels: ReturnType<typeof getLabels>, solutionMap: Record<string, string>, businessMap: Record<string, string>): void {
  const ws = wb.addWorksheet(sheetName)
  const headers = getIssuesHeaders(locale)
  ws.addRow(headers)

  const LH_CAT: Record<string, string> = {
    performance: labels.catPerf,
    accessibility: labels.catA11y,
    'best-practices': labels.catBP,
    seo: labels.catSEO
  }

  const push = (url: string, source: string, cat: string, id: string, title: string, desc: string, status: string, score: string | number, dispVal: string, priority: string, impact: string): void => {
    const solution = solutionMap[id] || `Fix: ${title}`
    const biz = businessMap[id] || businessMap[`_${source === labels.lighthouse ? (cat.includes('效能') || cat.includes('Performance') ? 'perf' : cat.includes('SEO') || cat.includes('seo') ? 'seo' : cat.includes('無障礙') || cat.includes('Accessibility') ? 'a11y' : 'bp') : 'seo'}`] || (locale === 'zh' ? '影響 SEO 整體表現' : 'Affects overall SEO performance')
    const conv = priority === 'P0' ? labels.convP0 : priority === 'P1' ? labels.convP1 : priority === 'P2' ? labels.convP2 : labels.convP3

    ws.addRow([url, source, cat, id, title, clean(desc), status, score, dispVal, priority, impact, solution, biz, conv])
  }

  for (const { url, lhr, meta, tech } of results) {
    const m = meta ?? ({} as Record<string, unknown>)
    const t = tech ?? { isHttps: false, robotsTxtOk: false, sitemapOk: false }

    // Lighthouse issues
    if (!lhr) {
      push(url, labels.lighthouse, '', 'lh-failed', labels.lhFailed, labels.lhFailedDesc, labels.failed, '', '', 'P0', 'Critical')
    } else {
      const auditCat: Record<string, string> = {}
      for (const [catId, cat] of Object.entries(lhr.categories)) {
        for (const ref of cat.auditRefs ?? []) auditCat[ref.id] = catId
      }
      for (const [id, audit] of Object.entries(lhr.audits)) {
        const mode = audit.scoreDisplayMode
        if (['notApplicable', 'manual', 'informative'].includes(mode)) continue
        if (audit.score === 1 || audit.score == null) continue
        const score = Math.round((audit.score ?? 0) * 100)
        const status = audit.score === 0 ? labels.failed : labels.warning
        const catId = auditCat[id] ?? 'other'
        const catLabel = LH_CAT[catId] ?? catId
        const impact = audit.score === 0 ? 'High' : audit.score < 0.5 ? 'Medium' : 'Low'
        const isCritLH = ['crawlable-anchors', 'meta-description', 'document-title', 'hreflang', 'robots-txt', 'canonical'].includes(id)
        const priority = isCritLH || audit.score === 0 ? 'P1' : audit.score < 0.5 ? 'P2' : 'P3'
        push(url, labels.lighthouse, catLabel, id, audit.title, audit.description ?? '', status, score, audit.displayValue ?? '', priority, impact)
      }
    }

    // Tech-level rules are always safe to report — they rely on HTTP HEAD
    // checks, not on reading the page HTML.
    const techP1: [boolean, string, string, string][] = [
      [!t.isHttps, 'missing-https', locale === 'zh' ? '網站使用 HTTP 而非 HTTPS' : 'Site uses HTTP instead of HTTPS', locale === 'zh' ? 'Google 會降低 HTTP 網站信任與排名訊號' : 'Google lowers trust and ranking signals for HTTP sites'],
      [!t.robotsTxtOk, 'robots-txt-missing', locale === 'zh' ? '缺少 /robots.txt' : 'Missing /robots.txt', locale === 'zh' ? '爬蟲行為無法控制' : 'Crawler behavior uncontrolled'],
      [!t.sitemapOk, 'sitemap-missing', locale === 'zh' ? '缺少 /sitemap.xml' : 'Missing /sitemap.xml', locale === 'zh' ? '新頁面被發現速度慢' : 'New pages discovered slowly']
    ]
    for (const [cond, id, title, desc] of techP1) {
      if (!cond) continue
      push(url, labels.customRule, labels.p1Tech, id, title, desc, labels.missing, '', '', 'P1', 'High')
    }

    // If metadata extraction failed we have no grounds to claim any on-page
    // rule was violated — skip to avoid polluting the report with false
    // positives (e.g. "missing H1" on a page we never actually parsed).
    if (meta === null) continue

    // P0: On-page indexing rules (rely on parsed metadata)
    const metaObj = m as { canonical?: string | null; robots?: string; title?: string }
    const p0Issues: [boolean, string, string, string][] = [
      [!metaObj.canonical, 'missing-canonical', locale === 'zh' ? '缺少 Canonical 標籤' : 'Missing Canonical tag', locale === 'zh' ? '重複內容分散 PageRank' : 'Duplicate content dilutes PageRank'],
      [!!metaObj.robots?.includes('noindex'), 'noindex-page', locale === 'zh' ? '頁面設有 noindex' : 'Page has noindex', locale === 'zh' ? '完全不出現在搜尋結果' : 'Completely invisible in search results'],
      [!!metaObj.robots?.includes('nofollow'), 'page-nofollow', locale === 'zh' ? '頁面設有全頁 nofollow' : 'Page has full nofollow', locale === 'zh' ? 'PageRank 無法流動' : 'PageRank flow interrupted'],
      [!metaObj.title, 'missing-title', locale === 'zh' ? '缺少 Title 標籤' : 'Missing Title tag', locale === 'zh' ? '嚴重影響 SERP 排名' : 'Severe SERP ranking impact']
    ]
    for (const [cond, id, title, desc] of p0Issues) {
      if (!cond) continue
      push(url, labels.customRule, labels.p0Indexing, id, title, desc, labels.missing, '', '', 'P0', 'Critical')
    }

    // P1: Technical SEO rules that depend on HTML metadata
    const p1Issues: [boolean, string, string, string][] = [
      [!(m as { viewport?: string | null }).viewport, 'missing-viewport', locale === 'zh' ? '缺少 viewport meta' : 'Missing viewport meta', locale === 'zh' ? '行動端版面異常' : 'Mobile layout broken']
    ]
    for (const [cond, id, title, desc] of p1Issues) {
      if (!cond) continue
      push(url, labels.customRule, labels.p1Tech, id, title, desc, labels.missing, '', '', 'P1', 'High')
    }

    // P2: On-page SEO
    const titleLen = (metaObj.title ?? '').length
    const descMeta = (m as { description?: string | null })
    const descLen = (descMeta.description ?? '').length
    const h1Count = (m as { h1Count?: number }).h1Count ?? 0
    const h2Count = (m as { h2Count?: number }).h2Count ?? 0
    const imgNoAlt = (m as { imgNoAlt?: number }).imgNoAlt ?? 0
    const wordCount = (m as { wordCount?: number }).wordCount ?? 999

    const p2Issues: [boolean, string, string, string][] = [
      [!!metaObj.title && titleLen < 10, 'title-too-short', `Title ${locale === 'zh' ? '過短' : 'too short'}（${titleLen}）`, locale === 'zh' ? '關鍵字訊號不足' : 'Insufficient keyword signals'],
      [titleLen > 60, 'title-too-long', `Title ${locale === 'zh' ? '過長' : 'too long'}（${titleLen}）`, locale === 'zh' ? 'Google 截斷影響 CTR' : 'Truncated by Google, impacts CTR'],
      [!descMeta.description, 'missing-description', locale === 'zh' ? '缺少 Meta Description' : 'Missing Meta Description', locale === 'zh' ? 'CTR 下降 5-10%' : 'CTR drops 5-10%'],
      [!!descMeta.description && descLen < 50, 'desc-too-short', `Description ${locale === 'zh' ? '過短' : 'too short'}（${descLen}）`, locale === 'zh' ? '說明不完整' : 'Incomplete description'],
      [descLen > 160, 'desc-too-long', `Description ${locale === 'zh' ? '過長' : 'too long'}（${descLen}）`, locale === 'zh' ? 'SERP 被截斷' : 'Truncated in SERP'],
      [h1Count === 0, 'missing-h1', locale === 'zh' ? '缺少 H1 標題' : 'Missing H1 heading', locale === 'zh' ? '主題訊號缺失' : 'Topic signals missing'],
      [h1Count > 1, 'multiple-h1', `H1 ${locale === 'zh' ? '過多' : 'too many'}（${h1Count}）`, locale === 'zh' ? '主題訊號分散' : 'Topic signals diluted'],
      [h2Count === 0, 'missing-h2', locale === 'zh' ? '缺少 H2 標題' : 'Missing H2 headings', locale === 'zh' ? '內容結構不清晰' : 'Unclear content structure'],
      [imgNoAlt > 0, 'img-missing-alt', `${imgNoAlt} ${locale === 'zh' ? '張圖片缺少 alt' : 'images missing alt'}`, locale === 'zh' ? '圖片搜尋流量損失' : 'Image search traffic loss'],
      [wordCount < 300, 'thin-content', `${locale === 'zh' ? '內容過薄' : 'Thin content'}（${wordCount} ${locale === 'zh' ? '字' : 'words'}）`, locale === 'zh' ? 'Google 低品質判定' : 'Google low-quality assessment']
    ]
    for (const [cond, id, title, desc] of p2Issues) {
      if (!cond) continue
      push(url, labels.customRule, labels.p2Onpage, id, title, desc, labels.issue, '', '', 'P2', 'Medium')
    }

    // Duplicates
    const titleVal = (metaObj.title ?? '').trim()
    if (titleVal && dupTitles[titleVal]?.length > 1) {
      const others = dupTitles[titleVal].filter((u) => u !== url).slice(0, 2).join(', ')
      push(url, labels.customRule, labels.p2Onpage, 'duplicate-title', `Title ${locale === 'zh' ? '與其他' : 'duplicated with'} ${dupTitles[titleVal].length - 1} ${locale === 'zh' ? '頁重複' : 'other pages'}`, `${titleVal.slice(0, 60)} | ${others}`, labels.issue, '', '', 'P2', 'High')
    }
    const descVal = (descMeta.description ?? '').trim()
    if (descVal && dupDescs[descVal]?.length > 1) push(url, labels.customRule, labels.p2Onpage, 'duplicate-description', `Description ${locale === 'zh' ? '與其他' : 'duplicated with'} ${dupDescs[descVal].length - 1} ${locale === 'zh' ? '頁重複' : 'other pages'}`, descVal.slice(0, 60), labels.issue, '', '', 'P2', 'Medium')

    // P3: Advanced
    const p3Issues: [boolean, string, string, string][] = [
      [!(m as { lang?: string }).lang, 'missing-lang', locale === 'zh' ? '缺少 HTML lang 屬性' : 'Missing HTML lang attribute', locale === 'zh' ? '多語系 SEO 受損' : 'Multilingual SEO affected'],
      [((m as { hreflangLinks?: string[] }).hreflangLinks ?? []).length === 0, 'missing-hreflang', locale === 'zh' ? '無 hreflang 標籤' : 'No hreflang tags', locale === 'zh' ? '語系對應錯誤' : 'Language mapping errors'],
      [((m as { schemas?: string[] }).schemas ?? []).length === 0, 'missing-schema', locale === 'zh' ? '無 Schema.org 結構化資料' : 'No Schema.org structured data', locale === 'zh' ? 'Rich Snippet 損失' : 'Rich Snippet loss'],
      [!(m as { hasOgImage?: boolean }).hasOgImage, 'missing-og-image', locale === 'zh' ? '缺少 og:image' : 'Missing og:image', locale === 'zh' ? '社群分享無圖' : 'No image on social share'],
      [!(m as { hasOgTitle?: boolean }).hasOgTitle, 'missing-og-title', locale === 'zh' ? '缺少 og:title' : 'Missing og:title', locale === 'zh' ? '社群分享標題錯誤' : 'Wrong social share title'],
      [!(m as { hasOgDesc?: boolean }).hasOgDesc, 'missing-og-description', locale === 'zh' ? '缺少 og:description' : 'Missing og:description', locale === 'zh' ? '社群分享無說明' : 'No social share description'],
      [(m as { internalLinkCount?: number }).internalLinkCount === 0, 'no-internal-links', locale === 'zh' ? '無內部連結' : 'No internal links', locale === 'zh' ? 'PageRank 無法流動' : 'PageRank cannot flow']
    ]
    for (const [cond, id, title, desc] of p3Issues) {
      if (!cond) continue
      push(url, labels.customRule, labels.p3Advanced, id, title, desc, labels.suggest, '', '', 'P3', 'Low')
    }
  }

  styleHeaderRow(ws, headers.length)
  autoWidth(ws, headers, 60)
  ws.getColumn(1).width = 60
}

/** Sheet 3: Top 20 most frequent issues ranked by priority */
function generateTopIssuesSheet(wb: ExcelJS.Workbook, sheetName: string, results: AnalysisResult[], locale: Locale, solutionMap: Record<string, string>, businessMap: Record<string, string>, dupTitles: Record<string, string[]>, dupDescs: Record<string, string[]>): void {
  const ws = wb.addWorksheet(sheetName)
  const total = results.length
  const headers = getTopIssuesHeaders(locale, total)
  ws.addRow(headers)

  const labels = getLabels(locale)
  const counter: Record<string, { title: string; source: string; priority: string; urls: Set<string> }> = {}

  const add = (url: string, id: string, title: string, source: string, priority: string): void => {
    if (!counter[id]) counter[id] = { title, source, priority, urls: new Set() }
    counter[id].urls.add(url)
    if ((PRIORITY_RANK[priority] ?? 9) < (PRIORITY_RANK[counter[id].priority] ?? 9)) counter[id].priority = priority
  }

  for (const { url, lhr, meta, tech } of results) {
    const m = meta ?? ({} as Record<string, unknown>)
    const t = tech ?? { isHttps: false, robotsTxtOk: false, sitemapOk: false }

    if (lhr) {
      const auditCat: Record<string, string> = {}
      for (const [catId, cat] of Object.entries(lhr.categories)) {
        for (const ref of cat.auditRefs ?? []) auditCat[ref.id] = catId
      }
      for (const [id, audit] of Object.entries(lhr.audits)) {
        if (['notApplicable', 'manual', 'informative'].includes(audit.scoreDisplayMode)) continue
        if (audit.score === 1 || audit.score == null) continue
        const isCritLH = ['crawlable-anchors', 'meta-description', 'document-title', 'hreflang', 'robots-txt', 'canonical'].includes(id)
        const p = (isCritLH || audit.score === 0) ? 'P1' : audit.score < 0.5 ? 'P2' : 'P3'
        add(url, id, audit.title, labels.lighthouse, p)
      }
    }

    // When we don't even have metadata for a page, stop here — we have no
    // basis to claim any on-page rule is violated and counting false positives
    // would silently distort the Top Issues ranking.
    const hasMeta = meta !== null
    const metaObj = m as { canonical?: string | null; robots?: string; title?: string; viewport?: string | null; description?: string | null; h1Count?: number; h2Count?: number; imgNoAlt?: number; wordCount?: number; schemas?: string[]; hasOgImage?: boolean; hasOgTitle?: boolean; hasOgDesc?: boolean; lang?: string; hreflangLinks?: string[]; internalLinkCount?: number }
    const techRules: [boolean, string, string, string][] = [
      [!t.isHttps, 'missing-https', locale === 'zh' ? '缺少 HTTPS' : 'Missing HTTPS', 'P1'],
      [!t.robotsTxtOk, 'robots-txt-missing', locale === 'zh' ? '缺少 robots.txt' : 'Missing robots.txt', 'P1'],
      [!t.sitemapOk, 'sitemap-missing', locale === 'zh' ? '缺少 sitemap.xml' : 'Missing sitemap.xml', 'P1']
    ]
    for (const [cond, id, title, priority] of techRules) {
      if (cond) add(url, id, title, labels.customRule, priority)
    }

    if (!hasMeta) continue
    const metaRules: [boolean, string, string, string][] = [
      [!metaObj.canonical, 'missing-canonical', locale === 'zh' ? '缺少 Canonical' : 'Missing Canonical', 'P0'],
      [!!metaObj.robots?.includes('noindex'), 'noindex-page', locale === 'zh' ? '頁面 noindex' : 'Page noindex', 'P0'],
      [!metaObj.title, 'missing-title', locale === 'zh' ? '缺少 Title' : 'Missing Title', 'P0'],
      [!metaObj.viewport, 'missing-viewport', locale === 'zh' ? '缺少 Viewport' : 'Missing Viewport', 'P1'],
      [!metaObj.description, 'missing-description', locale === 'zh' ? '缺少 Description' : 'Missing Description', 'P2'],
      [!!metaObj.title && metaObj.title.length < 10, 'title-too-short', locale === 'zh' ? 'Title 過短' : 'Title too short', 'P2'],
      [(metaObj.title?.length ?? 0) > 60, 'title-too-long', locale === 'zh' ? 'Title 過長' : 'Title too long', 'P2'],
      [!!metaObj.description && metaObj.description.length < 50, 'desc-too-short', locale === 'zh' ? 'Description 過短' : 'Description too short', 'P2'],
      [(metaObj.description?.length ?? 0) > 160, 'desc-too-long', locale === 'zh' ? 'Description 過長' : 'Description too long', 'P2'],
      [(metaObj.h1Count ?? 0) === 0, 'missing-h1', locale === 'zh' ? '缺少 H1' : 'Missing H1', 'P2'],
      [(metaObj.h1Count ?? 0) > 1, 'multiple-h1', locale === 'zh' ? 'H1 過多' : 'Too many H1', 'P2'],
      [(metaObj.h2Count ?? 0) === 0, 'missing-h2', locale === 'zh' ? '缺少 H2 標題' : 'Missing H2 headings', 'P2'],
      [(metaObj.imgNoAlt ?? 0) > 0, 'img-missing-alt', locale === 'zh' ? '圖片缺 alt' : 'Images missing alt', 'P2'],
      [(metaObj.wordCount ?? 999) < 300, 'thin-content', locale === 'zh' ? '內容過薄' : 'Thin content', 'P2'],
      [(metaObj.schemas ?? []).length === 0, 'missing-schema', locale === 'zh' ? '無 Schema' : 'No Schema', 'P3'],
      [!metaObj.hasOgImage, 'missing-og-image', locale === 'zh' ? '缺少 og:image' : 'Missing og:image', 'P3'],
      [!metaObj.hasOgTitle, 'missing-og-title', locale === 'zh' ? '缺少 og:title' : 'Missing og:title', 'P3'],
      [!metaObj.hasOgDesc, 'missing-og-description', locale === 'zh' ? '缺少 og:description' : 'Missing og:description', 'P3'],
      [!metaObj.lang, 'missing-lang', locale === 'zh' ? '缺少 HTML lang' : 'Missing HTML lang', 'P3'],
      [(metaObj.hreflangLinks ?? []).length === 0, 'missing-hreflang', locale === 'zh' ? '無 hreflang' : 'No hreflang', 'P3'],
      [metaObj.internalLinkCount === 0, 'no-internal-links', locale === 'zh' ? '無內部連結' : 'No internal links', 'P3']
    ]
    for (const [cond, id, title, priority] of metaRules) {
      if (cond) add(url, id, title, labels.customRule, priority)
    }
    // Cross-page duplicate detection
    const titleVal = (metaObj.title ?? '').trim()
    if (titleVal && dupTitles[titleVal]?.length > 1) {
      add(url, 'duplicate-title', locale === 'zh' ? '重複 Title' : 'Duplicate Title', labels.customRule, 'P2')
    }
    const descVal = (metaObj.description ?? '').trim()
    if (descVal && dupDescs[descVal]?.length > 1) {
      add(url, 'duplicate-description', locale === 'zh' ? '重複 Description' : 'Duplicate Description', labels.customRule, 'P2')
    }
  }

  const sorted = Object.entries(counter)
    .map(([id, d]) => ({
      id, title: d.title, count: d.urls.size, priority: d.priority,
      coverage: Math.round((d.urls.size / total) * 100),
      samples: [...d.urls].slice(0, 3).join(' | ')
    }))
    .sort((a, b) => {
      const pd = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
      return pd !== 0 ? pd : b.count - a.count
    })
    .slice(0, 20)

  for (let idx = 0; idx < sorted.length; idx++) {
    const item = sorted[idx]
    ws.addRow([
      idx + 1, item.priority, item.id, item.title,
      item.count, item.coverage + '%',
      (solutionMap[item.id] || '').slice(0, 80),
      (businessMap[item.id] || '').slice(0, 80),
      item.samples
    ])
  }

  styleHeaderRow(ws, headers.length)
  autoWidth(ws, headers, 60)
}

/** Sheet 2: Executive summary with key metrics and one-line conclusion */
function generateExecSummarySheet(wb: ExcelJS.Workbook, sheetName: string, results: AnalysisResult[], dupTitles: Record<string, string[]>, dupDescs: Record<string, string[]>, locale: Locale, reportDate: string, analysisDurationMs: number): void {
  const ws = wb.addWorksheet(sheetName)
  const headers = getExecSummaryHeaders(locale)
  ws.addRow(headers)

  const L = getExecLabels(locale)
  const total = results.length
  if (total === 0) { styleHeaderRow(ws, headers.length); return }

  const avgScore = (cat: string): number | null => {
    const valid = results.filter((r) => r.lhr?.categories?.[cat]?.score != null)
    if (!valid.length) return null
    return Math.round((valid.reduce((a, r) => a + (r.lhr!.categories[cat].score ?? 0), 0) / valid.length) * 100)
  }

  const avgPerf = avgScore('performance')
  const avgSEO = avgScore('seo')
  const lighthouseSuccessCount = results.filter((r) => r.lhr !== null).length
  const lighthouseFailureCount = total - lighthouseSuccessCount
  const metaValid = results.filter((r) => r.meta !== null)
  const mv = metaValid.length
  const metaUnavailableCount = total - mv
  const cnt = (pred: (r: AnalysisResult) => boolean): number => metaValid.filter(pred).length
  const pct2 = (n: number, base = total): string => locale === 'zh' ? `${n} / ${base}（${base > 0 ? Math.round((n / base) * 100) : 0}%）` : `${n} / ${base} (${base > 0 ? Math.round((n / base) * 100) : 0}%)`
  const noHttps = results.filter((r) => !r.tech?.isHttps).length
  const noCanon = cnt((r) => !r.meta?.canonical)
  const hasNoIdx = cnt((r) => !!r.meta?.robots?.includes('noindex'))
  const noTitle = cnt((r) => !r.meta?.title)
  const p0Total = noCanon + hasNoIdx + noTitle
  const redPerf = results.filter((r) => (r.lhr?.categories?.performance?.score ?? 1) < 0.5).length
  const noRobots = results.filter((r) => !r.tech?.robotsTxtOk).length
  const noSitemap = results.filter((r) => !r.tech?.sitemapOk).length
  const noDesc = cnt((r) => !r.meta?.description)
  const noH1 = cnt((r) => (r.meta?.h1Count ?? 1) === 0)
  const thin = cnt((r) => (r.meta?.wordCount ?? 999) < 300)
  const dupTitleCount = Object.values(dupTitles).reduce((a, urls) => a + urls.length, 0)
  const dupDescCount = Object.values(dupDescs).reduce((a, urls) => a + urls.length, 0)
  const noSchema = cnt((r) => (r.meta?.schemas ?? []).length === 0)
  const noOgImg = cnt((r) => !r.meta?.hasOgImage)

  // Top 5 Lighthouse issues
  const freq: Record<string, number> = {}
  results.forEach((r) => {
    Object.values(r.lhr?.audits ?? {}).forEach((a) => {
      if (a.score !== 1 && a.score != null && !['notApplicable', 'manual', 'informative'].includes(a.scoreDisplayMode)) freq[a.title] = (freq[a.title] || 0) + 1
    })
  })
  const top5 = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, c]) => locale === 'zh' ? `${t}（${c}頁）` : `${t} (${c} pages)`).join(locale === 'zh' ? '；' : '; ')
  const withPerf = results.filter((r) => r.lhr?.categories?.performance?.score != null)
  const withSeo = results.filter((r) => r.lhr?.categories?.seo?.score != null)
  const best = withPerf.length ? withPerf.reduce((a, b) => (a.lhr!.categories.performance.score ?? 0) > (b.lhr!.categories.performance.score ?? 0) ? a : b).url : '-'
  const worst = withPerf.length ? withPerf.reduce((a, b) => (a.lhr!.categories.performance.score ?? 1) < (b.lhr!.categories.performance.score ?? 1) ? a : b).url : '-'
  const elapsed = (Math.max(analysisDurationMs, 0) / 1000).toFixed(1)
  const gradeIcon = (s: number): string => s >= 90 ? '🟢' : s >= 50 ? '🟡' : '🔴'
  const scoreCell = (s: number | null): string | number => s ?? labels_noData(locale)
  const scoreStatus = (s: number | null): string => s == null ? '⚪' : gradeIcon(s)
  const coverageStatus = (success: number, base = total): string => success === base ? '🟢' : success === 0 ? '🔴' : '🟡'
  const light = (bad: boolean): string => bad ? '🔴' : '🟢'
  const warn = (bad: boolean): string => bad ? '🟡' : '🟢'
  const lighthouseCoverageNote = (success: number): string =>
    success === total
      ? L.avgBasedOnAll
      : locale === 'zh'
        ? `平均分數僅基於 ${success} / ${total} 個 Lighthouse 成功頁面`
        : `Averages are based on ${success} of ${total} successful Lighthouse runs`
  const lighthouseSuccessNote = (): string =>
    lighthouseSuccessCount === total
      ? L.avgBasedOnAll
      : locale === 'zh'
        ? '只有成功頁面會進入平均分數與 Lighthouse 排行'
        : 'Only successful pages contribute to averages and Lighthouse rankings'

  // Conclusion
  const coverageWarning = lighthouseFailureCount > 0
    ? locale === 'zh'
      ? `另有 ${lighthouseFailureCount} 頁 Lighthouse 執行失敗，平均分數僅供成功頁面參考。`
      : `${lighthouseFailureCount} ${lighthouseFailureCount === 1 ? 'page' : 'pages'} failed Lighthouse, so averages cover successful pages only.`
    : ''
  const conclusion = lighthouseSuccessCount === 0
    ? (locale === 'zh'
        ? '🔴 Lighthouse 在所有頁面都執行失敗，請先排查執行環境、Chrome 可用性或站台可存取性，再解讀報表。'
        : '🔴 Lighthouse failed on every page. Fix the execution environment, Chrome availability, or site accessibility before interpreting the report.')
    : locale === 'zh'
      ? (p0Total > 0
          ? `🔴 發現 ${p0Total} 個 P0 緊急問題（Indexing 層），直接阻擋 Google 索引，需立即修復。${coverageWarning ? ` ${coverageWarning}` : ''}`
          : avgPerf != null && avgPerf < 50
            ? `🔴 整體效能偏弱（平均 ${avgPerf}），LCP 與 JS 阻塞嚴重，建議優先優化前端載入策略。${coverageWarning ? ` ${coverageWarning}` : ''}`
            : avgPerf != null && avgPerf < 75
              ? `🟡 整體效能中等（平均 ${avgPerf}），建議處理 LCP、未使用 JS 及缺失的 Schema。${coverageWarning ? ` ${coverageWarning}` : ''}`
              : `🟢 整體效能良好（平均 ${avgPerf}），維持現有水準，持續監控 CLS 與 INP。${coverageWarning ? ` ${coverageWarning}` : ''}`)
      : (p0Total > 0
          ? `🔴 Found ${p0Total} P0 critical issues (Indexing layer) directly blocking Google indexing. Fix immediately.${coverageWarning ? ` ${coverageWarning}` : ''}`
          : avgPerf != null && avgPerf < 50
            ? `🔴 Overall performance is weak (avg ${avgPerf}). LCP and JS blocking are severe. Prioritize frontend optimization.${coverageWarning ? ` ${coverageWarning}` : ''}`
            : avgPerf != null && avgPerf < 75
              ? `🟡 Overall performance is moderate (avg ${avgPerf}). Address LCP, unused JS, and missing Schema.${coverageWarning ? ` ${coverageWarning}` : ''}`
              : `🟢 Overall performance is good (avg ${avgPerf}). Maintain current level, monitor CLS and INP.${coverageWarning ? ` ${coverageWarning}` : ''}`)

  const resourceEstimate = lighthouseSuccessCount === 0
    ? (locale === 'zh'
        ? '先修復 Lighthouse 執行環境與站台可存取性，再估算 SEO / 效能優化工時'
        : 'Fix the Lighthouse execution environment and site accessibility before estimating SEO or performance work')
    : locale === 'zh'
      ? (p0Total > 5 ? '預估需 1-2 位工程師 × 2 週完成 P0+P1 修復'
          : p0Total > 0 ? '預估需 1 位工程師 × 1 週完成 P0+P1 修復'
            : redPerf > 3 ? '預估需 1 位工程師 × 2 週完成效能優化'
              : '預估需 1 位工程師 × 3-5 天完成優化')
      : (p0Total > 5 ? 'Estimated: 1-2 engineers × 2 weeks to fix P0+P1'
          : p0Total > 0 ? 'Estimated: 1 engineer × 1 week to fix P0+P1'
            : redPerf > 3 ? 'Estimated: 1 engineer × 2 weeks for performance optimization'
              : 'Estimated: 1 engineer × 3-5 days to optimize')

  const rows: (string | number)[][] = [
    [L.basic, L.reportDate, reportDate, '', ''],
    [L.basic, L.totalPages, total, '', ''],
    [L.basic, L.elapsed, elapsed, '', ''],
    [L.basic, L.lhSuccess, pct2(lighthouseSuccessCount), coverageStatus(lighthouseSuccessCount), lighthouseSuccessNote()],
    [L.basic, L.lhFailed, pct2(lighthouseFailureCount), warn(lighthouseFailureCount > 0), L.reviewFailures],
    [L.basic, L.metaUnavailable, pct2(metaUnavailableCount), warn(metaUnavailableCount > 0), L.onPageCoverage],
    [L.p0Section, L.p0Total, p0Total, light(p0Total > 0), L.p0Highest],
    [L.p0Section, L.noCanon, pct2(noCanon, mv), light(noCanon > 0), L.dupRisk],
    [L.p0Section, L.noindex, pct2(hasNoIdx, mv), light(hasNoIdx > 0), L.intentional],
    [L.p0Section, L.noTitle, pct2(noTitle, mv), light(noTitle > 0), L.rankImpact],
    [L.p1Section, L.perfAvg, scoreCell(avgPerf), scoreStatus(avgPerf), lighthouseCoverageNote(withPerf.length)],
    [L.p1Section, L.seoAvg, scoreCell(avgSEO), scoreStatus(avgSEO), lighthouseCoverageNote(withSeo.length)],
    [L.p1Section, L.perfRed, pct2(redPerf), light(redPerf > 0), L.needOpt],
    [L.p1Section, L.noHttps, pct2(noHttps), warn(noHttps > 0), L.googleDemote],
    [L.p1Section, L.noRobots, pct2(noRobots), warn(noRobots > 0), ''],
    [L.p1Section, L.noSitemap, pct2(noSitemap), warn(noSitemap > 0), ''],
    [L.p1Section, L.top5, top5, '', L.fullSiteIssues],
    [L.p2Section, L.noDesc, pct2(noDesc, mv), warn(noDesc > 0), ''],
    [L.p2Section, L.noH1, pct2(noH1, mv), warn(noH1 > 0), ''],
    [L.p2Section, L.thinContent, pct2(thin, mv), warn(thin > 0), ''],
    [L.p2Section, L.dupTitle, dupTitleCount, warn(dupTitleCount > 0), L.cannibalization],
    [L.p2Section, L.dupDesc, dupDescCount, warn(dupDescCount > 0), ''],
    [L.p3Section, L.noSchema, pct2(noSchema, mv), warn(noSchema > 0), L.richSnippetLoss],
    [L.p3Section, L.noOgImage, pct2(noOgImg, mv), warn(noOgImg > 0), L.socialBad],
    [L.highlight, L.bestPerf, best, '', L.bestPractice],
    [L.highlight, L.worstPerf, worst, '', L.priorityTarget],
    [L.decision, L.conclusion, conclusion, '', ''],
    [L.decision, L.resourceEst, resourceEstimate, '', '']
  ]

  for (const row of rows) ws.addRow(row)

  styleHeaderRow(ws, headers.length)
  ws.getColumn(1).width = 18
  ws.getColumn(2).width = 25
  ws.getColumn(3).width = 65
  ws.getColumn(4).width = 10
  ws.getColumn(5).width = 45
}
