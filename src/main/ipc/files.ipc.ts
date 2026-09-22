import { ipcMain, dialog, shell } from 'electron'
import { saveFiles, checkFiles, attachmentPath } from '../store/file-store'
import { loadNote, updateNote, getSyncDir } from '../store/note-store'
import { IPC_CHANNELS } from '../../shared/types'
import type { NoteFile, Note } from '../../shared/types'

export function registerFilesIpc(): void {
  ipcMain.handle(IPC_CHANNELS.FILES_SELECT, async (): Promise<NoteFile[]> => {
    const syncDir = getSyncDir()
    if (!syncDir) return []
    const result = await dialog.showOpenDialog({
      title: '选择要附加到笔记的文件',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return saveFiles(syncDir, result.filePaths)
  })

  ipcMain.handle(
    IPC_CHANNELS.FILES_CHECK,
    (_e, storedNames: string[]): Record<string, boolean> => {
      const syncDir = getSyncDir()
      if (!syncDir) return {}
      return checkFiles(syncDir, storedNames || [])
    }
  )

  ipcMain.handle(IPC_CHANNELS.FILES_OPEN, (_e, storedName: string): boolean => {
    const syncDir = getSyncDir()
    if (!syncDir) return false
    const path = attachmentPath(syncDir, storedName)
    if (!path) return false
    void shell.openPath(path)
    return true
  })

  ipcMain.handle(
    IPC_CHANNELS.FILES_GET_PATH,
    (_e, storedName: string): string | null => {
      const syncDir = getSyncDir()
      if (!syncDir) return null
      const path = attachmentPath(syncDir, storedName)
      // 使用自定义协议返回同源 URL，避免 file:// 跨源被拦截导致图片无法显示
      return path ? `flownote-file://${encodeURIComponent(path)}` : null
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.NOTE_ATTACH,
    (_e, noteId: string, files: NoteFile[]): boolean => {
      const note = loadNote(noteId)
      if (!note || !files || files.length === 0) return false
      const existing = Array.isArray(note.attachments) ? note.attachments : []
      const merged = [...existing]
      for (const f of files) {
        if (!merged.some((m) => m.storedName === f.storedName)) merged.push(f)
      }
      const updated: Note = { ...note, attachments: merged }
      updateNote(updated)
      return true
    }
  )
}