import { app, BrowserWindow, dialog, shell, protocol, net } from 'electron'
import { join } from 'path'
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

let mainWindow: BrowserWindow | null = null
let classifierService: ClassifierService | null = null

// 自定义协议：以同源方式提供附件本地文件，规避 file:// 跨源被拦截，
// 保证开发(http)与生产(file)环境下 <img> 都能正常显示附件图片。
// scheme 必须在 app ready 之前注册。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'flownote-file',
    privileges: { secure: true, supportFetchAPI: true, stream: true }
  }
])

// 绑定附件文件读取：flownote-file://<encodeURIComponent(绝对路径)>
function registerFileProtocol(): void {
  protocol.handle('flownote-file', (request) => {
    try {
      const filePath = decodeURIComponent(new URL(request.url).host)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response(null, { status: 404 })
    }
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

  win.on('close', (e) => {
    const dreamState = loadDreamState()
    if (dreamState.dream_in_progress) {
      e.preventDefault()
      dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Dream 进行中',
        message: 'Dream 正在进行中，请等待完成后再关闭应用。',
        buttons: ['确定']
      })
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

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

  inboxWatcher.init()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      classifierService?.start(mainWindow)
    }
  })
})

app.on('window-all-closed', () => {
  classifierService?.stop()
  setClassifierInstance(null)
  inboxWatcher.stop()
  app.quit()
})
