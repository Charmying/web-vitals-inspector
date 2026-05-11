# 開發指南

[English](./DEVELOPMENT.md) | **繁體中文**

本文件說明專案的開發環境設定、開發規範與常見問題解決方案。

---

## 目錄

- [環境需求](#環境需求)
- [快速開始](#快速開始)
- [專案指令](#專案指令)
- [開發工作流](#開發工作流)
- [開發規範](#開發規範)
- [打包發布](#打包發布)
- [疑難排解](#疑難排解)

---

## 環境需求

### 必要環境

| 工具 | 版本 | 備註 |
|------|------|------|
| Node.js | >= 18.17.0 | Electron 39 所需 |
| npm | >= 9.0.0 | 與 Node.js 一起安裝 |
| Git | >= 2.0.0 | 版本控制 |

### VS Code 推薦擴充

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### 系統依賴

Puppeteer 在 `npm install` 時會自動下載 Chromium。在 Linux 上，可能需要額外的系統函式庫：

```bash
# Debian / Ubuntu
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libasound2
```

---

## 快速開始

### 1. Clone 專案

```bash
git clone <repository-url>
cd web-vitals-inspector
```

### 2. 安裝依賴

```bash
npm install
```

> 此步驟安裝所有套件，**並**透過 `postinstall` 觸發 `electron-builder install-app-deps`，下載平台原生 Electron 執行檔並重新建置原生模組。

### 3. 啟動開發模式

```bash
npm run dev
```

開發應用程式會自動啟動。使用 `electron-vite` 的 HMR：`src/renderer/` 的變更即時反映；`src/main/` 或 `src/preload/` 的變更需重新啟動開發指令。

### 4. 驗證環境

確認視窗開啟並具備：
- ✅ UI 以選擇的語言正常渲染
- ✅ 主題切換可在深色和淺色之間切換
- ✅ 說明對話框可正常開關
- ✅ URL 輸入框和模式選擇器可正常互動

---

## 專案指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 以開發模式啟動 Electron 應用程式 (含 HMR) |
| `npm run build` | 執行型別檢查，然後建置三個程序 (main、preload、renderer) |
| `npm run typecheck` | 對 `node` 和 `web` 設定執行 `tsc --noEmit` |
| `npm run typecheck:node` | 型別檢查主程序 + preload |
| `npm run typecheck:web` | 型別檢查 renderer |
| `npm run lint` | 對整個專案執行 ESLint |
| `npm run start` | 預覽上次的生產建置 |
| `npm run build:unpack` | 建置並解壓縮 (不打包，方便除錯) |
| `npm run build:win` | 建置 Windows 安裝程式 (`.exe` NSIS 安裝包) |
| `npm run build:mac` | 建置 macOS 磁碟映像 (`.dmg`，需 macOS 主機) |
| `npm run build:linux` | 建置 Linux 套件 (AppImage、snap、deb) |
| `npm run stress:mock-site` | 啟動本機壓測用 mock 網站 |
| `npm run stress:prepare-urls` | 產生 320 個本機 URL (符合 300+ 壓測) |
| `npm run stress:prepare-urls:1200` | 產生 1200 個本機 URL (高流量穩定性壓測) |
| `npm run stress:analyzer -- --urls-file=...` | 執行分析器壓測模式並輸出 JSON/Markdown 報告 |
| `npm run stress:analyzer:resume -- --urls-file=...` | 壓測中斷後從 checkpoint 續跑 |

---

## 開發工作流

### 日常流程

```bash
# 1. 拉取最新變更
git pull origin main

# 2. 安裝新的依賴 (如果有)
npm install

# 3. 啟動開發
npm run dev

# 4. 完成後，提交前執行 lint
npm run lint

# 5. 型別檢查
npm run typecheck

# 6. 提交
git add .
git commit -m "feature: 描述變更內容"
git push
```

### Git 分支策略

```
main                    # 生產就緒的程式碼
  ├─ feature/xxx        # 新功能開發
  ├─ fix/xxx            # 錯誤修復
  └─ docs/xxx           # 文件更新
```

### Commit 訊息規範

格式：`<type>: <description>`

| 類型 | 適用時機 |
|------|---------|
| `feature` | 新功能或增強 |
| `fix` | 錯誤修復 |
| `docs` | 僅文件變更 |
| `refactor` | 非功能性或修復性的程式碼變更 |
| `style` | 程式碼格式，無邏輯變更 |
| `chore` | 依賴更新、設定變更 |

```bash
# 好的範例
feature: 在分析步驟新增中止按鈕
fix: 修正 Linux 上的 Lighthouse 執行檔路徑
docs: 在 DEVELOPMENT.md 新增疑難排解章節
chore: 更新 Puppeteer 至 24.x

# 不好的範例
Update code
Fix bug
WIP
```

---

## 開發規範

### TypeScript

```typescript
// ✅ 函式簽名使用明確型別
async function analyzeUrl(url: string): Promise<AnalysisResult> { ... }

// ✅ 物件形狀使用 interface
interface CrawlOptions {
  maxDepth: number
  timeout: number
}

// ✅ 偏好型別聯合而非 enum
type Locale = 'en' | 'zh'
type Step = 'input' | 'urls' | 'settings' | 'running' | 'done'

// ✅ 使用選擇性鏈結和 Nullish 合併
const title = meta?.title ?? ''

// ❌ 避免使用 `any`
const data: any = {}       // 不好
const data: unknown = {}   // 好——然後用型別守衛縮窄型別
```

### React 元件

```typescript
// ✅ 有型別的 Props 介面
interface Props {
  locale: UILocale
  onClose: () => void
}

// ✅ 命名函式匯出 (非預設匯出)
export function HelpModal({ locale, onClose }: Props): React.JSX.Element {
  return ( ... )
}

// ✅ 保持元件專注——一個明確的職責
// ✅ 將狀態提升至最低公共祖先 (App.tsx)
// ✅ 傳遞為 props 的處理器使用 useCallback
```

### IPC 處理器

```typescript
// ✅ 每個處理器必須在 ipc-handlers.ts 中註冊
// ✅ 使用 ipcMain.handle (不用 ipcMain.on) 處理請求/回應模式
// ✅ 回傳可序列化的純值——無 class 實例、無函式
// ✅ 保持處理器精簡——將邏輯委派給 seo/ 模組
ipcMain.handle('seo:start-crawl', async (event, rootUrl: string) => {
  // 在邊界驗證輸入
  // 委派給領域模組
  // 回傳可序列化的結果
})
```

### 新增 IPC 頻道

1. 在 `src/main/ipc-handlers.ts` 新增頻道處理器
2. 在 `src/preload/index.ts` 新增呼叫函式
3. 更新 `src/preload/index.d.ts` 中的型別宣告
4. 從 renderer 呼叫 `window.api.<newMethod>()`

### Tailwind CSS / 樣式

此專案使用 Tailwind CSS v4。Class 名稱直接套用在 JSX 中；全域樣式在 `src/renderer/src/styles/` 中。

```tsx
// ✅ 直接使用 Tailwind 工具類別
<button className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
  送出
</button>

// ✅ 使用 CSS 變數進行主題化 (在 globals.css 中定義)
// ✅ `<html>` 上的 `dark` class 觸發深色模式
```

---

## 打包發布

### 前置條件

- macOS 建置需要 macOS 主機
- Windows 建置可在 Windows 或 CI 上進行
- Linux 建置可在 Linux 或 CI 上進行
- 預設未設定程式碼簽署 —— 生產環境需新增憑證
- **建置時需要 Chrome。** 若 `.puppeteer-cache/` 不存在，`build/before-build.js` (`electron-builder` 的 `beforeBuild` 鉤子) 會在打包前自動執行 `npx puppeteer browsers install chrome`，無需手動操作。

### 建置輸出

執行建置指令後，輸出出現在 `dist/`：

```
dist/
├── win-unpacked/                           # 解壓縮的 Windows 應用程式
├── web-vitals-inspector-1.0.0-setup.exe    # Windows 安裝程式
├── web-vitals-inspector-1.0.0.dmg          # macOS 磁碟映像
└── web-vitals-inspector-1.0.0.AppImage     # Linux AppImage
```

### 設定說明

發布設定位於 `electron-builder.yml`。關鍵設定：

| 設定 | 值 | 備註 |
|------|-----|------|
| `appId` | `com.electron.app` | 改為你自己的反向網域 ID |
| `productName` | `Web Vitals Inspector` | 顯示於 OS 安裝對話框 |
| `asarUnpack` | `resources/**` | 在 asar 封存檔旁解壓縮 |
| `nsis.createDesktopShortcut` | `always` | 僅限 Windows |

### 執行時期的外部依賴

`electron-builder.yml` **不會**將 `puppeteer`、`lighthouse`、`exceljs` 或 `axios` 打包到 asar 封存檔中。它們作為 `node_modules` 保留在打包應用程式旁邊。這是正確的——Electron 要求原生模組和較大的 CLI 保留在 asar 之外。

`electron.vite.config.ts` 中的 `rollupOptions.external` 告訴 Vite 將這些 import 保留為 Node.js `require()` 呼叫，而非打包進去。

### 透過 GitHub Actions 自動發佈

推送 semver tag 即可觸發 `release.yml` 工作流程，自動編譯所有平台並發布 GitHub Release：

```bash
git tag v1.2.3
git push origin v1.2.3
```

工作流程會對 Puppeteer Chrome 執行檔進行緩存 (以 `.puppeteerrc.cjs` + `package-lock.json` 為鍵値)，保持建置速度。

也可透過 `workflow_dispatch` 手動觸發發版：
- 到 Actions 執行 `Build and Release`
- 輸入 `version` (例如 `1.2.3`，流程會自動正規化為 `v1.2.3`)

### Verification 工作流程 (macOS + 300+ 壓測)

手動執行 `Verification` workflow，可一次完成並留存 artifacts：
- 在 macOS 主機實跑 `npm run build:mac`
- DMG 掛載 + `.app` 存在檢查 + `codesign --verify`
- Windows 320 URL 分析壓測
- 壓測報告上傳 (`reports/stress/*.json` 與 `*.md`)

若要驗證高流量情境，可在手動執行 `Verification` 時設定 `stress_url_count`：
- 例如：`1200` (驗證 1000+ URL)
- workflow 會依輸入數量產生 URL，並以分段模式執行壓測

### 本機 1000+ URL 穩定性測試

建議指令 (Windows)：

```bash
# 終端 A
npm run stress:mock-site

# 終端 B
npm run stress:prepare-urls -- --count=1200
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200

# 若中斷，從 checkpoint 續跑
npm run stress:analyzer:resume -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200

# 從頭開始 (清除 checkpoint)
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200 --clear-checkpoint
```

#### Checkpoint 行為

- 每個分段完成後都會更新 `reports/stress/<label>.checkpoint.json`。
- 續跑模式 (`--resume`) 只會略過 Lighthouse 成功完成的 URL，未成功的 URL 仍會在後續續跑中重試。
- 使用 `--clear-checkpoint` 來清除舊 checkpoint，同一標籤重新開始。
- 壓測報告現在會明確區分 `processed`、`successful` 與 `failed` URL，避免部分失敗被誤判為成功。

#### Mock Site 測試夾具

- `npm run stress:mock-site` 現在會為任何正整數頁碼提供動態 `/page/<n>` 路由。
- `STRESS_MOCK_PAGES` 只控制 sitemap 長度，不再限制路由是否有效。
- 這可避免先前產生超過 360 個 URL 時，壓測其實是在大量 404 頁面上進行的失真驗證。

#### Chrome 執行緒池架構

分析器使用 **固定 3 個 Chrome 執行個體的執行緒池**，在 1000+ URL 測試上限制記憶體成長。主要參數經過實測調優：

| 參數 | 數值 | 原因 |
|------|------|------|
| `PARALLEL_WORKERS` | 3 | 權衡吞吐量與記憶體；3× Lighthouse Chrome + 1× 中繼資料 Chrome = 16 GB 主機上的最佳配置 |
| `RECYCLE_AFTER_USES` | 25 | Chrome 內的 V8 堆積累積頁面垃圾；每 25 次回收可防止堆積碎片無界成長 |
| `PAUSE_HEAP_FRACTION` | 0.80 | 當 Node.js 堆積超過 `--max-old-space-size` 上限的 80% 時，暫停 URL 取得以強制 GC |
| `RESUME_HEAP_FRACTION` | 0.60 | 堆積降至 60% 以下時恢復取得 |
| 分析分段大小 | 200 | 每分段 GC 可回收 5–15 MB LHR 物件；200 URL/分段保持尖峰記憶體 <1.5 GB |

**記憶體回收流程：**
1. 若堆積 ≥ 80%，池在取得 Chrome 執行個體前強制執行 `waitForMemoryBudget()`。
2. LHR (Lighthouse 報告) 物件在精簡萃取後立即捨棄 (LHR 可達 5–15 MB)。
3. 每 `PARALLEL_WORKERS` 個 URL 後和每分段完成後觸發 GC。
4. Chrome 執行個體達到 `RECYCLE_AFTER_USES` (25 次) 時，整個 OS 行程樹遭強制殺害 (非優雅關閉)，確保無孤立子行程遺留。

---

## 疑難排解

### `npm install` 下載 Electron 執行檔失敗

Electron 執行檔下載在網路緩慢或受限的環境中可能失敗。

```bash
# 使用鏡像 (中國)
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install

# 或永久寫入 .npmrc
echo "electron_mirror=https://npmmirror.com/mirrors/electron/" >> .npmrc
```

### Puppeteer 找不到 Chrome

此專案進行了設定 (透過 `.puppeteerrc.cjs`)，讓 Puppeteer 將 Chromium 下載到專案內的 `.puppeteer-cache/` 目錄，而非預設的 `~/.cache/puppeteer`。這樣可確保封裝後的 App 能透過 `extraResources` 將此執行檔一并打包。

```bash
# 將 Chromium 下載到 .puppeteer-cache/ (安裝後執行一次即可)
npm install

# 若 Chromium 仍缺失，強制重新下載
npx puppeteer browsers install chrome
```

> **注意：**`.puppeteer-cache/` 已列入 `.gitignore`。每位開發者在水平拉取後必須執行 `npm install` 才能建置完成此目錄，再進行編譯或打包。

沿用沙箱化環境執行時，`--no-sandbox` 已內建在 Puppeteer 啟動參數中，無須完亟手動新增。

### Lighthouse 找不到

分析器會在多個候選路徑中尋找 Lighthouse 執行檔。若仍失敗：

```bash
# 確認 Lighthouse 已安裝
./node_modules/.bin/lighthouse --version

# 若缺失，重新安裝
npm install lighthouse
```

### 拉取後出現型別錯誤

```bash
# 清除 TypeScript 快取並重新檢查
npx tsc --build --clean
npm run typecheck
```

### 開發模式視窗未開啟

```bash
# 終止任何卡住的 Electron 程序
# Windows
taskkill /f /im electron.exe

# macOS / Linux
pkill -f electron

# 然後重新啟動
npm run dev
```

### Excel 報告為空或損毀

這通常表示分析步驟已完成但沒有儲存 `AnalysisResult` 資料。在 Electron 視窗中開啟開發者工具 (`Ctrl+Shift+I`)，檢查 `seo:start-analysis` 處理器的 IPC 錯誤。

### 更新依賴後 ESLint 顯示大量錯誤

```bash
# 清除 ESLint 快取
# macOS / Linux
rm .eslintcache

# Windows
del .eslintcache

npm run lint
```
