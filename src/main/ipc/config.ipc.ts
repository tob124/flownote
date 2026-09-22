import { ipcMain, dialog } from 'electron'
import { loadConfig as loadConfigStore, saveConfig } from '../store/config-store'
import { ensureDirectories } from '../store/note-store'
import type { AppConfig } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

export function registerConfigIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_LOAD, () => loadConfigStore())

  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_e, cfg: AppConfig) => {
    saveConfig(cfg)
    if (cfg.sync_dir) {
      ensureDirectories(cfg.sync_dir)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_SELECT_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
