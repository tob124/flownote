import { ipcMain } from 'electron'
import { loadAllNotes, saveNote, updateNote, patchNote, NoteConflictError, searchNotes, deleteNote, listTrashedNotes, restoreNote, deleteNoteForever } from '../store/note-store'
import { loadConfig } from '../store/config-store'
import { IPC_CHANNELS } from '../../shared/types'
import type { Note, NotePatch, NotePatchResult } from '../../shared/types'

export function registerNotesIpc(): void {
  ipcMain.handle(IPC_CHANNELS.NOTES_LOAD_ALL, () => loadAllNotes())

  ipcMain.handle(IPC_CHANNELS.NOTES_SEARCH, (_e, keyword: string) => searchNotes(keyword))

  ipcMain.handle(IPC_CHANNELS.NOTES_CREATE, (_e, content: string) => {
    const config = loadConfig()
    const syncDir = config.sync_dir
    if (!syncDir) throw new Error('sync_dir not configured')
    return saveNote(syncDir, content)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES_UPDATE, (_e, note: Note) => {
    updateNote(note)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES_PATCH, (_e, id: string, revision: number, patch: NotePatch): NotePatchResult => {
    try {
      const syncDir = loadConfig().sync_dir
      if (!syncDir) return { ok: false, error: { code: 'INVALID', message: '请先设置同步目录' } }
      return { ok: true, value: patchNote(syncDir, id, revision, patch) }
    } catch (error) {
      if (error instanceof NoteConflictError) {
        return { ok: false, error: { code: 'CONFLICT', message: error.message } }
      }
      const message = String(error)
      const code = message.includes('no longer exists') ? 'NOT_FOUND' :
        message.includes('无效') || message.includes('Invalid') ? 'INVALID' : 'IO'
      return { ok: false, error: { code, message } }
    }
  })
  ipcMain.handle(IPC_CHANNELS.NOTES_DELETE, (_e, id: string) => deleteNote(id))
  ipcMain.handle(IPC_CHANNELS.NOTES_TRASH_LIST, () => {
    const syncDir = loadConfig().sync_dir
    if (!syncDir) throw new Error('sync_dir not configured')
    return listTrashedNotes(syncDir)
  })
  ipcMain.handle(IPC_CHANNELS.NOTES_RESTORE, (_e, id: string) => {
    const syncDir = loadConfig().sync_dir
    return syncDir ? restoreNote(syncDir, id) : false
  })
  ipcMain.handle(IPC_CHANNELS.NOTES_DELETE_FOREVER, (_e, id: string) => {
    const syncDir = loadConfig().sync_dir
    return syncDir ? deleteNoteForever(syncDir, id) : false
  })
}
