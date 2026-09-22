import { ipcMain, dialog } from 'electron'
import { importFont, listFonts, deleteFont, getFontPath } from '../store/font-store'
import { IPC_CHANNELS } from '../../shared/types'

export function registerFontIpc(): void {
  ipcMain.handle(IPC_CHANNELS.FONTS_SELECT_FILE, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择字体文件',
      properties: ['openFile'],
      filters: [
        { name: '字体文件', extensions: ['ttf', 'otf', 'woff', 'woff2'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      return importFont(result.filePaths[0])
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.FONTS_LIST, () => listFonts())

  ipcMain.handle(IPC_CHANNELS.FONTS_DELETE, (_e, file: string) => deleteFont(file))

  ipcMain.handle(IPC_CHANNELS.FONTS_GET_PATH, (_e, file: string): string | null => {
    const path = getFontPath(file)
    // 使用自定义协议返回同源 URL，避免 file:// 跨源被拦截导致字体无法加载
    return path ? `flownote-file://${encodeURIComponent(path)}` : null
  })
}