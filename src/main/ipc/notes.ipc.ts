import { ipcMain } from 'electron'
import { loadAllNotes, saveNote, updateNote, searchNotes, deleteNote } from '../store/note-store'
import { loadConfig } from '../store/config-store'
import { IPC_CHANNELS } from '../../shared/types'
import type { Note } from '../../shared/types'

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

  ipcMain.handle(IPC_CHANNELS.NOTES_DELETE, (_e, id: string) => deleteNote(id))
}
