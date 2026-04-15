/**
 * electron-builder afterSign hook
 *
 * Applies ad-hoc code signing on macOS after the app is built.
 * This is required because:
 *   1. Apple Silicon (M-series) Macs refuse to run completely unsigned apps,
 *      showing an undismissable "damaged" error with no bypass option.
 *   2. Ad-hoc signing (-) is FREE — no Apple Developer account required.
 *   3. After ad-hoc signing the error changes to "unidentified developer",
 *      which gives users the "Open Anyway" button in
 *      System Settings → Privacy & Security.
 *
 * This hook runs automatically via `afterSign: build/afterSign.js` in
 * electron-builder.yml, after the app bundle is assembled but before it
 * is packaged into the .dmg file.
 */

const { execSync } = require('child_process')
const path = require('path')

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context

  // Only run on macOS
  if (electronPlatformName !== 'darwin') return

  const appName = packager.appInfo.productName
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log(`\n[afterSign] Applying ad-hoc code signing…`)
  console.log(`[afterSign] App path: ${appPath}`)

  // --force   : overwrite any existing signature
  // --deep    : recursively sign all nested frameworks, helpers, and dylibs
  // --sign -  : ad-hoc identity (no certificate needed, 100% free)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })

  console.log(`[afterSign] Ad-hoc signing complete.\n`)
}
