# Web Vitals Inspector

**English** | [繁體中文](./README.zh-TW.md)

[Page Function Description](./docs/page-function-description/page-function-description.md) — Page functionality overview

A professional desktop application for auditing website SEO and Core Web Vitals at scale. Built with Electron, it crawls an entire website, runs Lighthouse analysis on every page, and exports a comprehensive multi-sheet Excel report — all with a clean, bilingual UI.

---

## 📥 Downloads

Pre-built installers are published automatically on every tagged release via GitHub Actions.
Click a badge to download the latest version for your platform:

| Platform | Download |
| :---: | :---: |
| Windows | [![Windows](https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows)](https://github.com/Charmying/web-vitals-inspector/releases/latest) |
| macOS (Apple Silicon) | [![macOS arm64](https://img.shields.io/badge/Download-macOS_arm64-000000?style=for-the-badge&logo=apple)](https://github.com/Charmying/web-vitals-inspector/releases/latest) |
| macOS (Intel) | [![macOS x64](https://img.shields.io/badge/Download-macOS_x64-000000?style=for-the-badge&logo=apple)](https://github.com/Charmying/web-vitals-inspector/releases/latest) |

### **💡 Installation Notes**
- **Windows:** If SmartScreen appears, click **"More info" → "Run anyway"**.
- **macOS:** Drag the app to **Applications**. If "Unverified Developer" appears, go to
  **System Settings → Privacy & Security** and click **"Open Anyway"**.

---

## Features

- **3 Input Modes** — Crawl an entire site, analyze a single URL, or import a custom URL list (`.txt`)
- **Smart Crawler** — Discovers URLs via sitemap, Wayback Machine, and recursive Puppeteer crawling with noise-parameter deduplication
- **Lighthouse Audits** — Runs Performance, Accessibility, Best Practices, and SEO audits via Lighthouse CLI with retry logic
- **Metadata Extraction** — Puppeteer-based extraction of title, meta description, canonical, OG tags, headings, images, hreflang, schema, and more
- **6-Sheet Excel Report** — URL Status, Executive Summary, Top Issues, Issue Details, Page Data, and Glossary
- **Bilingual** — UI and reports support English and Traditional Chinese
- **Dark / Light Theme** — Persistent theme preference
- **Memory-Safe Architecture** — Chrome Pool keeps exactly 3 Chrome instances alive; recycles every 25 uses and force-kills OS process trees to prevent crashes on 300+ URL runs
- **1000+ URL Ready** — Main-process analysis automatically runs in chunks for large batches (default 200 URLs/chunk), with GC between chunks to keep long runs stable

---

## Quick Start

### Requirements

| Tool | Version |
|------|---------|
| Node.js | >= 18.17.0 |
| npm | >= 9.0.0 |
| Git | >= 2.0.0 |

### Install & Run

```bash
# Clone the repository
git clone https://github.com/web-vitals-inspector/web-vitals-inspector.git
cd web-vitals-inspector

# Install dependencies (also installs Electron binaries)
npm install

# Start the development app
npm run dev
```

### Build for Distribution

```bash
npm run build:win     # Windows installer (.exe)
npm run build:mac     # macOS disk image (.dmg, requires macOS host)
npm run build:linux   # AppImage / deb / snap
```

Platform notes:
- `build:mac` can run only on macOS (Electron Builder limitation).
- `build:win` is verified on Windows and in CI.
- For cross-platform public binaries, use the release workflow (below).

---

## Documentation

| Document | English | 繁體中文 |
|----------|---------|---------|
| Project Architecture | [STRUCTURE.md](./docs/STRUCTURE.md) | [STRUCTURE.zh-TW.md](./docs/STRUCTURE.zh-TW.md) |
| Development Guide | [DEVELOPMENT.md](./docs/DEVELOPMENT.md) | [DEVELOPMENT.zh-TW.md](./docs/DEVELOPMENT.zh-TW.md) |
| Dependencies Reference | [DEPENDENCIES.md](./docs/DEPENDENCIES.md) | [DEPENDENCIES.zh-TW.md](./docs/DEPENDENCIES.zh-TW.md) |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| Build tool | electron-vite |
| UI framework | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Crawling | Puppeteer |
| Auditing | Lighthouse CLI |
| Reports | ExcelJS |
| HTTP | Axios |

---

## CI / CD

Two GitHub Actions workflows are included:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push / PR to `main`, `develop` | Type-check + ESLint |
| `release.yml` | Push a semver tag `v*.*.*` | Build Win + macOS (x64 & arm64) and publish GitHub Release |
| `verification.yml` | Manual dispatch | Run macOS `build:mac` + DMG installability check and Windows 300+ URL stress test |

To publish a new release, tag and push:

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions will automatically build all platforms and attach installers to a new GitHub Release.

Manual fallback (no tag push required):
- Open the Actions tab, run `Build and Release`, and provide `version` (for example `1.2.3`).

Full verification fallback:
- Open Actions, run `Verification` to execute:
- macOS host build (`npm run build:mac`) + DMG mount/signature verification
- Windows 320-URL analyzer stress test with report artifact upload

Local 300+ stress test (Windows):
```bash
# Terminal A
npm run stress:mock-site

# Terminal B
npm run stress:prepare-urls
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-320
```

Local 1000+ stress test with resume support (recommended):
```bash
# Terminal A
npm run stress:mock-site

# Terminal B
npm run stress:prepare-urls -- --count=1200
npm run stress:analyzer -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200

# If interrupted, resume from checkpoint
npm run stress:analyzer:resume -- --urls-file=scripts/stress/generated-urls.txt --report-dir=reports/stress --label=local-1200 --chunk-size=200
```

Notes:
- A checkpoint file is saved at `reports/stress/<label>.checkpoint.json` after every chunk.
- Resume mode skips only URLs that already produced a successful Lighthouse result.
- `npm run stress:mock-site` now serves dynamic `/page/<n>` routes, so 1000+ generated URLs are backed by real pages instead of overflowing a 360-page fixture.
- Use `Verification` workflow input `stress_url_count` (for example `1200`) to validate high-volume runs in CI.
