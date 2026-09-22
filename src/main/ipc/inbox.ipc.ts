import { ipcMain } from 'electron'
import { processInbox } from '../store/inbox-store'
import { IPC_CHANNELS } from '../../shared/types'

export function registerInboxIpc(): void {
  ipcMain.handle(IPC_CHANNELS.INBOX_PROCESS, () => {
    processInbox()
  })
}
