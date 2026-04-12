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
| `npm run build:mac` | Build macOS disk image (`.dmg`) |
| `npm run build:linux` | Build Linux packages (AppImage, snap, deb) |

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
- Code signing is not configured by default — add your certificates for production

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

```bash
# Force Puppeteer to re-download Chromium
npx puppeteer browsers install chrome
```

If running in a sandboxed environment, add `--no-sandbox` to the Puppeteer launch args in `analyzer.ts`.

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
