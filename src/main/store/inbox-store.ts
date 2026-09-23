import { getSyncDir } from './note-store'
import { captureInbox, captureLegacyProcessing, recoverImports } from './import-store'
import { pokeClassifier } from '../ipc/classifier.ipc'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'

export function processInbox(): void {
  const syncDir = getSyncDir()
  if (!syncDir) throw new Error('sync_dir not configured')

  // Both moves are retryable. Existing batches are never removed on failure.
  captureLegacyProcessing(syncDir)
  captureInbox(syncDir)
  const win = BrowserWindow.getAllWindows()[0]
  try {
    const created = recoverImports(syncDir, {
      onBatchStart: (count) => win?.webContents.send(IPC_CHANNELS.INBOX_PROCESSING_START, count),
      onNoteCreated: (id) => win?.webContents.send(IPC_CHANNELS.INBOX_NOTE_CREATED, id)
    })
    if (created.length > 0) pokeClassifier()
  } finally {
    win?.webContents.send(IPC_CHANNELS.INBOX_PROCESSING_END)
  }
}
