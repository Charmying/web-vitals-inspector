# Web Vitals Inspector

[English](./README.md) | **繁體中文**

[頁面功能說明](./docs/page-function-description/page-function-description.zh-TW.md) — 各頁面功能簡介

一款專業的桌面應用程式，用於大規模審計網站 SEO 與核心網頁指標 (Core Web Vitals)。基於 Electron 構建，可自動爬取整個網站、對每個頁面執行 Lighthouse 分析，並匯出一份完整的多工作表 Excel 報告——提供簡潔的雙語 UI。

---

## 📥 程式下載

每次打上 semver tag 後，GitHub Actions 會自動編譯並發布安裝檔。
點擊下方按鈕即可前往最新 Release 下載：

| 平台 | 下載 |
| :---: | :---: |
| Windows | [![Windows](https://img.shields.io/badge/下載-Windows-0078D4?style=for-the-badge&logo=windows)](https://github.com/Charmying/web-vitals-inspector/releases/latest) |
| macOS (Apple Silicon) | [![macOS arm64](https://img.shields.io/badge/下載-macOS_arm64-000000?style=for-the-badge&logo=apple)](https://github.com/Charmying/web-vitals-inspector/releases/latest) |
| macOS (Intel) | [![macOS x64](https://img.shields.io/badge/下載-macOS_x64-000000?style=for-the-badge&logo=apple)](https://github.com/Charmying/web-vitals-inspector/releases/latest) |

### **💡 安裝提示**
- **Windows:** 若出現 SmartScreen 警告，請點擊 **「其他資訊」→「仍要執行」**。
- **macOS:** 下載後將 App 拖移至 **Applications** 資料夾。若提示「無法驗證開發者」，請至
  **系統設定 → 安全性與隱私權** 點擊 **「仍要開啟」**。

---

## 功能特色

- **3 種輸入模式** — 爬取整個網站、分析單一 URL，或匯入自訂 URL 清單 (`.txt`)
- **智慧爬蟲** — 透過 Sitemap、Wayback Machine 和 Puppeteer 遞迴爬取發現 URL，並自動過濾雜訊參數去重
- **Lighthouse 審計** — 透過 Lighthouse CLI 執行效能、無障礙、最佳實踐及 SEO 四大類別審計，內建重試機制
- **元資料擷取** — 基於 Puppeteer 擷取標題、Meta 描述、Canonical、OG 標籤、標題結構、圖片、hreflang、Schema 等資訊
- **6 工作表 Excel 報告** — URL 狀態、執行摘要、主要問題、問題明細、頁面資料、名詞解釋
- **雙語支援** — UI 與報告皆支援中文與英文
- **深色 / 淺色主題** — 主題偏好持久化儲存
- **記憶體安全架構** — Chrome Pool 精確維護 3 個 Chrome 實例，每 25 次分析後強制回收進程樹，徹底防止 300+ URL 執行時當機
- **支援 1000+ URL** — 大批次分析會自動分段執行 (預設每段 200 URLs)，並在段落間觸發 GC，確保長時間任務穩定

---

## 快速開始

### 環境需求

| 工具 | 版本 |
|------|------|
| Node.js | >= 18.17.0 |
| npm | >= 9.0.0 |
| Git | >= 2.0.0 |

### 安裝與執行

```bash
# Clone 專案
git clone https://github.com/web-vitals-inspector/web-vitals-inspector.git
cd web-vitals-inspector

# 安裝依賴 (同時下載 Electron 執行檔)
npm install

# 以開發模式啟動
npm run dev
```

### 打包發布

```bash
npm run build:win     # Windows 安裝程式 (.exe)
npm run build:mac     # macOS 磁碟映像 (.dmg，需在 macOS 主機執行)
npm run build:linux   # AppImage / deb / snap
```

平台說明：
- `build:mac` 只能在 macOS 執行 (Electron Builder 限制)。
- `build:win` 已在 Windows 與 CI 驗證可用。
- 若要一次產出跨平台可下載安裝檔，請使用下方 release workflow。

---

## 文件

| 文件 | English | 繁體中文 |
|------|---------|---------|
| 專案架構說明 | [STRUCTURE.md](./docs/STRUCTURE.md) | [STRUCTURE.zh-TW.md](./docs/STRUCTURE.zh-TW.md) |
| 開發指南 | [DEVELOPMENT.md](./docs/DEVELOPMENT.md) | [DEVELOPMENT.zh-TW.md](./docs/DEVELOPMENT.zh-TW.md) |
| 依賴套件參考 | [DEPENDENCIES.md](./docs/DEPENDENCIES.md) | [DEPENDENCIES.zh-TW.md](./docs/DEPENDENCIES.zh-TW.md) |

---

## 技術棧

| 層級 | 技術 |
|------|-----|
| 桌面殼層 | Electron |
| 建置工具 | electron-vite |
| UI 框架 | React 19 |
| 程式語言 | TypeScript |
| 樣式 | Tailwind CSS v4 |
| 網頁爬取 | Puppeteer |
| 效能審計 | Lighthouse CLI |
| 報告產生 | ExcelJS |
| HTTP 請求 | Axios |

---

## CI / CD

專案包含兩個 GitHub Actions 工作流程：

| 工作流程 | 觸發條件 | 用途 |
|----------|---------|------|
| `ci.yml` | 推送或 PR 至 `main`、`develop` | TypeScript 型別檢查 + ESLint |
| `release.yml` | 推送 semver tag `v*.*.*` | 編譯 Win + macOS (x64 & arm64) 並發布 GitHub Release |
| `verification.yml` | 手動觸發 | 在 macOS 主機執行 `build:mac` + DMG 可安裝性驗證，並執行 Windows 300+ URL 壓測 |

發布新版本只需打 tag：

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions 會自動為所有平台編譯安裝檔並附加至新的 GitHub Release。

手動備援 (不推 tag 也可發版)：
- 到 Actions 執行 `Build and Release`，輸入 `version` (例如 `1.2.3`)。

完整驗證流程 (手動)：
- 到 Actions 執行 `Verification`，會自動跑：
- macOS 主機實跑 `npm run build:mac` + DMG 掛載/簽章檢查
- Windows 320 URL 分析壓測，並上傳報告 artifact

本機 300+ 壓測 (Windows)：
```bash
# 終端 A
npm run stress:mock-site

# 終端 B
npm run stress:prepare-urls
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-320
```

本機 1000+ 壓測 (建議，含續跑)：
```bash
# 終端 A
npm run stress:mock-site

# 終端 B
npm run stress:prepare-urls -- --count=1200
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200

# 若中斷，可從 checkpoint 續跑
npm run stress:analyzer:resume -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200
```

說明：
- 每個分段完成後會寫入 checkpoint：`reports/stress/<label>.checkpoint.json`。
- 續跑模式只會略過已成功產生 Lighthouse 結果的 URL。
- `npm run stress:mock-site` 現在會提供動態 `/page/<n>` 路由，因此 1000+ 產生 URL 不會再溢出舊的 360 頁測試夾具。
- 可在 `Verification` workflow 輸入 `stress_url_count` (例如 `1200`) 驗證大流量場景。
