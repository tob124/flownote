import { ipcMain } from 'electron'
import {
  listWikis,
  loadWiki,
  loadDiffSidecar,
  sealWiki,
  listSealedWikis,
  loadSealedWiki
} from '../store/wiki-store'
import { computeAddedLines } from '../../shared/diff'
import { getSyncDir } from '../store/note-store'
import { IPC_CHANNELS } from '../../shared/types'

export function registerWikisIpc(): void {
  ipcMain.handle(IPC_CHANNELS.WIKIS_LIST, () => listWikis())

  ipcMain.handle(IPC_CHANNELS.WIKIS_LOAD, (_e, filename: string) => loadWiki(filename))

  ipcMain.handle(IPC_CHANNELS.WIKIS_SEAL, (_e, category: string, month: string) =>
    sealWiki(category, month)
  )

  ipcMain.handle(IPC_CHANNELS.WIKIS_LIST_SEALED, () => listSealedWikis())

  ipcMain.handle(IPC_CHANNELS.WIKIS_LOAD_SEALED, (_e, filename: string) =>
    loadSealedWiki(filename)
  )

  ipcMain.handle(IPC_CHANNELS.WIKIS_LOAD_DIFF, (_e, filename: string): string[] => {
    if (!filename) return []
    const syncDir = getSyncDir()
    if (!syncDir) return []
    const before = loadDiffSidecar(syncDir, filename)
    const after = loadWiki(filename)
    return computeAddedLines(before, after)
  })
}
