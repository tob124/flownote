import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import type { Note } from '../../shared/types'
import { loadConfig } from './config-store'
import { atomicWrite } from './atomic-file'

const NOTE_ID = /^\d{13,}$/
const lastAllocatedByDir = new Map<string, number>()

export function getSyncDir(): string {
  return loadConfig().sync_dir || ''
}

export function ensureDirectories(syncDir: string): void {
  // Directory creation may be blocked temporarily by the sync client.
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
    // A concrete later operation will retry or report its own error.
  }
}

/** Keep old numeric IDs while preventing collisions in rapid or clock-skewed saves. */
export function allocateNoteId(notesDir: string): string {
  let last = lastAllocatedByDir.get(notesDir)
  if (last === undefined) {
    last = 0
    for (const name of readdirSync(notesDir)) {
      if (!/^\d{13,}\.json$/.test(name)) continue
      const id = Number(name.slice(0, -5))
      if (Number.isSafeInteger(id)) last = Math.max(last, id)
    }
  }
  let candidate = Math.max(Date.now(), last + 1)
  while (existsSync(join(notesDir, `${candidate}.json`))) candidate++
  if (!Number.isSafeInteger(candidate)) throw new Error('Note ID space exhausted')
  lastAllocatedByDir.set(notesDir, candidate)
  return String(candidate)
}

export function hashNoteInput(content: string): string {
  return createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex')
}

export function saveNote(
  syncDir: string,
  content: string,
  category = 'Inbox',
  tags: string[] = [],
  aiStatus: Note['ai_status'] = 'pending',
  captureId?: string
): string {
  const notesDir = join(syncDir, 'notes')
  mkdirSync(notesDir, { recursive: true })
  for (let attempt = 0; attempt < 1000; attempt++) {
    const id = allocateNoteId(notesDir)
    const createdAtMs = Date.now()
    const note: Note = {
      id,
      raw_content: content,
      created_at: new Date(createdAtMs).toISOString().slice(0, 10),
      created_at_ms: createdAtMs,
      ...(captureId ? { capture_id: captureId } : {}),
      ai_status: aiStatus,
      retry_count: 0,
      title: '',
      summary: '',
      category,
      tags
    }
    try {
      atomicWrite(join(notesDir, `${id}.json`), JSON.stringify(note, null, 2), {
        createOnly: true
      })
      return id
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('Could not allocate a unique Note ID')
}

export function loadAllNotes(): Note[] {
  const syncDir = getSyncDir()
  if (!syncDir) throw new Error('sync_dir not configured')
  return loadAllNotesFrom(syncDir)
}

export function loadAllNotesFrom(syncDir: string): Note[] {
  const notesDir = join(syncDir, 'notes')
  if (!existsSync(notesDir)) return []
  const notes: Note[] = []
  try {
    for (const file of readdirSync(notesDir)) {
      if (!/^\d{13,}\.json$/.test(file)) continue
      try {
        const raw = readFileSync(join(notesDir, file), 'utf-8')
        notes.push(JSON.parse(raw))
      } catch {
        // A partially synced or damaged file must not hide other notes.
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
  if (!syncDir) throw new Error('sync_dir not configured')
  if (!NOTE_ID.test(note.id)) throw new Error('Invalid Note ID')
  const filePath = join(syncDir, 'notes', `${note.id}.json`)
  if (!existsSync(filePath)) throw new Error(`Note ${note.id} no longer exists`)
  atomicWrite(filePath, JSON.stringify(note, null, 2))
}

export function loadNote(id: string, syncDir = getSyncDir()): Note | null {
  if (!syncDir || !NOTE_ID.test(id)) return null
  const filePath = join(syncDir, 'notes', `${id}.json`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export type AiPatch = Pick<Note, 'title' | 'summary' | 'category' | 'tags' | 'ai_status' | 'retry_count'>

/** Update only AI-owned fields on the newest record after verifying the input. */
export function applyAiPatch(
  syncDir: string,
  id: string,
  expectedInputHash: string,
  patch: Partial<AiPatch>
): 'applied' | 'stale' | 'missing' {
  const current = loadNote(id, syncDir)
  if (!current) return 'missing'
  const filePath = join(syncDir, 'notes', `${id}.json`)
  if (hashNoteInput(current.raw_content) !== expectedInputHash) {
    if (current.ai_status === 'processing') {
      atomicWrite(filePath, JSON.stringify({ ...current, ai_status: 'pending', retry_count: 0 }, null, 2))
    }
    return 'stale'
  }
  if (!existsSync(filePath)) return 'missing'
  atomicWrite(filePath, JSON.stringify({ ...current, ...patch }, null, 2))
  return 'applied'
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
  if (!syncDir || !NOTE_ID.test(id)) return false
  const filePath = join(syncDir, 'notes', `${id}.json`)
  try {
    unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}
