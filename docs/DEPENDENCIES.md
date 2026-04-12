# Dependencies Reference

**English** | [繁體中文](./DEPENDENCIES.zh-TW.md)

This document explains all npm packages used in the project, including their purpose, selection rationale, and alternatives considered.

---

## Table of Contents

- [Runtime Dependencies](#runtime-dependencies)
- [Development Dependencies](#development-dependencies)
- [Dependency Graph](#dependency-graph)

---

## Runtime Dependencies

These packages are included in the production build or required at runtime by the Electron main process.

---

### Electron

| Item | Content |
|------|---------|
| **Package** | `electron` |
| **Version** | `^39.2.6` |
| **Environment** | devDependency (but central to the app) |
| **Purpose** | Cross-platform desktop application shell |
| **Why Chosen** | • Industry-standard for Node.js desktop apps <br> • Provides native file dialogs, OS integration, and auto-updates <br> • Required to run Puppeteer and spawn Lighthouse as a subprocess <br> • Excellent TypeScript support via `@electron-toolkit` |
| **Alternatives** | • Tauri — Lighter and uses Rust, but no Node.js runtime in backend <br> • NW.js — Older, smaller community <br> • neutralinojs — Very lightweight but minimal native API |

---

### Puppeteer

| Item | Content |
|------|---------|
| **Package** | `puppeteer` |
| **Version** | `^24.40.0` |
| **Environment** | `dependencies` |
| **Purpose** | Headless Chromium browser for URL crawling and SEO metadata extraction |
| **Why Chosen** | • Full browser automation — handles JavaScript-rendered pages <br> • Can extract dynamic content (SPA-rendered metadata, schemas) <br> • Reliable login-wall detection using DOM selectors <br> • Same Chromium instance can be shared across concurrent page analyses |
| **Alternatives** | • Playwright — More powerful but larger bundle size and more complex setup <br> • Cheerio + Axios — Faster but only works on server-rendered HTML, misses JS-rendered content <br> • jsdom — No real browser environment, unreliable for modern sites |
| **Key Usage** | • `crawler.ts` — Recursive link extraction, search-engine scraping <br> • `analyzer.ts` — Per-page metadata extraction (title, description, OG tags, etc.) |

---

### Lighthouse

| Item | Content |
|------|---------|
| **Package** | `lighthouse` |
| **Version** | `^13.1.0` |
| **Environment** | `dependencies` |
| **Purpose** | Automated Performance, Accessibility, Best Practices, and SEO audits |
| **Why Chosen** | • Google's official auditing tool — industry-standard scores <br> • Audits 4 categories simultaneously (Performance, A11y, Best Practices, SEO) <br> • Measures Core Web Vitals (LCP, CLS, TBT, FCP, Speed Index) <br> • Well-maintained with stable CLI interface |
| **Alternatives** | • WebPageTest — Cloud-based, no offline use <br> • axe-core — Accessibility only, no performance metrics <br> • Custom Puppeteer checks — Would require manually reimplementing hundreds of audits |
| **Key Usage** | `analyzer.ts` — Spawned as a CLI subprocess; JSON output parsed to `LhrSlim` |
| **Note** | Lighthouse is run as a **subprocess** (not the Node.js API) to isolate its Chrome instance from the Electron main process |

---

### ExcelJS

| Item | Content |
|------|---------|
| **Package** | `exceljs` |
| **Version** | `^4.4.0` |
| **Environment** | `dependencies` |
| **Purpose** | Generate styled multi-sheet Excel workbooks (`.xlsx`) |
| **Why Chosen** | • Full control over cell formatting: fonts, colors, borders, fills, alignment <br> • Multiple worksheets in a single workbook <br> • No external dependencies — pure JavaScript <br> • Actively maintained with good TypeScript typings |
| **Alternatives** | • SheetJS (xlsx) — Open-source community edition lacks styling APIs <br> • node-xlsx — Very basic, no styling control <br> • csv-writer — CSV only, no Excel formatting |
| **Key Usage** | `report-generator.ts` — Creates 6-sheet `.xlsx` workbook with styled headers, conditional cell coloring |

---

### Axios

| Item | Content |
|------|---------|
| **Package** | `axios` |
| **Version** | `^1.15.0` |
| **Environment** | `dependencies` |
| **Purpose** | HTTP client for fetching sitemaps, robots.txt, and Wayback Machine data |
| **Why Chosen** | • Clean promise-based API with configurable timeouts <br> • Automatic response parsing (XML / JSON / text) <br> • Better error handling than native `fetch` for Node.js use cases <br> • Consistent API across response types |
| **Alternatives** | • Node.js `fetch` (native) — Available since Node 18, but lacks some ergonomic features <br> • `node-fetch` — Deprecated in favor of native fetch <br> • `got` — Feature-rich but larger API surface than needed |
| **Key Usage** | `crawler.ts` — Fetching sitemap XML, Wayback Machine CDX API, robots.txt |

---

### @electron-toolkit/preload

| Item | Content |
|------|---------|
| **Package** | `@electron-toolkit/preload` |
| **Version** | `^3.0.2` |
| **Environment** | `dependencies` |
| **Purpose** | Utility helpers for Electron preload scripts |
| **Why Chosen** | • Part of the `electron-toolkit` ecosystem (used by electron-vite) <br> • Provides `electronAPI` for standard Electron renderer utilities <br> • Reduces boilerplate in the preload script |

---

### @electron-toolkit/utils

| Item | Content |
|------|---------|
| **Package** | `@electron-toolkit/utils` |
| **Version** | `^4.0.0` |
| **Environment** | `dependencies` |
| **Purpose** | Utility functions for the Electron main process |
| **Why Chosen** | • `is.dev` flag for detecting development mode cleanly <br> • `electronApp.setAppUserModelId` for Windows taskbar behavior <br> • `optimizer.watchWindowShortcuts` for dev shortcuts (F12, etc.) |

---

## Development Dependencies

These packages are only used during development, type-checking, and building.

---

### electron-vite

| Item | Content |
|------|---------|
| **Package** | `electron-vite` |
| **Version** | `^5.0.0` |
| **Purpose** | Build tool that wraps Vite for Electron's three processes |
| **Why Chosen** | • Single config handles main, preload, and renderer <br> • HMR for renderer during development <br> • Correct `externals` handling for Electron built-ins <br> • Official recommended build tool for the electron-toolkit ecosystem |
| **Alternatives** | • Vite without electron-vite — Requires manual multi-config setup <br> • webpack + electron-webpack — More verbose configuration <br> • Rollup directly — No HMR, more manual work |
| **Key Config** | `electron.vite.config.ts` — External packages (`puppeteer`, `lighthouse`, `exceljs`, `axios`) are excluded from the main process bundle |

---

### electron-builder

| Item | Content |
|------|---------|
| **Package** | `electron-builder` |
| **Version** | `^26.0.12` |
| **Purpose** | Cross-platform Electron app packaging and distribution |
| **Why Chosen** | • Produces installers for Windows (NSIS), macOS (DMG), and Linux (AppImage/deb/snap) <br> • Uses `asar: false` so `node_modules/.bin/lighthouse` remains an executable file that can be spawned at runtime <br> • `extraResources` bundles the local `.puppeteer-cache/` Chromium into the packaged app <br> • Code signing support for macOS notarization <br> • Auto-update infrastructure via `publish` config |
| **Alternatives** | • Forge — Simpler but less flexible packaging options <br> • Squirrel — Windows-only |

---

### React & React DOM

| Item | Content |
|------|---------|
| **Package** | `react`, `react-dom` |
| **Version** | `^19.2.1` |
| **Purpose** | UI library for the renderer process |
| **Why Chosen** | • React 19 with concurrent features <br> • Vast ecosystem <br> • Excellent TypeScript support <br> • Mature component model for the step-based workflow UI |
| **Alternatives** | • Vue — Different paradigm, smaller ecosystem for Electron <br> • Svelte — Lighter but smaller tooling ecosystem <br> • Vanilla JS — Viable for simple UIs but harder to maintain at scale |

---

### TypeScript

| Item | Content |
|------|---------|
| **Package** | `typescript` |
| **Version** | `^5.9.3` |
| **Purpose** | Typed superset of JavaScript for all source files |
| **Why Chosen** | • Catches type mismatches between Electron processes at compile time <br> • Autocomplete and refactoring in VS Code <br> • Strict mode enabled for maximum safety <br> • Three separate `tsconfig` files for the three Electron process types |
| **Key Settings** | • `strict: true` in all configs <br> • `tsconfig.node.json` — main + preload (Node.js types) <br> • `tsconfig.web.json` — renderer (browser types + React JSX) |

---

### Tailwind CSS v4

| Item | Content |
|------|---------|
| **Package** | `tailwindcss`, `@tailwindcss/postcss` |
| **Version** | `^4.2.2` |
| **Purpose** | Utility-first CSS framework for the renderer UI |
| **Why Chosen** | • Rapid UI development with consistent design tokens <br> • v4 is significantly faster (no PostCSS config file needed) <br> • Excellent dark mode support via `dark:` variant and `class` strategy <br> • Tiny production CSS output via tree-shaking |
| **Alternatives** | • CSS Modules — More explicit but slower iteration <br> • styled-components — Runtime overhead <br> • UnoCSS — Faster but smaller ecosystem |
| **v4 Notes** | Uses `@tailwindcss/postcss` as the PostCSS plugin. Configuration is done via CSS `@theme` directives, not `tailwind.config.js` |

---

### ESLint

| Item | Content |
|------|---------|
| **Package** | `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` |
| **Version** | `^9.39.1` |
| **Purpose** | Static code analysis for JavaScript and TypeScript |
| **Why Chosen** | • ESLint 9 flat config format — simpler and faster <br> • React hooks rules catch common bugs (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) <br> • `react-refresh` plugin prevents HMR issues in development <br> • `@electron-toolkit/eslint-config-ts` provides correct rules for Electron contexts |
| **Config** | `eslint.config.mjs` at the root |

---

### Vite

| Item | Content |
|------|---------|
| **Package** | `vite` |
| **Version** | `^7.2.6` |
| **Purpose** | Underlying build engine used by electron-vite |
| **Notes** | Not configured directly — all configuration goes through `electron.vite.config.ts` |

---

### @vitejs/plugin-react

| Item | Content |
|------|---------|
| **Package** | `@vitejs/plugin-react` |
| **Version** | `^5.1.1` |
| **Purpose** | Vite plugin that enables React Fast Refresh and JSX transform for the renderer |
| **Why Chosen** | Official React plugin for Vite — handles Babel-based JSX transform and HMR |

---

### autoprefixer

| Item | Content |
|------|---------|
| **Package** | `autoprefixer` |
| **Version** | `^10.4.27` |
| **Purpose** | PostCSS plugin that adds vendor prefixes to CSS rules automatically |
| **Why Chosen** | Standard Tailwind CSS companion; ensures cross-browser CSS compatibility without manual prefixing |

---

## Dependency Graph

```
App Runtime
├── electron                        ← Desktop shell
│   ├── @electron-toolkit/preload
│   └── @electron-toolkit/utils
├── puppeteer                       ← Headless browser
│   └── (bundled Chromium)
├── lighthouse                      ← Web audits (spawned as subprocess)
│   └── (requires Chrome)
├── exceljs                         ← Report generation
└── axios                           ← HTTP requests

UI (renderer process)
├── react
├── react-dom
└── tailwindcss (build-time only)

Build Toolchain
├── electron-vite
│   └── vite
│       ├── @vitejs/plugin-react
│       └── @tailwindcss/postcss
│           └── autoprefixer
└── electron-builder

Type System & Linting
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
