import { ipcMain } from 'electron'
import { loadConfig } from '../store/config-store'
import {
  CollectionStoreError, createCollection, deleteCollection, linkCollectionNote,
  listCollections, updateCollection
} from '../store/collection-store'
import type { CollectionInput, CollectionRecord, CollectionResult } from '../../shared/collections'
import { IPC_CHANNELS } from '../../shared/types'

function handle<T>(work: (syncDir: string) => T): CollectionResult<T> {
  try {
    const dir = loadConfig().sync_dir
    if (!dir) return { ok: false, error: { code: 'INVALID', message: '请先设置同步目录' } }
    return { ok: true, value: work(dir) }
  } catch (reason) {
    const error = reason instanceof CollectionStoreError ? reason : new CollectionStoreError('IO', String(reason))
    return { ok: false, error: { code: error.code, message: error.message } }
  }
}
export function registerCollectionsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_LIST, (): CollectionResult<CollectionRecord[]> => handle(listCollections))
  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_CREATE, (_e, input: CollectionInput): CollectionResult<CollectionRecord> =>
    handle((dir) => createCollection(dir, input)))
  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_UPDATE, (_e, id: string, revision: number, input: CollectionInput): CollectionResult<CollectionRecord> =>
    handle((dir) => updateCollection(dir, id, revision, input)))
  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_LINK_NOTE, (_e, id: string, revision: number, noteId: string, linked: boolean): CollectionResult<CollectionRecord> =>
    handle((dir) => linkCollectionNote(dir, id, revision, noteId, linked)))
  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_DELETE, (_e, id: string, revision: number): CollectionResult<boolean> =>
    handle((dir) => deleteCollection(dir, id, revision)))
}
