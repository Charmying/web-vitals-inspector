# Project Architecture

**English** | [繁體中文](./STRUCTURE.zh-TW.md)

This document explains the project's folder structure, naming conventions, and the design decisions behind them.

---

## Table of Contents

- [Overall Architecture](#overall-architecture)
- [Core Directory Descriptions](#core-directory-descriptions)
- [SEO Analysis Pipeline](#seo-analysis-pipeline)
- [IPC Communication Model](#ipc-communication-model)
- [Naming Conventions](#naming-conventions)
- [Design Decisions](#design-decisions)

---

## Overall Architecture

```
web-vitals-inspector/
├── docs/                               # Project documentation
├── build/                              # Electron build resources
│   └── entitlements.mac.plist          # macOS sandbox entitlements
├── resources/                          # App static assets (icons, etc.)
├── src/
│   ├── main/                           # Electron main process
│   │   ├── index.ts                    # App entry — window creation & lifecycle
│   │   ├── ipc-handlers.ts             # All IPC channel handlers
│   │   └── seo/                        # SEO analysis pipeline
│   │       ├── analyzer.ts             # Lighthouse + Puppeteer metadata extraction
│   │       ├── crawler.ts              # URL discovery & deduplication
│   │       ├── i18n.ts                 # Bilingual report content
│   │       ├── report-generator.ts     # Excel report generation (6 sheets)
│   │       └── types.ts                # Shared TypeScript type definitions
│   ├── preload/
│   │   ├── index.ts                    # Context bridge — exposes API to renderer
│   │   └── index.d.ts                  # TypeScript declarations for window.api
│   └── renderer/
│       ├── index.html                  # HTML entry point
│       └── src/
│           ├── App.tsx                 # Root component — step-based workflow
│           ├── main.tsx                # React entry point
│           ├── env.d.ts                # Environment type declarations
│           ├── components/
│           │   ├── ThemeToggle.tsx     # Dark/light theme toggle button
│           │   └── HelpModal.tsx       # In-app help dialog
│           ├── hooks/
│           │   └── useTheme.ts         # Custom hook for theme management
│           ├── i18n/
│           │   └── index.ts            # UI translation strings (EN / ZH)
│           └── styles/                 # Global CSS styles
├── electron-builder.yml                # Distribution packaging config
├── electron.vite.config.ts             # Vite build config for all 3 processes
├── package.json
├── tsconfig.json                       # Base TypeScript config
├── tsconfig.node.json                  # tsconfig for main + preload
├── tsconfig.web.json                   # tsconfig for renderer
└── README.md
```

---

## Core Directory Descriptions

### `/src/main` — Electron Main Process

**Responsibility:** Node.js environment; all privileged operations run here — filesystem access, spawning subprocesses, native dialogs, and web browsing via Puppeteer.

**Why this design:**
- Electron's security model requires all system-level work to stay in the main process
- The main process never touches the DOM; all UI updates are sent to the renderer via IPC events

---

#### `index.ts` — Application Entry Point

Creates the `BrowserWindow`, configures `webPreferences` with a preload script, and registers all IPC handlers on app ready.

Key decisions:
- `autoHideMenuBar: true` — Keeps the UI clean; the menu bar is accessible by pressing `Alt`
- `sandbox: false` — Required for the preload script to use `require()` for IPC
- External links are opened in the default browser via `shell.openExternal` rather than inside Electron

---

#### `ipc-handlers.ts` — IPC Channel Registry

**Responsibility:** Define and register every `ipcMain.handle` channel. Acts as the single control point for all communication between renderer and main.

**Channels:**

| Channel | Direction | Description |
|---------|-----------|-------------|
| `seo:start-crawl` | Renderer → Main | Crawl a website and return discovered URLs |
| `seo:parse-urls-file` | Renderer → Main | Open native file dialog and parse a `.txt` URL list |
| `seo:start-analysis` | Renderer → Main | Run Lighthouse + Puppeteer on a list of URLs |
| `seo:save-report` | Renderer → Main | Open save dialog and write the `.xlsx` file |
| `seo:download-urls` | Renderer → Main | Save crawled URL lists as `.txt` |
| `seo:abort` | Renderer → Main | Signal the current operation to stop |
| `seo:progress` | Main → Renderer | Real-time progress events during crawl / analysis |

**Shared state:**
Module-level variables (`lastCrawlUrlStatus`, `lastAnalysisResults`, etc.) accumulate data across the multi-step workflow. This avoids passing large payloads back and forth over IPC unnecessarily.

---

### `/src/main/seo` — SEO Analysis Pipeline

The core business logic is split into four focused modules:

---

#### `types.ts` — Shared Type Definitions

Single source of truth for all data shapes flowing through the pipeline. Key types:

| Type | Description |
|------|-------------|
| `CrawlResult` | Output of URL discovery: `seoUrls`, `allUrls`, `urlStatusData` |
| `UrlStatusEntry` | Per-URL HTTP status, redirect target, and label |
| `AnalysisResult` | Combined output: Lighthouse `lhr`, Puppeteer `meta`, and `tech` checks |
| `LhrSlim` | Lightweight subset of a full Lighthouse report |
| `SeoMeta` | Complete SEO metadata extracted from a page |
| `TechChecks` | HTTPS, robots.txt, and sitemap availability flags |
| `Locale` | `'en' | 'zh'` — controls report language |

---

#### `crawler.ts` — URL Discovery

**Responsibility:** Discover all crawlable URLs for a given root domain, classify them as SEO-relevant, check HTTP status, and return a deduplicated list.

**Discovery sources (in order):**
1. `robots.txt` → linked sitemaps
2. XML sitemap candidates (`/sitemap.xml`, `/sitemap_index.xml`, etc.)
3. Wayback Machine CDX API (historical URL snapshot)
4. Search engine queries (Google/Bing `site:` operator, scraped via Puppeteer)
5. Recursive Puppeteer link extraction from all pages in the queue

**URL filtering:**
- Strips noise query parameters (UTM, tracking IDs, session tokens) using `ParamAnalyzer`
- Preserves meaningful parameters (`category`, `page`, `id`, `slug`, etc.)
- Excludes static assets, admin paths, auth paths, API endpoints, and WordPress internals
- Detects and skips login walls to avoid crawling authenticated content

**Output:**
- `seoUrls` — pages suitable for Lighthouse audits (HTML, not assets/admin)
- `allUrls` — every discovered URL, including non-HTML content

---

#### `analyzer.ts` — Lighthouse & Puppeteer Analysis

**Responsibility:** For each URL, run a Lighthouse CLI audit and extract SEO metadata via Puppeteer, then combine results.

**Lighthouse execution:**
- Spawns Lighthouse as a child process (not as a Node.js API) for process isolation
- Writes JSON output to a temp file, parses it, then cleans up
- Retries up to 2 times on failure with a 3-second back-off
- Configures headless Chrome with `--no-sandbox` and `--disable-gpu` for server compatibility

**Puppeteer metadata extraction (`getSEOData`):**
- Extracts 20+ metadata fields per page (title, description, canonical, OG tags, hreflang, schema types, etc.)
- Runs concurrently across multiple pages using a shared browser instance
- Has a 60-second page timeout to handle slow sites gracefully

**Technical checks (`getTechChecks`):**
- HTTPS — checks `location.protocol`
- `robots.txt` — verifies HTTP 200, not blocked via axios
- Sitemap — checks common sitemap candidate URLs

---

#### `report-generator.ts` — Excel Report

**Responsibility:** Assemble a 6-sheet `.xlsx` workbook from all analysis data using ExcelJS.

**Sheets:**

| # | Sheet | Contents |
|---|-------|----------|
| 1 | URL Status | Every crawled URL with HTTP status code, redirect target, and classification label |
| 2 | Executive Summary | One-page overview: totals, P0–P3 issue counts, average scores, top 5 issues |
| 3 | Top Issues | Aggregated issue frequency table (≤ 20 rows) with business impact |
| 4 | Issue Details | Full per-page issue list with priority (P0–P3), solution recommendations |
| 5 | Page Data | Complete per-page data: all Lighthouse scores, CWV metrics, and SEO fields |
| 6 | Glossary | Explanations of all column names, metrics, and priority definitions |

**Priority classification:**

| Priority | Category | Examples |
|----------|----------|---------|
| P0 | Indexing | No HTTPS, noindex directive, missing canonical |
| P1 | Technical | Low performance score, failed robots.txt/sitemap |
| P2 | On-page | Missing title/description/H1, thin content, duplicate meta |
| P3 | Advanced | Missing schema markup, missing hreflang |

---

#### `i18n.ts` — Report Translations

**Responsibility:** Provide all bilingual string content for the Excel report — sheet names, column headers, labels, solution text, glossary entries, and more.

All exported functions accept a `Locale` parameter (`'en'` or `'zh'`) and return the appropriate strings. This keeps the report generator clean and free of inline translation logic.

---

### `/src/preload` — Context Bridge

**Responsibility:** Securely expose a typed `window.api` object to the renderer process through Electron's `contextBridge`.

**Why this design:**
- `contextBridge` prevents renderer code from directly accessing Node.js APIs
- The API surface is intentionally minimal — only the 7 channels the UI actually needs
- The `onProgress` function returns a cleanup function to properly remove IPC listeners, preventing memory leaks

**Exposed API:**

```typescript
window.api = {
  startCrawl(rootUrl: string): Promise<{ seoUrls: string[]; allUrls: string[] }>
  parseUrlsFile(): Promise<string[] | null>
  startAnalysis(urls: string[]): Promise<AnalysisResult[]>
  saveReport(locale: string): Promise<{ success: boolean; filePath?: string }>
  downloadUrls(type: 'seo' | 'all'): Promise<boolean>
  abort(): Promise<boolean>
  onProgress(callback: (data: unknown) => void): () => void
}
```

---

### `/src/renderer` — React Frontend

**Responsibility:** The visible application UI. Runs in a Chromium renderer process with no direct Node.js access.

---

#### `App.tsx` — Step-Based Workflow

The entire application UI is a single component that walks the user through a linear 5-step workflow:

```
input → urls → settings → running → done
```

| Step | Description |
|------|-------------|
| `input` | Choose analysis mode (crawl / single / upload) and enter root URL |
| `urls` | Review discovered URLs, download lists, confirm selection |
| `settings` | Choose report language (EN / ZH) and review analysis summary |
| `running` | Live progress log with abort capability |
| `done` | Save report button, result summary, sheet contents guide |

**State management:** All state lives in `App.tsx` via `useState`. There is no external state library — the workflow is simple and linear enough that lifting state to the root component is the right choice.

---

#### `components/ThemeToggle.tsx`

A single-button component that calls `useTheme().toggle()`. Renders a sun/moon icon depending on the active theme.

---

#### `components/HelpModal.tsx`

An overlay modal shown when the user clicks the Help button. Describes the 3 input modes and the `.txt` file format. Fully translated via the `t()` helper.

---

#### `hooks/useTheme.ts`

Custom hook that:
1. Reads the initial theme from `localStorage` (or `prefers-color-scheme` as fallback)
2. Applies `dark` class to `<html>` on change
3. Persists the choice to `localStorage` under key `wvi-theme`

---

#### `i18n/index.ts`

A simple key/value translation store for all UI strings. Supports `'en'` and `'zh'` locales. No external i18n library is used — the UI string set is small and stable enough that a plain object is sufficient.

---

## SEO Analysis Pipeline

The full end-to-end flow:

```
User Input
    │
    ▼
[Crawler]
    ├── Fetch robots.txt → parse sitemap URLs
    ├── Fetch XML sitemap candidates
    ├── Query Wayback Machine CDX API
    ├── Scrape search engine "site:" results
    └── Recursive Puppeteer link extraction
    │
    ▼
URL Deduplication & Filtering
    ├── Strip noise parameters (UTM, tracking tokens)
    ├── Preserve meaningful parameters (category, page, id, slug)
    ├── Exclude assets, admin paths, auth paths, API endpoints
    └── Check HTTP status for every URL
    │
    ▼
[Analyzer] — per URL, in parallel batches
    ├── Lighthouse CLI subprocess → LhrSlim
    └── Puppeteer page evaluation → SeoMeta + TechChecks
    │
    ▼
[Report Generator]
    └── ExcelJS workbook → 6-sheet .xlsx file
```

---

## IPC Communication Model

```
Renderer (React)
    │  window.api.startCrawl(url)
    │  window.api.onProgress(callback)      ◄─── seo:progress events
    ▼
Preload (Context Bridge)
    │  ipcRenderer.invoke / ipcRenderer.on
    ▼
Main Process (ipc-handlers.ts)
    │
    ├── crawlUrls()                 [crawler.ts]
    ├── analyzeUrls()               [analyzer.ts]
    └── generateExcelReport()       [report-generator.ts]
```

The renderer never touches the filesystem or spawns processes. All privileged work is handled in `ipc-handlers.ts` and delegated to the SEO pipeline modules.

---

## Naming Conventions

### Files
- **Main process & preload:** kebab-case (`ipc-handlers.ts`, `report-generator.ts`)
- **React components:** PascalCase (`ThemeToggle.tsx`, `HelpModal.tsx`)
- **Hooks:** camelCase with `use` prefix (`useTheme.ts`)
- **Utilities / modules:** kebab-case (`report-generator.ts`, `types.ts`)

### TypeScript
- **Interfaces & types:** PascalCase (`AnalysisResult`, `SeoMeta`)
- **Union types:** PascalCase (`Locale`, `UILocale`, `Mode`, `Step`)
- **Constants:** SCREAMING_SNAKE_CASE (`EXCLUDE_EXTENSIONS`, `NOISE_PARAMS`, `LH_RETRY`)
- **Functions:** camelCase (`analyzeUrls`, `generateExcelReport`)

---

## Design Decisions

### Why Electron?
The app requires running Puppeteer (a full Chromium instance) and spawning Lighthouse as a subprocess — operations that are not possible in a browser or a simple CLI tool. Electron provides the right environment: native file dialogs, filesystem access, and a polished cross-platform desktop experience.

### Why electron-vite?
`electron-vite` wraps Vite to handle all three Electron process types (main, preload, renderer) with a single config file. It provides fast HMR for the renderer during development without custom webpack configuration.

### Why Lighthouse CLI instead of the Node.js API?
Running Lighthouse as a spawned subprocess isolates its heavy Chrome instance from the main Electron process. This prevents memory conflicts and allows the main process to cleanly kill the Lighthouse process if the user aborts.

### Why no Redux / Zustand?
The application workflow is a simple linear state machine (5 steps). All state lives in `App.tsx`. Adding a state management library would introduce unnecessary complexity for a flow this contained.

### Why ExcelJS?
ExcelJS provides full control over cell formatting, colors, borders, column widths, and multiple worksheets — all required for the styled, professional report format. Libraries like `xlsx` / `SheetJS` have weaker styling APIs in their open-source versions.
