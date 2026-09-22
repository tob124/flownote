import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'
import { getSyncDir, saveNote } from './note-store'
import { pokeClassifier } from '../ipc/classifier.ipc'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'

export function processInbox(): void {
  const syncDir = getSyncDir()
  if (!syncDir) throw new Error('sync_dir not configured')

  const inboxPath = join(syncDir, 'inbox.txt')
  const processingPath = join(syncDir, 'processing.txt')

  if (!existsSync(inboxPath)) return

  try {
    renameSync(inboxPath, processingPath)
  } catch {
    return
  }

  writeFileSync(inboxPath, '', 'utf-8')

  try {
    const content = readFileSync(processingPath, 'utf-8')
    // 统一换行符: 去 BOM，CRLF / 单独 CR 归一化为 LF，空白行按块分隔
    const normalized = content
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
    const blocks = normalized.split(/\n[ \t]*\n/).filter((b) => b.trim())

    // 通知前端开始处理
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send(IPC_CHANNELS.INBOX_PROCESSING_START, blocks.length)
    }

    for (const block of blocks) {
      const noteId = saveNote(syncDir, block.trim())
      // 每创建一个笔记后通知前端
      if (win) {
        win.webContents.send(IPC_CHANNELS.INBOX_NOTE_CREATED, noteId)
      }
    }

    // 有新笔记时立即唤醒分类器，不必等 15 秒轮询
    if (blocks.length > 0) pokeClassifier()

    // 通知前端处理完成
    if (win) {
      win.webContents.send(IPC_CHANNELS.INBOX_PROCESSING_END)
    }
  } finally {
    try {
      unlinkSync(processingPath)
    } catch {
      // ignore
    }
  }
}
