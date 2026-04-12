const { join } = require('path')

/**
 * Configure Puppeteer to download Chromium into a project-local directory
 * instead of the default ~/.cache/puppeteer (user home).
 *
 * This allows electron-builder to bundle Chrome via `extraResources` so the
 * packaged app works on machines that have never run `npm install`.
 *
 * After adding or changing this file, run `npm install` to download Chrome here.
 */
module.exports = {
  cacheDirectory: join(__dirname, '.puppeteer-cache')
}
