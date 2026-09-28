import { registerThinkingIpc } from './thinking.ipc'
import { ipcMain } from 'electron'
import { loadDreamState, isDreamInProgress } from '../store/dream-store'
import { registerNotesIpc } from './notes.ipc'
import { registerWikisIpc } from './wikis.ipc'
import { registerDreamIpc } from './dream.ipc'
import { registerConfigIpc } from './config.ipc'
import { registerInboxIpc } from './inbox.ipc'
import { registerClassifierIpc } from './classifier.ipc'
import { registerPolishIpc } from './polish.ipc'
import { registerFontIpc } from './font.ipc'
import { registerFilesIpc } from './files.ipc'
import { registerNotificationsIpc } from './notifications.ipc'
import { IPC_CHANNELS } from '../../shared/types'

export function registerAllIpc(): void {
  registerNotesIpc()
  registerThinkingIpc()
  registerWikisIpc()
  registerDreamIpc()
  registerConfigIpc()
  registerInboxIpc()
  registerClassifierIpc()
  registerPolishIpc()
  registerFontIpc()
  registerFilesIpc()
  registerNotificationsIpc()

  // App-level handlers
  ipcMain.handle(IPC_CHANNELS.APP_CONFIRM_CLOSE, () => {
    return !isDreamInProgress()
  })
}
