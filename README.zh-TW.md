# Web Vitals Inspector

[English](./README.md) | **繁體中文**

[頁面功能說明](./docs/page-function-description/page-function-description.zh-TW.md) — 各頁面功能簡介

一款專業的桌面應用程式，用於大規模審計網站 SEO 與核心網頁指標 (Core Web Vitals)。基於 Electron 構建，可自動爬取整個網站、對每個頁面執行 Lighthouse 分析，並匯出一份完整的多工作表 Excel 報告——提供簡潔的雙語 UI。

---

## 📥 程式下載

我們為不同平台提供經過優化的穩定版本。點擊下方按鈕即可下載適合您系統的版本：

| Windows | macOS |
| :---: | :---: |
| [![Windows](https://img.shields.io/badge/下載-Windows-0078D4?style=for-the-badge)](https://github.com/web-vitals-inspector/web-vitals-inspector/releases/latest/download/web-vitals-inspector-windows.exe) | [![macOS](https://img.shields.io/badge/下載-macOS-000000?style=for-the-badge)](https://github.com/web-vitals-inspector/web-vitals-inspector/releases/latest/download/web-vitals-inspector-mac.dmg) |

### **💡 安裝提示：**
- **Windows:** 若出現 SmartScreen 警告，請點擊 **「其他資訊」** 並選擇 **「仍要執行」**。
- **macOS:** 下載後請將應用程式拖移至 **Applications** 檔案夾。若提示「無法驗證開發者」，請至 **系統設定 > 安全性與隱私權** 點擊 **「仍要開啟」** 以繞過檢查。

---

## 功能特色

- **3 種輸入模式** — 爬取整個網站、分析單一 URL，或匯入自訂 URL 清單 (`.txt`)
- **智慧爬蟲** — 透過 Sitemap、Wayback Machine 和 Puppeteer 遞迴爬取發現 URL，並自動過濾雜訊參數去重
- **Lighthouse 審計** — 透過 Lighthouse CLI 執行效能、無障礙、最佳實踐及 SEO 四大類別審計，內建重試機制
- **元資料擷取** — 基於 Puppeteer 擷取標題、Meta 描述、Canonical、OG 標籤、標題結構、圖片、hreflang、Schema 等資訊
- **6 工作表 Excel 報告** — URL 狀態、執行摘要、主要問題、問題明細、頁面資料、名詞解釋
- **雙語支援** — UI 與報告皆支援中文與英文
- **深色 / 淺色主題** — 主題偏好持久化儲存

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
npm run build:mac     # macOS 磁碟映像 (.dmg)
npm run build:linux   # AppImage / deb / snap
```

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
