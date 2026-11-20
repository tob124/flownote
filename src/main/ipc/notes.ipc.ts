import { ipcMain } from 'electron'
import { getSyncDir, loadNote, loadAllNotes, saveNote, updateNote, patchNote, validateAttachments, NoteConflictError, searchNotes, deleteNote, listTrashedNotes, restoreNote, deleteNoteForever } from '../store/note-store'
import { loadConfig } from '../store/config-store'
import { fetchWebClip } from '../services/deepseek-fetch'
import { attachmentPath, saveWebClip } from '../store/file-store'
import { IPC_CHANNELS } from '../../shared/types'
import type { Note, NotePatch, NotePatchResult } from '../../shared/types'

export function registerNotesIpc(): void {
  let clipping = false
  ipcMain.handle('notes:clip-web', async (_e, url: unknown) => {
    const config = loadConfig()
    if (!config.sync_dir) throw new Error('请先设置同步目录')
    if (config.api_provider !== 'DeepSeek' || !config.api_key?.trim()) {
      throw new Error('请先在设置中选择 DeepSeek 并填写 API 密钥')
    }
    if (clipping) throw new Error('已有一项网页剪藏正在进行')
    clipping = true
    try {
      const clip = await fetchWebClip(config.api_key.trim(), url)
      if (getSyncDir() !== config.sync_dir) throw new Error('同步目录已切换，请重新剪藏')
      return saveWebClip(config.sync_dir, clip)
    } finally {
      clipping = false
    }
  })
  ipcMain.handle('notes:create-record', (_e, content: string, attachments: unknown = []) => {
    const dir = getSyncDir()
    validateAttachments(attachments)
    if (!dir || typeof content !== 'string' || content.length > 1000000 || (!content.trim() && !attachments.length)) {
      throw new Error('请填写正文或添加附件')
    }
    if (attachments.some(file => !attachmentPath(dir, file.storedName))) {
      throw new Error('有附件文件缺失，请重新添加或移除后再保存')
    }
    const hasMaterial = Boolean(content.trim()) || attachments.some(file => file.summary?.trim())
    const id = saveNote(dir, content, 'Inbox', [], hasMaterial ? 'pending' : 'done', undefined, attachments)
    return loadNote(id,dir)!
  })
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
