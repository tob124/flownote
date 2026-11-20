import { ipcMain, dialog, shell } from 'electron'
import { saveFiles, checkFiles, attachmentPath } from '../store/file-store'
import { loadNote, patchNote, validateAttachments, getSyncDir } from '../store/note-store'
import { readFile, stat } from 'fs/promises'
import { summarizeSelectedFile } from '../services/attachment-summary'
import { IPC_CHANNELS } from '../../shared/types'
import type { NoteFile } from '../../shared/types'

export function registerFilesIpc(): void {
  ipcMain.handle(IPC_CHANNELS.FILES_SELECT, async (): Promise<NoteFile[]> => {
    const syncDir = getSyncDir()
    if (!syncDir) return []
    const result = await dialog.showOpenDialog({
      title: '选择要附加到笔记的文件',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return []
    if (getSyncDir() !== syncDir) throw new Error('同步目录已切换，请重新添加附件')
    const files = saveFiles(syncDir, result.filePaths)
    for (const [index, file] of files.entries()) files[index] = await summarizeSelectedFile(syncDir, file)
    if (getSyncDir() !== syncDir) throw new Error('同步目录已切换，请重新添加附件')
    return files
  })

  ipcMain.handle('files:read-web-clip', async (_e, noteId: string, storedName: string): Promise<string> => {
    const dir = getSyncDir()
    const file = loadNote(noteId, dir)?.attachments?.find(item => item.storedName === storedName)
    const path = file?.sourceUrl && file.ext === 'md' ? attachmentPath(dir, storedName) : null
    if (!path) throw new Error('网页附件缺失或不属于这条笔记')
    if ((await stat(path)).size > 2_100_000) throw new Error('附件过大，请使用默认应用打开')
    return readFile(path, 'utf8')
  })

  ipcMain.handle(
    IPC_CHANNELS.FILES_CHECK,
    (_e, storedNames: string[]): Record<string, boolean> => {
      const syncDir = getSyncDir()
      if (!syncDir) return {}
      return checkFiles(syncDir, storedNames || [])
    }
  )

  ipcMain.handle(IPC_CHANNELS.FILES_OPEN, async (_e, noteId: string, storedName: string, reveal = false): Promise<{ok:boolean;error?:string}> => {
    try {
      const syncDir = getSyncDir()
      const note = loadNote(noteId, syncDir)
      if (!note?.attachments?.some(a => a.storedName === storedName)) return {ok:false,error:'附件不属于这条笔记，或笔记已移除'}
      const path = attachmentPath(syncDir, storedName)
      if (!path) return {ok:false,error:'附件文件不存在，或文件路径无效'}
      if (reveal) { shell.showItemInFolder(path); return {ok:true} }
      const error = await shell.openPath(path)
      return error ? {ok:false,error:'系统无法打开附件，请检查默认应用或文件权限：'+error} : {ok:true}
    } catch (error) { return {ok:false,error:'打开附件失败：'+String(error)} }
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
      const dir = getSyncDir()
      validateAttachments(files)
      const note = loadNote(noteId, dir)
      if (!note || files.length === 0) return false
      if (files.some(file => !attachmentPath(dir, file.storedName))) return false
      const existing = Array.isArray(note.attachments) ? note.attachments : []
      const merged = [...existing]
      for (const f of files) {
        if (!merged.some((m) => m.storedName === f.storedName)) merged.push(f)
      }
      patchNote(dir, noteId, note.revision ?? 0, { attachments: merged })
      return true
    }
  )
}
