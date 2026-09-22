import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Note } from '../../shared/types'
import { loadConfig } from './config-store'

export function getSyncDir(): string {
  return loadConfig().sync_dir || ''
}

export function ensureDirectories(syncDir: string): void {
  // 目录创建放在 try/catch 内，避免云盘（如坚果云）偶发文件锁导致启动崩溃
  try {
    const notesDir = join(syncDir, 'notes')
    const wikisDir = join(syncDir, 'wikis')
    const filesDir = join(syncDir, 'files')
    if (!existsSync(notesDir)) mkdirSync(notesDir, { recursive: true })
    if (!existsSync(wikisDir)) mkdirSync(wikisDir, { recursive: true })
    if (!existsSync(filesDir)) mkdirSync(filesDir, { recursive: true })
    const inboxPath = join(syncDir, 'inbox.txt')
    if (!existsSync(inboxPath)) writeFileSync(inboxPath, '', 'utf-8')
  } catch {
    // 忽略目录/文件创建失败，依赖后续具体操作按需创建
  }
}

export function saveNote(
  syncDir: string,
  content: string,
  category = 'Inbox',
  tags: string[] = [],
  aiStatus: Note['ai_status'] = 'pending'
): string {
  const id = String(Date.now())
  const note: Note = {
    id,
    raw_content: content,
    created_at: new Date().toISOString().slice(0, 10),
    ai_status: aiStatus,
    retry_count: 0,
    title: '',
    summary: '',
    category,
    tags
  }
  const filePath = join(syncDir, 'notes', `${id}.json`)
  writeFileSync(filePath, JSON.stringify(note, null, 2), 'utf-8')
  return id
}

export function loadAllNotes(): Note[] {
  const syncDir = getSyncDir()
  if (!syncDir) throw new Error('sync_dir not configured')

  const notesDir = join(syncDir, 'notes')
  if (!existsSync(notesDir)) return []

  const notePattern = /^\d{13,}\.json$/
  const notes: Note[] = []

  try {
    const files = readdirSync(notesDir)
    for (const file of files) {
      if (!notePattern.test(file)) continue
      try {
        const raw = readFileSync(join(notesDir, file), 'utf-8')
        notes.push(JSON.parse(raw))
      } catch {
        // skip corrupted files
      }
    }
  } catch {
    return []
  }

  notes.sort((a, b) => b.id.localeCompare(a.id))
  return notes
}

export function updateNote(note: Note): void {
  const syncDir = getSyncDir()
  if (!syncDir) return
  const filePath = join(syncDir, 'notes', `${note.id}.json`)
  writeFileSync(filePath, JSON.stringify(note, null, 2), 'utf-8')
}

export function loadNote(id: string): Note | null {
  const syncDir = getSyncDir()
  if (!syncDir) return null
  const filePath = join(syncDir, 'notes', `${id}.json`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function searchNotes(keyword: string): Note[] {
  const notes = loadAllNotes()
  if (!keyword.trim()) return notes
  const kw = keyword.toLowerCase()
  return notes.filter(
    (n) =>
      (n.title && n.title.toLowerCase().includes(kw)) ||
      (n.raw_content && n.raw_content.toLowerCase().includes(kw))
  )
}

export function deleteNote(id: string): boolean {
  const syncDir = getSyncDir()
  if (!syncDir) return false
  const filePath = join(syncDir, 'notes', `${id}.json`)
  try {
    unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}
