# 依賴套件參考

[English](./DEPENDENCIES.md) | **繁體中文**

本文件說明專案中使用的所有 npm 套件，包含其用途、選擇理由和考慮過的替代方案。

---

## 目錄

- [執行時期依賴](#執行時期依賴)
- [開發時期依賴](#開發時期依賴)
- [依賴關係圖](#依賴關係圖)

---

## 執行時期依賴

這些套件包含在生產建置中，或在 Electron 主程序執行時期需要。

---

### Electron

| 項目 | 內容 |
|------|------|
| **套件** | `electron` |
| **版本** | `^39.2.6` |
| **環境** | devDependency (但為應用程式核心) |
| **用途** | 跨平台桌面應用程式殼層 |
| **為什麼選擇** | • Node.js 桌面應用程式的業界標準 <br> • 提供原生檔案對話框、OS 整合和自動更新 <br> • 執行 Puppeteer 和以子程序啟動 Lighthouse 所需 <br> • 透過 `@electron-toolkit` 提供優秀的 TypeScript 支援 |
| **替代方案** | • Tauri — 更輕量且使用 Rust，但後端無 Node.js 執行環境 <br> • NW.js — 較舊，社群較小 <br> • neutralinojs — 非常輕量但原生 API 有限 |

---

### Puppeteer

| 項目 | 內容 |
|------|------|
| **套件** | `puppeteer` |
| **版本** | `^24.40.0` |
| **環境** | `dependencies` |
| **用途** | 無頭 Chromium 瀏覽器，用於 URL 爬取和 SEO 元資料擷取 |
| **為什麼選擇** | • 完整的瀏覽器自動化——可處理 JavaScript 渲染的頁面 <br> • 可擷取動態內容 (SPA 渲染的元資料、Schema) <br> • 使用 DOM 選擇器進行可靠的登入牆偵測 <br> • 相同的 Chromium 實例可在並行頁面分析中共享 |
| **替代方案** | • Playwright — 更強大但體積更大，設定更複雜 <br> • Cheerio + Axios — 更快但只能處理伺服器渲染的 HTML，無法擷取 JS 渲染的內容 <br> • jsdom — 非真實瀏覽器環境，對現代網站不可靠 |
| **主要用途** | • `crawler.ts` — 遞迴連結擷取、搜尋引擎擷取 <br> • `analyzer.ts` — 逐頁元資料擷取 (標題、描述、OG 標籤等) |

---

### Lighthouse

| 項目 | 內容 |
|------|------|
| **套件** | `lighthouse` |
| **版本** | `^13.1.0` |
| **環境** | `dependencies` |
| **用途** | 自動化效能、無障礙、最佳實踐和 SEO 審計 |
| **為什麼選擇** | • Google 的官方審計工具——業界標準分數 <br> • 同時審計 4 個類別（效能、無障礙、最佳實踐、SEO） <br> • 測量核心網頁指標（LCP、CLS、TBT、FCP、Speed Index） <br> • 維護良好，CLI 介面穩定 |
| **替代方案** | • WebPageTest — 雲端服務，無法離線使用 <br> • axe-core — 僅限無障礙，無效能指標 <br> • 自訂 Puppeteer 檢查 — 需手動重新實現數百個審計項目 |
| **主要用途** | `analyzer.ts` — 以 CLI 子程序啟動；將 JSON 輸出解析為 `LhrSlim` |
| **注意** | Lighthouse 以**子程序**方式執行（非 Node.js API），以將其 Chrome 實例與 Electron 主程序隔離 |

---

### ExcelJS

| 項目 | 內容 |
|------|------|
| **套件** | `exceljs` |
| **版本** | `^4.4.0` |
| **環境** | `dependencies` |
| **用途** | 產生已樣式化的多工作表 Excel 工作簿（`.xlsx`） |
| **為什麼選擇** | • 完全控制儲存格格式：字型、顏色、邊框、填充、對齊 <br> • 單一工作簿中可有多個工作表 <br> • 無外部依賴——純 JavaScript <br> • 積極維護，TypeScript 型別定義良好 |
| **替代方案** | • SheetJS (xlsx) — 開源社群版缺少樣式 API <br> • node-xlsx — 非常基本，無樣式控制 <br> • csv-writer — 僅限 CSV，無 Excel 格式 |
| **主要用途** | `report-generator.ts` — 建立含有樣式標頭和條件性儲存格顏色的 6 工作表 `.xlsx` 工作簿 |

---

### Axios

| 項目 | 內容 |
|------|------|
| **套件** | `axios` |
| **版本** | `^1.15.0` |
| **環境** | `dependencies` |
| **用途** | HTTP 客戶端，用於擷取 Sitemap、robots.txt 和 Wayback Machine 資料 |
| **為什麼選擇** | • 簡潔的基於 Promise 的 API，可設定逾時 <br> • 自動回應解析（XML / JSON / text） <br> • 比原生 `fetch` 在 Node.js 使用情境下有更好的錯誤處理 <br> • 跨回應型別的一致 API |
| **替代方案** | • Node.js `fetch`（原生）— Node 18 起可用，但某些人體工學功能缺乏 <br> • `node-fetch` — 已棄用，改用原生 fetch <br> • `got` — 功能豐富但 API 介面比所需更大 |
| **主要用途** | `crawler.ts` — 擷取 Sitemap XML、Wayback Machine CDX API、robots.txt |

---

### @electron-toolkit/preload

| 項目 | 內容 |
|------|------|
| **套件** | `@electron-toolkit/preload` |
| **版本** | `^3.0.2` |
| **環境** | `dependencies` |
| **用途** | Electron preload 腳本的工具輔助函式 |
| **為什麼選擇** | • `electron-toolkit` 生態系的一部分（由 electron-vite 使用） <br> • 為標準 Electron renderer 工具提供 `electronAPI` <br> • 減少 preload 腳本的樣板程式碼 |

---

### @electron-toolkit/utils

| 項目 | 內容 |
|------|------|
| **套件** | `@electron-toolkit/utils` |
| **版本** | `^4.0.0` |
| **環境** | `dependencies` |
| **用途** | Electron 主程序的工具函式 |
| **為什麼選擇** | • `is.dev` 旗標可整潔地偵測開發模式 <br> • `electronApp.setAppUserModelId` 用於 Windows 工作列行為 <br> • `optimizer.watchWindowShortcuts` 用於開發捷徑（F12 等） |

---

## 開發時期依賴

這些套件僅在開發、型別檢查和建置期間使用。

---

### electron-vite

| 項目 | 內容 |
|------|------|
| **套件** | `electron-vite` |
| **版本** | `^5.0.0` |
| **用途** | 包裝 Vite 以處理 Electron 三個程序的建置工具 |
| **為什麼選擇** | • 單一設定處理 main、preload 和 renderer <br> • 開發期間為 renderer 提供 HMR <br> • 正確處理 Electron 內建模組的 `externals` <br> • electron-toolkit 生態系官方推薦的建置工具 |
| **替代方案** | • 不使用 electron-vite 的 Vite — 需要手動多設定檔設定 <br> • webpack + electron-webpack — 更繁瑣的設定 <br> • 直接使用 Rollup — 無 HMR，更多手動工作 |
| **關鍵設定** | `electron.vite.config.ts` — 外部套件（`puppeteer`、`lighthouse`、`exceljs`、`axios`）從主程序打包中排除 |

---

### electron-builder

| 項目 | 內容 |
|------|------|
| **套件** | `electron-builder` |
| **版本** | `^26.0.12` |
| **用途** | 跨平台 Electron 應用程式打包和發布 |
| **為什麼選擇** | • 為 Windows（NSIS）、macOS（DMG）和 Linux（AppImage/deb/snap）產生安裝程式 <br> • 使用 `asar: false` 讓 `node_modules/.bin/lighthouse` 保持可執行的真實檔案，可在執行時以子程序方式啟動 <br> • `extraResources` 將本地的 `.puppeteer-cache/` Chromium 打包進 App <br> • 支援 macOS 公證的程式碼簽署 <br> • 透過 `publish` 設定提供自動更新基礎設施 |
| **替代方案** | • Forge — 更簡單但打包選項較少 <br> • Squirrel — 僅限 Windows |

---

### React & React DOM

| 項目 | 內容 |
|------|------|
| **套件** | `react`, `react-dom` |
| **版本** | `^19.2.1` |
| **用途** | renderer 程序的 UI 函式庫 |
| **為什麼選擇** | • React 19 含並行功能 <br> • 龐大的生態系 <br> • 優秀的 TypeScript 支援 <br> • 成熟的元件模型，適合步驟式工作流程 UI |
| **替代方案** | • Vue — 不同的思維模式，Electron 生態系較小 <br> • Svelte — 更輕量但工具生態系較小 <br> • 原生 JS — 簡單 UI 可行但難以大規模維護 |

---

### TypeScript

| 項目 | 內容 |
|------|------|
| **套件** | `typescript` |
| **版本** | `^5.9.3` |
| **用途** | 所有原始碼的有型別 JavaScript 超集 |
| **為什麼選擇** | • 在編譯時期捕捉 Electron 程序間的型別不匹配 <br> • VS Code 中的自動補全和重構 <br> • 啟用嚴格模式以獲得最大安全性 <br> • 三種個別的 `tsconfig` 分別對應三種 Electron 程序類型 |
| **關鍵設定** | • 所有設定中的 `strict: true` <br> • `tsconfig.node.json` — main + preload（Node.js 型別） <br> • `tsconfig.web.json` — renderer（瀏覽器型別 + React JSX） |

---

### Tailwind CSS v4

| 項目 | 內容 |
|------|------|
| **套件** | `tailwindcss`, `@tailwindcss/postcss` |
| **版本** | `^4.2.2` |
| **用途** | renderer UI 的工具優先 CSS 框架 |
| **為什麼選擇** | • 使用一致設計代幣快速開發 UI <br> • v4 速度顯著更快（不需要 `tailwind.config.js`） <br> • 透過 `dark:` 變體和 `class` 策略提供優秀的深色模式支援 <br> • 透過 tree-shaking 產生極小的生產 CSS |
| **替代方案** | • CSS Modules — 更明確但迭代更慢 <br> • styled-components — 有執行時期開銷 <br> • UnoCSS — 更快但生態系較小 |
| **v4 注意事項** | 使用 `@tailwindcss/postcss` 作為 PostCSS 外掛。設定透過 CSS `@theme` 指令完成，而非 `tailwind.config.js` |

---

### ESLint

| 項目 | 內容 |
|------|------|
| **套件** | `eslint`、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-react-refresh` |
| **版本** | `^9.39.1` |
| **用途** | JavaScript 和 TypeScript 的靜態程式碼分析 |
| **為什麼選擇** | • ESLint 9 扁平設定格式——更簡單更快速 <br> • React hooks 規則捕捉常見錯誤（`react-hooks/rules-of-hooks`、`react-hooks/exhaustive-deps`） <br> • `react-refresh` 外掛防止開發中的 HMR 問題 <br> • `@electron-toolkit/eslint-config-ts` 提供適用於 Electron 情境的正確規則 |
| **設定** | 根目錄的 `eslint.config.mjs` |

---

### Vite

| 項目 | 內容 |
|------|------|
| **套件** | `vite` |
| **版本** | `^7.2.6` |
| **用途** | electron-vite 使用的底層建置引擎 |
| **注意** | 不直接設定——所有設定透過 `electron.vite.config.ts` 進行 |

---

### @vitejs/plugin-react

| 項目 | 內容 |
|------|------|
| **套件** | `@vitejs/plugin-react` |
| **版本** | `^5.1.1` |
| **用途** | 為 renderer 啟用 React Fast Refresh 和 JSX 轉換的 Vite 外掛 |
| **為什麼選擇** | Vite 的官方 React 外掛——處理基於 Babel 的 JSX 轉換和 HMR |

---

### autoprefixer

| 項目 | 內容 |
|------|------|
| **套件** | `autoprefixer` |
| **版本** | `^10.4.27` |
| **用途** | 自動為 CSS 規則添加瀏覽器供應商前綴的 PostCSS 外掛 |
| **為什麼選擇** | Tailwind CSS 的標準搭檔；無需手動新增前綴即可確保跨瀏覽器的 CSS 相容性 |

---

## 依賴關係圖

```
應用程式執行時期
├── electron                        ← 桌面殼層
│   ├── @electron-toolkit/preload
│   └── @electron-toolkit/utils
├── puppeteer                       ← 無頭瀏覽器
│   └── (內建 Chromium)
├── lighthouse                      ← 網頁審計（以子程序啟動）
│   └── (需要 Chrome)
├── exceljs                         ← 報告產生
└── axios                           ← HTTP 請求

UI（renderer 程序）
├── react
├── react-dom
└── tailwindcss（僅建置時期）

建置工具鏈
├── electron-vite
│   └── vite
│       ├── @vitejs/plugin-react
│       └── @tailwindcss/postcss
│           └── autoprefixer
└── electron-builder

型別系統與 Linting
├── typescript
│   ├── @electron-toolkit/tsconfig
│   ├── @types/node
│   ├── @types/react
│   └── @types/react-dom
└── eslint
    ├── @electron-toolkit/eslint-config-ts
    ├── eslint-plugin-react
    ├── eslint-plugin-react-hooks
    └── eslint-plugin-react-refresh
```
