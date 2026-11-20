import { startThinkingService, stopThinkingService } from './services/thinking-service'
import { app, BrowserWindow, dialog, shell, protocol, net } from 'electron'
import { dirname, join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { loadConfig } from './store/config-store'
import { ensureDirectories } from './store/note-store'
import { loadDreamState } from './store/dream-store'
import { ClassifierService } from './services/classifier-service'
import { inboxWatcher } from './services/inbox-watcher'
import { setClassifierInstance } from './ipc/classifier.ipc'
import { setNotificationWindow } from './store/notifications-store'
import { registerAllIpc } from './ipc'
import { serveAttachmentMedia } from './services/attachment-preview'
import { getFontPath } from './store/font-store'

let mainWindow: BrowserWindow | null = null
let classifierService: ClassifierService | null = null

// Isolated verification profiles must not share drafts or the user's app lock.
if (process.env.FLOWNOTE_CONFIG_PATH) app.setPath('userData', join(process.env.FLOWNOTE_CONFIG_PATH, '..', 'electron-profile'))

// 自定义协议：以同源方式提供附件本地文件，规避 file:// 跨源被拦截，
// 保证开发(http)与生产(file)环境下 <img> 都能正常显示附件图片。
// scheme 必须在 app ready 之前注册。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'flownote-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

function registerFileProtocol(): void {
  protocol.handle('flownote-file', async request => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.slice(1).split('/').map(decodeURIComponent)
      if (url.host === 'attachment' && parts.length === 2) return await serveAttachmentMedia(parts[0], parts[1], request)
      let asset: string | null = null
      if (url.host === 'font' && parts.length === 1) asset = getFontPath(parts[0])
      if (url.host === 'pdf-data' && parts.length === 2) {
        const [directory, file] = parts
        const pattern = directory === 'cmaps' ? /^[\w-]+\.bcmap$/ : directory === 'standard_fonts' ? /^[\w-]+\.(ttf|pfb)$/ : null
        if (pattern?.test(file)) {
          const root = dirname(require.resolve('pdfjs-dist/package.json'))
          asset = join(root, directory, file)
        }
      }
      if (asset) {
        const source = await net.fetch(pathToFileURL(asset).href)
        const headers = new Headers(source.headers)
        headers.set('Access-Control-Allow-Origin', '*')
        return new Response(source.body, { status: source.status, headers })
      }
    } catch {
      // Files can disappear or become temporarily inaccessible during sync.
    }
    return new Response(null, { status: 404 })
  })
}

function createWindow(): BrowserWindow {
  // Determine icon path based on environment
  const iconPath = process.env.ELECTRON_RENDERER_URL
    ? join(process.cwd(), 'resources/icon.png')
    : join(__dirname, '../../resources/icon.png')

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    title: 'FlowNote',
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // Markdown links must never replace the renderer that owns the preload API.
  win.webContents.on('will-navigate', (event, target) => {
    event.preventDefault()
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.flownote.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const config = loadConfig()

    registerFileProtocol()
    registerAllIpc()

    if (config.sync_dir) {
      ensureDirectories(config.sync_dir)
    }

    mainWindow = createWindow()
    setNotificationWindow(mainWindow)

    classifierService = new ClassifierService()
    setClassifierInstance(classifierService)
    classifierService.start(mainWindow)

    startThinkingService()
    inboxWatcher.init()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
        classifierService?.start(mainWindow)
      }
    })
  })

  app.on('window-all-closed', () => {
    stopThinkingService()
    classifierService?.stop()
    setClassifierInstance(null)
    inboxWatcher.stop()
    app.quit()
  })
}
