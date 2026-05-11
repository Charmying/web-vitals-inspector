# Development Guide

**English** | [繁體中文](./DEVELOPMENT.zh-TW.md)

This document explains the project's development environment setup, development guidelines, and common troubleshooting solutions.

---

## Table of Contents

- [Environment Requirements](#environment-requirements)
- [Quick Start](#quick-start)
- [Project Scripts](#project-scripts)
- [Development Workflow](#development-workflow)
- [Development Guidelines](#development-guidelines)
- [Building for Distribution](#building-for-distribution)
- [Troubleshooting](#troubleshooting)

---

## Environment Requirements

### Required

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 18.17.0 | Required for Electron 39 |
| npm | >= 9.0.0 | Bundled with Node.js |
| Git | >= 2.0.0 | Version control |

### Recommended VS Code Extensions

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

### System Dependencies

Puppeteer downloads Chromium automatically during `npm install`. On Linux, you may need additional system libraries:

```bash
# Debian / Ubuntu
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libasound2
```

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd web-vitals-inspector
```

### 2. Install Dependencies

```bash
npm install
```

> This installs all packages **and** triggers `electron-builder install-app-deps` (via `postinstall`) to download platform-native Electron binaries and rebuild any native modules.

### 3. Start Development Mode

```bash
npm run dev
```

The development app will launch automatically. It uses `electron-vite`'s HMR — changes to `src/renderer/` are reflected instantly; changes to `src/main/` or `src/preload/` require restarting the dev command.

### 4. Verify the Setup

Confirm the window opens with:
- ✅ UI renders correctly in the chosen locale
- ✅ Theme toggle switches between dark and light
- ✅ Help modal opens and closes
- ✅ URL input field and mode selector are responsive

---

## Project Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron app in development mode with HMR |
| `npm run build` | Run type-check then build all three processes (main, preload, renderer) |
| `npm run typecheck` | Run `tsc --noEmit` for both `node` and `web` configs |
| `npm run typecheck:node` | Type-check main + preload |
| `npm run typecheck:web` | Type-check renderer |
| `npm run lint` | Run ESLint across the whole project |
| `npm run start` | Preview the last production build |
| `npm run build:unpack` | Build and extract without packaging (useful for debugging) |
| `npm run build:win` | Build Windows installer (`.exe` NSIS setup) |
| `npm run build:mac` | Build macOS disk image (`.dmg`, macOS host required) |
| `npm run build:linux` | Build Linux packages (AppImage, snap, deb) |
| `npm run stress:mock-site` | Start local mock website for stress testing |
| `npm run stress:prepare-urls` | Generate 320 local URLs for 300+ stress runs |
| `npm run stress:prepare-urls:1200` | Generate 1200 local URLs for high-volume stability tests |
| `npm run stress:analyzer -- --urls-file=...` | Run analyzer stress mode and emit JSON/Markdown report |
| `npm run stress:analyzer:resume -- --urls-file=...` | Resume analyzer stress mode from checkpoint after interruption |

---

## Development Workflow

### Daily Flow

```bash
# 1. Pull the latest changes
git pull origin main

# 2. Install any new dependencies
npm install

# 3. Start development
npm run dev

# 4. When done, lint before committing
npm run lint

# 5. Type-check
npm run typecheck

# 6. Commit
git add .
git commit -m "feature: describe the change"
git push
```

### Git Branch Strategy

```
main                    # Production-ready code
  ├─ feature/xxx        # New features
  ├─ fix/xxx            # Bug fixes
  └─ docs/xxx           # Documentation updates
```

### Commit Message Convention

Format: `<type>: <description>`

| Type | When to use |
|------|-------------|
| `feature` | New feature or enhancement |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `refactor` | Code change that is not a feature or fix |
| `style` | Code formatting, no logic change |
| `chore` | Dependency updates, config changes |

```bash
# Good examples
feature: add abort button to analysis step
fix: resolve Lighthouse binary path on Linux
docs: add troubleshooting section to DEVELOPMENT.md
chore: update Puppeteer to 24.x

# Bad examples
Update code
Fix bug
WIP
```

---

## Development Guidelines

### TypeScript

```typescript
// ✅ Explicit types for function signatures
async function analyzeUrl(url: string): Promise<AnalysisResult> { ... }

// ✅ Use interfaces for object shapes
interface CrawlOptions {
  maxDepth: number
  timeout: number
}

// ✅ Prefer type unions over enums
type Locale = 'en' | 'zh'
type Step = 'input' | 'urls' | 'settings' | 'running' | 'done'

// ✅ Use optional chaining and nullish coalescing
const title = meta?.title ?? ''

// ❌ Avoid `any`
const data: any = {}       // Bad
const data: unknown = {}   // Good — then narrow with a type guard
```

### React Components

```typescript
// ✅ Typed props interface
interface Props {
  locale: UILocale
  onClose: () => void
}

// ✅ Named function export (not default)
export function HelpModal({ locale, onClose }: Props): React.JSX.Element {
  return ( ... )
}

// ✅ Keep components focused — one clear responsibility
// ✅ Lift state to the lowest common ancestor (App.tsx)
// ✅ Use useCallback for handlers passed as props
```

### IPC Handlers

```typescript
// ✅ Every handler must be registered in ipc-handlers.ts
// ✅ Use ipcMain.handle (not ipcMain.on) for request/response patterns
// ✅ Return plain serializable values — no class instances, no functions
// ✅ Keep handlers thin — delegate logic to the seo/ modules
ipcMain.handle('seo:start-crawl', async (event, rootUrl: string) => {
  // validate input at the boundary
  // delegate to domain module
  // return serializable result
})
```

### Adding New IPC Channels

1. Add the channel handler in `src/main/ipc-handlers.ts`
2. Add the invocation function in `src/preload/index.ts`
3. Update the type declaration in `src/preload/index.d.ts`
4. Call `window.api.<newMethod>()` from the renderer

### Tailwind CSS / Styling

This project uses Tailwind CSS v4. Class names are applied inline in JSX; global styles live in `src/renderer/src/styles/`.

```tsx
// ✅ Use Tailwind utilities directly
<button className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
  Submit
</button>

// ✅ Use CSS variables for theming (defined in globals.css)
// ✅ The `dark` class on <html> triggers dark mode
```

---

## Building for Distribution

### Prerequisites

- macOS builds require a macOS host machine
- Windows builds can be done on Windows or via CI
- Linux builds can be done on Linux or via CI
- Code signing is not configured by default — add certificates for production
- **Chrome is required at build time.** If `.puppeteer-cache/` is absent, `build/before-build.js` (an `electron-builder` `beforeBuild` hook) will automatically run `npx puppeteer browsers install chrome` before packaging begins. No manual step is needed.

### Build Output

After running a build command, outputs appear in `dist/`:

```
dist/
├── win-unpacked/                           # Unpacked Windows app
├── web-vitals-inspector-1.0.0-setup.exe    # Windows installer
├── web-vitals-inspector-1.0.0.dmg          # macOS image
└── web-vitals-inspector-1.0.0.AppImage     # Linux AppImage
```

### Configuration

The distribution is configured in `electron-builder.yml`. Key settings:

| Setting | Value | Notes |
|---------|-------|-------|
| `appId` | `com.electron.app` | Change to your own reverse-domain ID |
| `productName` | `Web Vitals Inspector` | Displayed in OS install dialogs |
| `asarUnpack` | `resources/**` | Unpacked alongside the asar archive |
| `nsis.createDesktopShortcut` | `always` | Windows only |

### External Dependencies at Runtime

`electron-builder.yml` does **not** bundle `puppeteer`, `lighthouse`, `exceljs`, or `axios` into the app's asar archive. They remain as `node_modules` alongside the packaged app. This is correct — Electron requires native modules and large CLIs to stay outside the asar.

The `rollupOptions.external` in `electron.vite.config.ts` tells Vite to leave these imports as Node.js `require()` calls rather than bundling them.

### Automated Release via GitHub Actions

Push a semver tag to trigger the `release.yml` workflow, which builds all platforms and publishes a GitHub Release:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The workflow caches the Puppeteer Chrome binary (keyed on `.puppeteerrc.cjs` + `package-lock.json`) to keep build times fast.

You can also run release automation manually via `workflow_dispatch`:
- Open Actions → `Build and Release`
- Input `version` such as `1.2.3` (the workflow normalizes it to `v1.2.3`)

### Verification Workflow (macOS + 300+ stress)

Run the `Verification` workflow manually to execute both checks with artifacts:
- macOS host `npm run build:mac`
- DMG mount + `.app` presence + `codesign --verify`
- Windows 320-URL analyzer stress test
- Stress report upload (`reports/stress/*.json` and `*.md`)

For high-volume CI validation, set `stress_url_count` when manually running `Verification`:
- Example: `1200` to validate 1000+ URL behavior
- The workflow will generate that many URLs and run chunked analyzer stress mode

### 1000+ URL Local Stability Run

Recommended commands (Windows):

```bash
# Terminal A
npm run stress:mock-site

# Terminal B
npm run stress:prepare-urls -- --count=1200
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200

# Resume if interrupted
npm run stress:analyzer:resume -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200

# Start fresh (clear checkpoint)
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200 --clear-checkpoint
```

#### Checkpoint Behavior

- A checkpoint file is updated after each chunk at `reports/stress/<label>.checkpoint.json`.
- Resume mode (`--resume`) skips only URLs with a successful Lighthouse result and continues pending chunks only.
- Use `--clear-checkpoint` to discard the checkpoint and start fresh for the same label.
- Stress reports now distinguish `processed`, `successful`, and `failed` URLs so partial audit failures are visible.

#### Mock Site Fixture

- `npm run stress:mock-site` now serves dynamic `/page/<n>` routes for any positive page number.
- `STRESS_MOCK_PAGES` controls sitemap length, not route validity.
- This avoids invalid 1000+ stress runs where generated URLs exceeded the mock fixture's old 360-page cap.

#### Chrome Pool Architecture

The analyzer uses a **fixed pool of 3 Chrome instances** to bound memory growth on 1000+ URL runs. Key parameters are tuned through empirical testing:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `PARALLEL_WORKERS` | 3 | Balances throughput vs. memory; 3× Lighthouse Chrome + 1× metadata Chrome = optimal for 16 GB hosts |
| `RECYCLE_AFTER_USES` | 25 | V8 heap within Chrome accumulates page garbage; recycling every 25 uses prevents unbounded heap fragmentation |
| `PAUSE_HEAP_FRACTION` | 0.80 | When the Node.js heap exceeds 80% of the `--max-old-space-size` limit, pause URL acquisition to force GC |
| `RESUME_HEAP_FRACTION` | 0.60 | Resume acquisition when heap drops below 60% |
| Analysis Chunk Size | 200 | Per-chunk GC reclaims 5–15 MB LHR objects; 200 URLs per chunk keeps peak memory <1.5 GB |

**Memory Reclamation Flow:**
1. Pool enforces `waitForMemoryBudget()` before acquiring a Chrome slot if heap ≥ 80%.
2. LHR (Lighthouse Report) objects are immediately discarded after slim extraction (LHR can be 5–15 MB each).
3. GC is triggered after every `PARALLEL_WORKERS` URLs and after every chunk completion.
4. When a Chrome instance reaches `RECYCLE_AFTER_USES` (25), the entire process tree is OS-level force-killed (not graceful close) to ensure no orphaned sub-processes remain.

---

## Troubleshooting

### `npm install` Fails on Electron Binaries

Electron binary downloads can fail on slow or restricted networks.

```bash
# Use a mirror (China mainland)
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install

# Or set permanently in .npmrc
echo "electron_mirror=https://npmmirror.com/mirrors/electron/" >> .npmrc
```

### Puppeteer Cannot Find Chrome

This project configures Puppeteer (via `.puppeteerrc.cjs`) to download Chromium into `.puppeteer-cache/` inside the project directory rather than the default `~/.cache/puppeteer`. This ensures the packaged app can bundle the binary via `extraResources`.

```bash
# Download Chromium into .puppeteer-cache/ (run once after cloning)
npm install

# If Chromium is still missing, force a re-download
npx puppeteer browsers install chrome
```

> **Note:** `.puppeteer-cache/` is listed in `.gitignore`. Every developer must run `npm install` after cloning to populate it before building or packaging.

If running in a sandboxed environment, the `--no-sandbox` flag is already included in the Puppeteer launch args.

### Lighthouse Not Found

The analyzer looks for the Lighthouse binary in multiple candidate paths. If it still fails:

```bash
# Verify Lighthouse is installed
./node_modules/.bin/lighthouse --version

# If missing, reinstall
npm install lighthouse
```

### Type Errors After Pulling

```bash
# Clear TypeScript cache and re-check
npx tsc --build --clean
npm run typecheck
```

### App Window Doesn't Open (Development)

```bash
# Kill any stuck Electron processes
# Windows
taskkill /f /im electron.exe

# macOS / Linux
pkill -f electron

# Then restart
npm run dev
```

### Excel Report Is Empty or Corrupted

This usually means the analysis step completed but no `AnalysisResult` data was stored. Check the dev-tools console (`Ctrl+Shift+I` in the Electron window) for IPC errors in the `seo:start-analysis` handler.

### ESLint Shows Many Errors After Updating Dependencies

```bash
# Clear the ESLint cache
# macOS / Linux
rm .eslintcache

# Windows
del .eslintcache

npm run lint
```
