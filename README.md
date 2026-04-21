# Web Vitals Inspector

**English** | [繁體中文](./README.zh-TW.md)

[Page Function Description](./docs/page-function-description/page-function-description.md) — Page functionality overview

A professional desktop application for auditing website SEO and Core Web Vitals at scale. Built with Electron, it crawls an entire website, runs Lighthouse analysis on every page, and exports a comprehensive multi-sheet Excel report — all with a clean, bilingual UI.

---

## 📥 Downloads

We provide optimized stable builds for both Windows and macOS. Click a badge below to download the latest version for your system:

| Windows | macOS |
| :---: | :---: |
| [![Windows](https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge)](https://github.com/Charmying/web-vitals-inspector/releases/latest/download/web-vitals-inspector-windows.exe) | [![macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge)](https://github.com/Charmying/web-vitals-inspector/releases/latest/download/web-vitals-inspector-mac.dmg) |

### **💡 Installation Notes:**
- **Windows:** If prompted by SmartScreen, click **"More info"** and select **"Run anyway"** to proceed.
- **macOS:** After downloading, drag the application to your **Applications** folder. If you encounter an "Unverified Developer" warning, navigate to **System Settings > Privacy & Security** and click **"Open Anyway"** to bypass the check.

---

## Features

- **3 Input Modes** — Crawl an entire site, analyze a single URL, or import a custom URL list (`.txt`)
- **Smart Crawler** — Discovers URLs via sitemap, Wayback Machine, and recursive Puppeteer crawling with noise-parameter deduplication
- **Lighthouse Audits** — Runs Performance, Accessibility, Best Practices, and SEO audits via Lighthouse CLI with retry logic
- **Metadata Extraction** — Puppeteer-based extraction of title, meta description, canonical, OG tags, headings, images, hreflang, schema, and more
- **6-Sheet Excel Report** — URL Status, Executive Summary, Top Issues, Issue Details, Page Data, and Glossary
- **Bilingual** — UI and reports support English and Traditional Chinese
- **Dark / Light Theme** — Persistent theme preference

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
git clone <repository-url>
cd web-vitals-inspector

# Install dependencies (also installs Electron binaries)
npm install

# Start the development app
npm run dev
```

### Build for Distribution

```bash
npm run build:win     # Windows installer (.exe)
npm run build:mac     # macOS disk image (.dmg)
npm run build:linux   # AppImage / deb / snap
```

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
