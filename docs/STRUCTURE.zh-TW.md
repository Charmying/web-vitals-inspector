# 專案架構說明

[English](./STRUCTURE.md) | **繁體中文**

本文件說明專案的資料夾結構、命名規則，以及背後的設計決策。

---

## 目錄

- [整體架構](#整體架構)
- [核心目錄說明](#核心目錄說明)
- [SEO 分析流程](#seo-分析流程)
- [IPC 通訊模型](#ipc-通訊模型)
- [命名規則](#命名規則)
- [設計決策](#設計決策)

---

## 整體架構

```
web-vitals-inspector/
├── docs/                               # 專案文件
├── build/                              # Electron 建置資源
│   └── entitlements.mac.plist          # macOS 沙箱權限設定
├── resources/                          # 應用程式靜態資源（圖示等）
├── src/
│   ├── main/                           # Electron 主程序
│   │   ├── index.ts                    # 應用程式進入點 — 視窗建立與生命週期
│   │   ├── ipc-handlers.ts             # 所有 IPC 頻道處理器
│   │   └── seo/                        # SEO 分析流程
│   │       ├── analyzer.ts             # Lighthouse + Puppeteer 元資料擷取
│   │       ├── crawler.ts              # URL 探索與去重
│   │       ├── i18n.ts                 # 雙語報告內容
│   │       ├── report-generator.ts     # Excel 報告產生器（6 個工作表）
│   │       └── types.ts                # 共用 TypeScript 型別定義
│   ├── preload/
│   │   ├── index.ts                    # Context Bridge — 向 renderer 暴露 API
│   │   └── index.d.ts                  # window.api 的 TypeScript 型別宣告
│   └── renderer/
│       ├── index.html                  # HTML 進入點
│       └── src/
│           ├── App.tsx                 # 根元件 — 步驟式工作流程
│           ├── main.tsx                # React 進入點
│           ├── env.d.ts                # 環境型別宣告
│           ├── components/
│           │   ├── ThemeToggle.tsx     # 深色/淺色主題切換按鈕
│           │   └── HelpModal.tsx       # 應用程式內建說明對話框
│           ├── hooks/
│           │   └── useTheme.ts         # 主題管理 Custom Hook
│           ├── i18n/
│           │   └── index.ts            # UI 翻譯字串（中文 / 英文）
│           └── styles/                 # 全域 CSS 樣式
├── electron-builder.yml                # 發布打包設定（asar: false，內包 Chrome）
├── .puppeteerrc.cjs                    # 指定 Puppeteer 將 Chrome 快取到 .puppeteer-cache/
├── .puppeteer-cache/                   # 本地 Chromium 下載目錄（gitignore 排除；執行 npm install 後時建置）
├── electron.vite.config.ts             # 三個程序共用的 Vite 建置設定
├── package.json
├── tsconfig.json                       # 基礎 TypeScript 設定
├── tsconfig.node.json                  # 主程序 + preload 的 tsconfig
├── tsconfig.web.json                   # renderer 的 tsconfig
└── README.md
```

---

## 核心目錄說明

### `/src/main` — Electron 主程序

**職責：** Node.js 環境；所有需要特權的操作都在此執行——檔案系統存取、子程序啟動、原生對話框，以及透過 Puppeteer 進行網頁瀏覽。

**為什麼這樣設計：**
- Electron 的安全模型要求所有系統層級的工作都留在主程序
- 主程序不接觸 DOM；所有 UI 更新透過 IPC 事件傳送到 renderer

---

#### `index.ts` — 應用程式進入點

建立 `BrowserWindow`、設定帶有 preload 腳本的 `webPreferences`，並在 app ready 時註冊所有 IPC 處理器。

關鍵決策：
- `autoHideMenuBar: true` — 保持 UI 簡潔；按 `Alt` 鍵可顯示選單列
- `sandbox: false` — preload 腳本需要 `require()` 才能使用 IPC
- 外部連結透過 `shell.openExternal` 在預設瀏覽器中開啟，而非在 Electron 內部

---

#### `ipc-handlers.ts` — IPC 頻道登錄中心

**職責：** 定義並註冊每個 `ipcMain.handle` 頻道。作為 renderer 與主程序之間所有通訊的單一控制點。

**頻道一覽：**

| 頻道 | 方向 | 說明 |
|------|------|------|
| `seo:start-crawl` | Renderer → Main | 爬取網站並回傳發現的 URL |
| `seo:parse-urls-file` | Renderer → Main | 開啟原生檔案對話框並解析 `.txt` URL 清單 |
| `seo:start-analysis` | Renderer → Main | 對 URL 清單執行 Lighthouse + Puppeteer |
| `seo:save-report` | Renderer → Main | 開啟儲存對話框並寫入 `.xlsx` 檔案 |
| `seo:download-urls` | Renderer → Main | 將爬取的 URL 清單儲存為 `.txt` |
| `seo:abort` | Renderer → Main | 發出中止目前操作的訊號 |
| `seo:progress` | Main → Renderer | 爬取/分析期間的即時進度事件 |

**共用狀態：**
模組層級變數（`lastCrawlUrlStatus`、`lastAnalysisResults` 等）在多步驟工作流程中累積資料。這避免了透過 IPC 來回傳送大型資料的需要。

---

### `/src/main/seo` — SEO 分析流程

核心業務邏輯分成四個職責明確的模組：

---

#### `types.ts` — 共用型別定義

整個流程中所有資料結構的唯一來源。主要型別：

| 型別 | 說明 |
|------|------|
| `CrawlResult` | URL 探索的輸出：`seoUrls`、`allUrls`、`urlStatusData` |
| `UrlStatusEntry` | 每個 URL 的 HTTP 狀態、重新導向目標和分類標籤 |
| `AnalysisResult` | 組合輸出：Lighthouse `lhr`、Puppeteer `meta` 和 `tech` 檢查 |
| `LhrSlim` | 完整 Lighthouse 報告的輕量子集 |
| `SeoMeta` | 從頁面擷取的完整 SEO 元資料 |
| `TechChecks` | HTTPS、robots.txt 和 Sitemap 可用性旗標 |
| `Locale` | `'en' | 'zh'` — 控制報告語言 |

---

#### `crawler.ts` — URL 探索

**職責：** 探索指定根網域的所有可爬取 URL，將其分類為 SEO 相關、檢查 HTTP 狀態，並回傳去重後的清單。

**探索來源（依序）：**
1. `robots.txt` → 連結的 Sitemap
2. XML Sitemap 候選路徑（`/sitemap.xml`、`/sitemap_index.xml` 等）
3. Wayback Machine CDX API（歷史 URL 快照）
4. 搜尋引擎查詢（Google/Bing `site:` 運算子，透過 Puppeteer 擷取）
5. Puppeteer 遞迴連結擷取（從隊列中的所有頁面）

**URL 過濾：**
- 使用 `ParamAnalyzer` 去除雜訊查詢參數（UTM、追蹤 ID、Session Token）
- 保留有意義的參數（`category`、`page`、`id`、`slug` 等）
- 排除靜態資源、管理路徑、驗證路徑、API 端點和 WordPress 內部路徑
- 偵測並跳過登入牆，避免爬取需要認證的內容

**輸出：**
- `seoUrls` — 適合 Lighthouse 審計的頁面（HTML，非資源/管理員頁面）
- `allUrls` — 每個發現的 URL，包含非 HTML 內容

---

#### `analyzer.ts` — Lighthouse 與 Puppeteer 分析

**職責：** 對每個 URL 執行 Lighthouse CLI 審計，並透過 Puppeteer 擷取 SEO 元資料，然後合併結果。

**Lighthouse 執行：**
- 以子程序方式啟動 Lighthouse（非 Node.js API），實現程序隔離
- 將 JSON 輸出寫入暫存檔，解析後清理
- 失敗時最多重試 2 次，間隔 3 秒
- 設定 headless Chrome 使用 `--no-sandbox` 和 `--disable-gpu`，相容伺服器環境

**Puppeteer 元資料擷取（`getSEOData`）：**
- 每頁擷取 20+ 個元資料欄位（標題、描述、Canonical、OG 標籤、hreflang、Schema 類型等）
- 使用共享瀏覽器實例並行執行
- 設有 60 秒頁面超時，可優雅處理慢速網站

**技術檢查（`getTechChecks`）：**
- HTTPS — 檢查 `location.protocol`
- `robots.txt` — 透過 axios 驗證 HTTP 200，無封鎖
- Sitemap — 檢查常見 Sitemap 候選 URL

---

#### `report-generator.ts` — Excel 報告

**職責：** 使用 ExcelJS 將所有分析資料組裝成含有 6 個工作表的 `.xlsx` 工作簿。

**工作表一覽：**

| # | 工作表 | 內容 |
|---|--------|------|
| 1 | URL 狀態 | 每個爬取的 URL，含 HTTP 狀態碼、重新導向目標和分類標籤 |
| 2 | 執行摘要 | 單頁概覽：總數、P0–P3 問題數、平均分數、前 5 大問題 |
| 3 | 主要問題 | 彙整問題頻率表（≤ 20 列），含商業影響說明 |
| 4 | 問題明細 | 完整的逐頁問題清單，含優先級（P0–P3）和解決方案建議 |
| 5 | 頁面資料 | 完整的逐頁資料：所有 Lighthouse 分數、CWV 指標和 SEO 欄位 |
| 6 | 名詞解釋 | 所有欄位名稱、指標和優先級定義的說明 |

**優先級分類：**

| 優先級 | 類別 | 範例 |
|--------|------|------|
| P0 | 索引問題 | 無 HTTPS、noindex 指令、缺少 Canonical |
| P1 | 技術問題 | 效能分數過低、robots.txt/Sitemap 失效 |
| P2 | 頁面問題 | 缺少標題/描述/H1、內容稀薄、Meta 重複 |
| P3 | 進階優化 | 缺少 Schema 標記、缺少 hreflang |

---

#### `i18n.ts` — 報告翻譯

**職責：** 提供 Excel 報告的所有雙語字串內容——工作表名稱、欄位標頭、標籤、解決方案文字、詞彙表條目等。

所有匯出函式接受 `Locale` 參數（`'en'` 或 `'zh'`）並回傳對應字串。這讓報告產生器保持整潔，不含內聯翻譯邏輯。

---

### `/src/preload` — Context Bridge

**職責：** 透過 Electron 的 `contextBridge`，安全地將有型別的 `window.api` 物件暴露給 renderer 程序。

**為什麼這樣設計：**
- `contextBridge` 防止 renderer 程式碼直接存取 Node.js API
- API 介面刻意保持最小化——只有 UI 實際需要的 7 個頻道
- `onProgress` 函式回傳清理函式，正確移除 IPC 監聽器，防止記憶體洩漏

**暴露的 API：**

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

### `/src/renderer` — React 前端

**職責：** 可見的應用程式 UI。在 Chromium renderer 程序中執行，無法直接存取 Node.js。

---

#### `App.tsx` — 步驟式工作流程

整個應用程式 UI 是一個單一元件，引導使用者完成線性 5 步驟工作流程：

```
input → urls → settings → running → done
```

| 步驟 | 說明 |
|------|------|
| `input` | 選擇分析模式（爬取/單一/上傳）並輸入根 URL |
| `urls` | 檢視發現的 URL、下載清單、確認選擇 |
| `settings` | 選擇報告語言（中/英）並檢視分析摘要 |
| `running` | 含中止功能的即時進度日誌 |
| `done` | 儲存報告按鈕、結果摘要、工作表內容指南 |

**狀態管理：** 所有狀態透過 `useState` 存放在 `App.tsx` 中。不使用外部狀態管理函式庫——工作流程簡單且線性，將狀態提升至根元件是正確選擇。

---

#### `components/ThemeToggle.tsx`

單一按鈕元件，呼叫 `useTheme().toggle()`。根據目前主題渲染太陽/月亮圖示。

---

#### `components/HelpModal.tsx`

使用者點擊說明按鈕時顯示的覆蓋式對話框。說明 3 種輸入模式和 `.txt` 檔案格式。透過 `t()` 輔助函式完整翻譯。

---

#### `hooks/useTheme.ts`

Custom Hook，功能如下：
1. 從 `localStorage` 讀取初始主題（以 `prefers-color-scheme` 為備用）
2. 主題變更時在 `<html>` 上套用 `dark` class
3. 將選擇以 `wvi-theme` 為鍵持久化到 `localStorage`

---

#### `i18n/index.ts`

所有 UI 字串的簡易鍵/值翻譯儲存。支援 `'en'` 和 `'zh'` 語系。不使用外部 i18n 函式庫——UI 字串集小且穩定，使用普通物件已足夠。

---

## SEO 分析流程

完整的端對端流程：

```
使用者輸入
    │
    ▼
[爬蟲模組]
    ├── 讀取 robots.txt → 解析 Sitemap URL
    ├── 讀取 XML Sitemap 候選路徑
    ├── 查詢 Wayback Machine CDX API
    ├── 擷取搜尋引擎「site:」結果
    └── Puppeteer 遞迴連結擷取
    │
    ▼
URL 去重與過濾
    ├── 去除雜訊參數（UTM、追蹤 Token）
    ├── 保留有意義的參數（category、page、id、slug）
    ├── 排除資源、管理路徑、驗證路徑、API 端點
    └── 檢查每個 URL 的 HTTP 狀態
    │
    ▼
[分析器模組] — 每個 URL 並行批次處理
    ├── Lighthouse CLI 子程序 → LhrSlim
    └── Puppeteer 頁面評估 → SeoMeta + TechChecks
    │
    ▼
[報告產生器]
    └── ExcelJS 工作簿 → 6 工作表 .xlsx 檔案
```

---

## IPC 通訊模型

```
Renderer（React）
    │  window.api.startCrawl(url)
    │  window.api.onProgress(callback)      ◄─── seo:progress 事件
    ▼
Preload（Context Bridge）
    │  ipcRenderer.invoke / ipcRenderer.on
    ▼
主程序（ipc-handlers.ts）
    │
    ├── crawlUrls()                 [crawler.ts]
    ├── analyzeUrls()               [analyzer.ts]
    └── generateExcelReport()       [report-generator.ts]
```

Renderer 從不接觸檔案系統或啟動程序。所有特權工作在 `ipc-handlers.ts` 中處理，並委派給 SEO 流程模組。

---

## 命名規則

### 檔案
- **主程序 & preload：** kebab-case（`ipc-handlers.ts`、`report-generator.ts`）
- **React 元件：** PascalCase（`ThemeToggle.tsx`、`HelpModal.tsx`）
- **Hooks：** camelCase 加 `use` 前綴（`useTheme.ts`）
- **工具 / 模組：** kebab-case（`report-generator.ts`、`types.ts`）

### TypeScript
- **介面 & 型別：** PascalCase（`AnalysisResult`、`SeoMeta`）
- **聯合型別：** PascalCase（`Locale`、`UILocale`、`Mode`、`Step`）
- **常數：** SCREAMING_SNAKE_CASE（`EXCLUDE_EXTENSIONS`、`NOISE_PARAMS`、`LH_RETRY`）
- **函式：** camelCase（`analyzeUrls`、`generateExcelReport`）

---

## 設計決策

### 為什麼選擇 Electron？
此應用程式需要執行 Puppeteer（完整的 Chromium 實例）並將 Lighthouse 作為子程序啟動——這些操作在瀏覽器或簡單的 CLI 工具中無法實現。Electron 提供了正確的環境：原生檔案對話框、檔案系統存取，以及精緻的跨平台桌面體驗。

### 為什麼選擇 electron-vite？
`electron-vite` 包裝 Vite 以單一設定檔處理 Electron 的三種程序類型（main、preload、renderer）。開發期間為 renderer 提供快速的 HMR，無需自訂 webpack 設定。

### 為什麼使用 Lighthouse CLI 而非 Node.js API？
以子程序方式執行 Lighthouse 將其沉重的 Chrome 實例與 Electron 主程序隔離。這防止了記憶體衝突，並允許使用者中止時主程序可乾淨地終止 Lighthouse 程序。

### 為什麼不使用 Redux / Zustand？
應用程式工作流程是簡單的線性狀態機（5 個步驟）。所有狀態存放在 `App.tsx` 中。對於如此精簡的流程，引入狀態管理函式庫只會增加不必要的複雜度。

### 為什麼選擇 ExcelJS？
ExcelJS 提供對儲存格格式、顏色、邊框、欄寬和多個工作表的完全控制——這些都是樣式化專業報告格式所必需的。開源版本的 `xlsx` / `SheetJS` 等函式庫的樣式 API 較為薄弱。
