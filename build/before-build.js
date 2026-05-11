/**
 * Pre-build hook — ensures the Puppeteer Chrome cache exists before electron-builder
 * tries to copy it via extraResources.
 *
 * Called automatically by electron-builder via `beforeBuild` in electron-builder.yml.
 * If .puppeteer-cache is missing (e.g. on a fresh clone without `npm install`),
 * this script downloads Chrome so the build does not fail with ENOENT.
 */

const { existsSync } = require('fs')
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function beforeBuild() {
  const cacheDir = path.join(__dirname, '..', '.puppeteer-cache')

  if (existsSync(cacheDir)) {
    console.log('[before-build] Puppeteer Chrome cache found — skipping download.')
    return
  }

  console.log('[before-build] Puppeteer Chrome cache missing — downloading now…')
  try {
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['puppeteer', 'browsers', 'install', 'chrome'],
      { stdio: 'inherit', cwd: path.join(__dirname, '..') }
    )
    console.log('[before-build] Chrome download complete.')
  } catch (err) {
    console.error('[before-build] Chrome download failed:', err.message)
    console.error('[before-build] Run `npm install` or `npx puppeteer browsers install chrome` manually.')
    process.exit(1)
  }
}
