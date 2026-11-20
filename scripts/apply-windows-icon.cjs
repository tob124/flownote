const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

module.exports = async function applyWindowsIcon(context) {
  if (context.electronPlatformName !== 'win32') return
  const executable = join(context.appOutDir, context.packager.appInfo.productFilename + '.exe')
  const icon = join(__dirname, '..', 'resources', 'icon.ico')
  // The Windows-only rcedit shipped with the installer tooling requires no
  // extraction of the macOS symlinks in electron-builder's signing archive.
  execFileSync(require.resolve('electron-winstaller/vendor/rcedit.exe'), [executable, '--set-icon', icon], { stdio: 'inherit' })
}
