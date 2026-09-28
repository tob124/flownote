import { newestFirst } from '../../shared/note-time'
import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, renameSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import type { Note, NotePatch } from '../../shared/types'
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
  const last = lastAllocatedByDir.get(notesDir) ?? 0
  let candidate = Math.max(Date.now(), last + 1)
  const occupied = (id: number): boolean => [
    notesDir, join(notesDir, '..', 'trash', 'notes'), join(notesDir, '..', 'trash', 'deleted')
  ].some((dir) => existsSync(join(dir, `${id}.json`)))
  while (occupied(candidate)) candidate++
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
      updated_at_ms: createdAtMs,
      revision: 1,
      ...(captureId ? { capture_id: captureId } : {}),
      ai_status: aiStatus,
      retry_count: 0,
      favorite: false,
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
      if (existsSync(join(syncDir, 'trash', 'deleted', file))) continue
      try {
        const raw = readFileSync(join(notesDir, file), 'utf-8')
        const note = JSON.parse(raw.replace(/^\uFEFF/, ''))
        if (typeof note.id === 'string' && typeof note.raw_content === 'string' && typeof note.created_at === 'string') notes.push(note)
      } catch {
        // A partially synced or damaged file must not hide other notes.
      }
    }
  } catch (error) {
    throw new Error(`无法读取笔记目录：${String(error)}`)
  }
  notes.sort(newestFirst)
  return notes
}

export class NoteConflictError extends Error {}

export function updateNote(note: Note): void {
  const syncDir = getSyncDir()
  if (!syncDir) throw new Error('sync_dir not configured')
  const current = loadNote(note.id, syncDir)
  if (!current) throw new Error(`Note ${note.id} no longer exists`)
  if ((note.revision ?? 0) !== (current.revision ?? 0)) {
    throw new NoteConflictError('笔记已被其他操作更新，请重新读取后保存')
  }
  const filePath = join(syncDir, 'notes', `${note.id}.json`)
  atomicWrite(filePath, JSON.stringify({
    ...note, revision: (current.revision ?? 0) + 1, updated_at_ms: Date.now()
  }, null, 2))
}

/** Revision-checked user edits never replace fields omitted from the patch. */
export function patchNote(
  syncDir: string, id: string, expectedRevision: number, patch: NotePatch
): Note {
  if (!NOTE_ID.test(id) || !patch || typeof patch !== 'object') throw new Error('Invalid note patch')
  const current = loadNote(id, syncDir)
  if (!current) throw new Error(`Note ${id} no longer exists`)
  if (!Number.isSafeInteger(expectedRevision) || (current.revision ?? 0) !== expectedRevision) {
    throw new NoteConflictError('笔记已有更新，请刷新后再保存；草稿会保留')
  }
  const next: Note = { ...current }
  const manual = new Set(current.manual_fields ?? [])
  if (patch.raw_content !== undefined) {
    if (typeof patch.raw_content !== 'string' || patch.raw_content.length > 1_000_000) throw new Error('笔记正文无效或过长')
    if (patch.raw_content !== current.raw_content) {
      next.raw_content = patch.raw_content
      next.ai_status = 'pending'
      next.retry_count = 0
    }
  }
  for (const field of ['title', 'summary', 'category'] as const) {
    if (patch[field] === undefined) continue
    if (typeof patch[field] !== 'string' || patch[field]!.length > 2000) throw new Error(`${field} 无效或过长`)
    next[field] = patch[field]!.trim()
    manual.add(field)
  }
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags) || patch.tags.length > 50 || patch.tags.some((tag) => typeof tag !== 'string' || tag.length > 100)) {
      throw new Error('标签无效或过多')
    }
    next.tags = [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))]
    manual.add('tags')
  }
  if (patch.favorite !== undefined) {
    if (typeof patch.favorite !== 'boolean') throw new Error('收藏状态无效')
    next.favorite = patch.favorite
  }
  if (patch.attachments !== undefined) {
    if (!Array.isArray(patch.attachments) || patch.attachments.some((file) =>
      !file || typeof file.storedName !== 'string' || /[\\/]/.test(file.storedName) || file.storedName.includes('..'))) {
      throw new Error('附件列表无效')
    }
    next.attachments = patch.attachments
  }
  next.manual_fields = [...manual]
  next.revision = expectedRevision + 1
  next.updated_at_ms = Date.now()
  atomicWrite(join(syncDir, 'notes', `${id}.json`), JSON.stringify(next, null, 2))
  return next
}

export function loadNote(id: string, syncDir = getSyncDir()): Note | null {
  if (!syncDir || !NOTE_ID.test(id)) return null
  const filePath = join(syncDir, 'notes', `${id}.json`)
  if (existsSync(join(syncDir, 'trash', 'deleted', `${id}.json`))) return null
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
      atomicWrite(filePath, JSON.stringify({
        ...current, ai_status: 'pending', retry_count: 0,
        revision: (current.revision ?? 0) + 1, updated_at_ms: Date.now()
      }, null, 2))
    }
    return 'stale'
  }
  if (!existsSync(filePath)) return 'missing'
  const allowedPatch = { ...patch }
  for (const field of current.manual_fields ?? []) delete allowedPatch[field]
  atomicWrite(filePath, JSON.stringify({
    ...current, ...allowedPatch,
    revision: (current.revision ?? 0) + 1, updated_at_ms: Date.now()
  }, null, 2))
  return 'applied'
}

export function searchNotes(keyword: string, syncDir = getSyncDir()): Note[] {
  if (!syncDir) throw new Error('sync_dir not configured')
  const notes = loadAllNotesFrom(syncDir)
  if (!keyword.trim()) return notes
  const kw = keyword.toLowerCase()
  return notes.filter((note) => [
    note.title, note.raw_content, note.summary, note.category, ...(note.tags || [])
  ].some((field) => typeof field === 'string' && field.toLowerCase().includes(kw)))
}

function trashDir(syncDir: string): string {
  const dir = join(syncDir, 'trash', 'notes')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** The existing delete action moves a Note to a recoverable trash folder. */
export function deleteNote(id: string, syncDir = getSyncDir()): boolean {
  if (!syncDir || !NOTE_ID.test(id)) return false
  const source = join(syncDir, 'notes', `${id}.json`)
  const target = join(trashDir(syncDir), `${id}.json`)
  if (!existsSync(source) || existsSync(target) ||
      existsSync(join(syncDir, 'trash', 'deleted', `${id}.json`))) return false
  renameSync(source, target)
  return true
}

export function listTrashedNotes(syncDir: string): Note[] {
  const dir = trashDir(syncDir)
  const notes: Note[] = []
  for (const name of readdirSync(dir)) {
    if (!/^\d{13,}\.json$/.test(name)) continue
    try {
      const note = JSON.parse(readFileSync(join(dir, name), 'utf-8')) as Note
      if (note.id === name.slice(0, -5)) notes.push(note)
    } catch { /* A damaged sync file must not hide other recoverable notes. */ }
  }
  return notes.sort(newestFirst)
}

export function restoreNote(syncDir: string, id: string): boolean {
  if (!NOTE_ID.test(id)) return false
  const source = join(trashDir(syncDir), `${id}.json`)
  const targetDir = join(syncDir, 'notes')
  mkdirSync(targetDir, { recursive: true })
  const target = join(targetDir, `${id}.json`)
  if (!existsSync(source) || existsSync(target) ||
      existsSync(join(syncDir, 'trash', 'deleted', `${id}.json`))) return false
  renameSync(source, target)
  return true
}

export function deleteNoteForever(syncDir: string, id: string): boolean {
  if (!NOTE_ID.test(id)) return false
  const source = join(trashDir(syncDir), `${id}.json`)
  if (!existsSync(source)) return false
  const tombstoneDir = join(syncDir, 'trash', 'deleted')
  mkdirSync(tombstoneDir, { recursive: true })
  atomicWrite(join(tombstoneDir, `${id}.json`), JSON.stringify({ id, deleted_at_ms: Date.now() }))
  unlinkSync(source)
  return true
}
