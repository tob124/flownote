import { ipcMain } from 'electron'
import {
  loadDreamState,
  setDreamThreshold,
  setDreamTimeRange,
  listDreamReports,
  loadDreamReport
} from '../store/dream-store'
import { startDream } from '../services/dream-worker'
import { IPC_CHANNELS } from '../../shared/types'
import { loadConfig } from '../store/config-store'

export function registerDreamIpc(): void {
  ipcMain.handle(IPC_CHANNELS.DREAM_GET_STATE, () => {
    const state = loadDreamState()
    return {
      last_dream_at: state.last_dream_at,
      dream_in_progress: state.dream_in_progress,
      dream_threshold: state.dream_threshold,
      dream_time_range: state.dream_time_range
    }
  })

  ipcMain.handle(IPC_CHANNELS.DREAM_START, async (event) => {
    const config = loadConfig()
    const syncDir = config.sync_dir
    if (!syncDir) throw new Error('sync_dir not configured')
    const win = event.sender.getOwnerBrowserWindow()
    if (win) {
      startDream(syncDir, config.api_provider, config.api_key, win)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DREAM_GET_REPORTS, () => listDreamReports())

  ipcMain.handle(IPC_CHANNELS.DREAM_LOAD_REPORT, (_e, filename: string) =>
    loadDreamReport(filename)
  )

  ipcMain.handle(IPC_CHANNELS.DREAM_SET_THRESHOLD, (_e, value: number) =>
    setDreamThreshold(value)
  )

  ipcMain.handle(IPC_CHANNELS.DREAM_SET_TIME_RANGE, (_e, value: string) =>
    setDreamTimeRange(value)
  )
}
