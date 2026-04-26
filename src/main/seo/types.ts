/** TypeScript type definitions for the SEO analysis pipeline */
export type Locale = 'en' | 'zh'

export interface CrawlProgress {
  phase: string
  current: number
  total: number
  message: string
}

export interface AnalysisProgress {
  current: number
  total: number
  currentUrl: string
  perfScore?: string
  seoScore?: string
}

export interface UrlStatusEntry {
  url: string
  status: number | null
  redirectTo: string | null
  label: string
}

export interface CrawlResult {
  seoUrls: string[]
  allUrls: string[]
  urlStatusData: UrlStatusEntry[]
}

export interface LhrSlim {
  categories: Record<
    string,
    {
      score: number | null
      auditRefs: { id: string }[]
    }
  >
  audits: Record<
    string,
    {
      score: number | null
      scoreDisplayMode: string
      title: string
      description: string
      displayValue: string
    }
  >
}

export interface SeoMeta {
  title: string
  description: string | null
  canonical: string | null
  robots: string
  viewport: string | null
  lang: string
  ogTitle: string | null
  ogDesc: string | null
  ogImage: string | null
  h1Count: number
  h1Text: string[]
  h2Count: number
  imgTotal: number
  imgNoAlt: number
  internalLinkCount: number
  wordCount: number
  schemas: string[]
  hreflangLinks: string[]
  hasOgTitle: boolean
  hasOgDesc: boolean
  hasOgImage: boolean
}

export interface TechChecks {
  isHttps: boolean
  robotsTxtOk: boolean
  sitemapOk: boolean
}

export interface AnalysisResult {
  url: string
  lhr: LhrSlim | null
  meta: SeoMeta | null
  tech: TechChecks
}

export interface FullReportData {
  crawlResult: CrawlResult | null
  analysisResults: AnalysisResult[]
  reportDate: string
  startTime: number
}
