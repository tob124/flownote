import { BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { saveFiles, checkFiles, attachmentPath } from '../store/file-store'
import { loadNote, patchNote, validateAttachments, getSyncDir } from '../store/note-store'
import { readAttachmentPreview } from '../services/attachment-preview'
import { summarizeSelectedFile } from '../services/attachment-summary'
import { openWithWindows } from '../services/windows-open-with'
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

  ipcMain.handle('files:preview', (_e, noteId: string, storedName: string) => readAttachmentPreview(noteId, storedName))

  ipcMain.handle(
    IPC_CHANNELS.FILES_CHECK,
    (_e, storedNames: string[]): Record<string, boolean> => {
      const syncDir = getSyncDir()
      if (!syncDir) return {}
      return checkFiles(syncDir, storedNames || [])
    }
  )

  let choosingApplication = false
  ipcMain.handle(IPC_CHANNELS.FILES_OPEN, async (event, noteId: string, storedName: string, action: boolean | 'choose' = false): Promise<{ok:boolean;error?:string;cancelled?:boolean;pickerClosed?:boolean}> => {
    try {
      const syncDir = getSyncDir()
      const note = loadNote(noteId, syncDir)
      if (!note?.attachments?.some(a => a.storedName === storedName)) return {ok:false,error:'附件不属于这条笔记，或笔记已移除'}
      const path = attachmentPath(syncDir, storedName)
      if (!path) return {ok:false,error:'附件文件不存在，或文件路径无效'}
      if (action === true) { shell.showItemInFolder(path); return {ok:true} }
      if (action === 'choose') {
        if (process.platform !== 'win32') return {ok:false,error:'此系统不支持从 FlowNote 选择打开方式'}
        if (choosingApplication) return {ok:false,error:'请先关闭已有的选择打开方式窗口'}
        choosingApplication = true
        try {
          const status = await openWithWindows(path, BrowserWindow.fromWebContents(event.sender)?.getNativeWindowHandle())
          return status === 'cancelled' ? {ok:false,cancelled:true} : {ok:true,pickerClosed:true}
        } catch (error) {
          return {ok:false,error:'Windows 无法打开此附件。' + (error instanceof Error && /^(Windows 错误|系统未)/.test(error.message) ? error.message : '请检查文件权限，或在资源管理器中尝试打开。')}
        } finally { choosingApplication = false }
      }
      const error = await shell.openPath(path)
      const suggestion = process.platform === 'win32' ? '可从附件菜单选择打开方式。' : '请检查默认应用或文件权限。'
      return error ? {ok:false,error:'系统无法打开附件。' + suggestion + ' ' + error} : {ok:true}
    } catch (error) { return {ok:false,error:'打开附件失败：'+String(error)} }
  })

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
