/** Chrome executable path resolution for both development and packaged builds */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import puppeteer from 'puppeteer'

/** Platform-specific filename of the Chrome/Chromium executable */
function chromeBinaryName(): string {
  switch (process.platform) {
    case 'win32':
      return 'chrome.exe'
    case 'darwin':
      return 'Chromium' // the actual binary inside Chromium.app/Contents/MacOS/
    default:
      return 'chrome'
  }
}

/**
 * Recursively search a directory tree for the Chrome executable.
 * Caps at maxDepth to avoid traversing huge subtrees.
 */
function findChromeInDir(baseDir: string, maxDepth = 8): string | null {
  const target = chromeBinaryName()

  function walk(dir: string, depth: number): string | null {
    if (depth > maxDepth) return null
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return null
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      let stat: fs.Stats
      try {
        stat = fs.statSync(fullPath)
      } catch {
        continue
      }

      if (!stat.isDirectory()) {
        if (entry === target) {
          // On macOS, 'Chromium' appears both as the .app bundle name and the real binary
          // inside Contents/MacOS/. Only return when it is inside the MacOS directory.
          if (process.platform === 'darwin' && !dir.endsWith(path.join('Contents', 'MacOS'))) {
            continue
          }
          return fullPath
        }
      } else {
        const found = walk(fullPath, depth + 1)
        if (found) return found
      }
    }
    return null
  }

  return walk(baseDir, 0)
}

/** Check common system Chrome installations as a last-resort fallback */
function findSystemChrome(): string | null {
  const candidates: string[] = []

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    )
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    )
  }

  return candidates.find((c) => c && fs.existsSync(c)) ?? null
}

/**
 * Returns the path to the Chrome executable for Puppeteer and Lighthouse.
 *
 * Resolution order:
 *   1. Packaged app   → searches resources/puppeteer-cache/ (bundled via extraResources)
 *   2. Development    → puppeteer.executablePath() (respects .puppeteerrc.cjs cacheDirectory)
 *   3. Fallback       → common system Chrome installations
 */
export function getChromePath(): string {
  // --- Packaged app: Chrome lives in resources/puppeteer-cache/ ---
  if (app.isPackaged) {
    const cacheDir = path.join(process.resourcesPath, 'puppeteer-cache')
    if (fs.existsSync(cacheDir)) {
      const found = findChromeInDir(cacheDir)
      if (found) return found
    }
    console.warn(
      '[chrome] Bundled Chrome not found in resources/puppeteer-cache — falling back to system Chrome'
    )
    return findSystemChrome() ?? ''
  }

  // --- Development: use Puppeteer's configured cache (.puppeteer-cache/) ---
  try {
    const execPath = puppeteer.executablePath()
    if (execPath && fs.existsSync(execPath)) return execPath
  } catch {
    // puppeteer not yet configured or Chrome not yet downloaded
  }

  // --- Last resort: system Chrome ---
  const system = findSystemChrome()
  if (system) return system

  console.warn('[chrome] No Chrome executable found. Run: npx puppeteer browsers install chrome')
  return ''
}
