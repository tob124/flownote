import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { basename, join } from 'path'
import { atomicWrite } from './atomic-file'
import { saveNote } from './note-store'

const BATCH_FILE = /^[0-9a-f-]{36}\.txt$/
const CAPTURE_ID = /^[0-9a-f-]{36}-\d+$/

export interface ImportHooks {
  onBatchStart?: (count: number) => void
  onNoteCreated?: (id: string) => void
  /** Fault-injection points for replay tests. */
  beforeNoteSaved?: (captureId: string) => void
  afterNoteSaved?: (id: string) => void
}

function importsDir(syncDir: string): string {
  const dir = join(syncDir, 'imports')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, 'receipts'), { recursive: true })
  mkdirSync(join(dir, 'archive'), { recursive: true })
  return dir
}

function receiptPath(syncDir: string, captureId: string): string {
  if (!CAPTURE_ID.test(captureId)) throw new Error('Invalid capture ID')
  return join(importsDir(syncDir), 'receipts', `${captureId}.json`)
}

export function hasReceipt(syncDir: string, captureId: string): boolean {
  return existsSync(receiptPath(syncDir, captureId))
}

function saveReceipt(syncDir: string, captureId: string, noteId: string): void {
  const path = receiptPath(syncDir, captureId)
  try {
    atomicWrite(path, JSON.stringify({ capture_id: captureId, note_id: noteId }), {
      createOnly: true
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

/** Move an old v2 processing file into the recoverable batch area. */
export function captureLegacyProcessing(syncDir: string): void {
  const oldPath = join(syncDir, 'processing.txt')
  if (existsSync(oldPath)) renameSync(oldPath, join(importsDir(syncDir), `${randomUUID()}.txt`))
}

/** Freeze the current inbox; a later failure leaves the immutable batch to retry. */
export function captureInbox(syncDir: string): void {
  const inboxPath = join(syncDir, 'inbox.txt')
  if (!existsSync(inboxPath)) {
    writeFileSync(inboxPath, '', { encoding: 'utf-8', flag: 'wx' })
    return
  }
  if (statSync(inboxPath).size === 0) return
  renameSync(inboxPath, join(importsDir(syncDir), `${randomUUID()}.txt`))
  // A failed recreation is recoverable: the batch is already safe on disk.
  writeFileSync(inboxPath, '', { encoding: 'utf-8', flag: 'wx' })
}

export function splitImportBlocks(content: string): string[] {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
}

/** A transient or malformed note read must never look like an empty library on replay. */
function scanCaptureIds(syncDir: string): Map<string, string> {
  const notesDir = join(syncDir, 'notes')
  mkdirSync(notesDir, { recursive: true })
  const byCapture = new Map<string, string>()
  for (const filename of readdirSync(notesDir)) {
    if (!/^\d{13,}\.json$/.test(filename)) continue
    const note = JSON.parse(readFileSync(join(notesDir, filename), 'utf-8')) as {
      id?: string
      capture_id?: string
    }
    if (note.capture_id) byCapture.set(note.capture_id, note.id || filename.slice(0, -5))
  }
  return byCapture
}

/** Import one immutable batch. Receipts remain after archiving to prevent resurrection. */
export function importBatch(syncDir: string, batchId: string, hooks: ImportHooks = {}): string[] {
  if (!BATCH_FILE.test(`${batchId}.txt`)) throw new Error('Invalid import batch ID')
  const dir = importsDir(syncDir)
  const sourcePath = join(dir, `${batchId}.txt`)
  const blocks = splitImportBlocks(readFileSync(sourcePath, 'utf-8'))
  hooks.onBatchStart?.(blocks.length)

  const needsRecovery = blocks.some((_, index) => !hasReceipt(syncDir, `${batchId}-${index}`))
  const byCapture = needsRecovery ? scanCaptureIds(syncDir) : new Map<string, string>()
  const created: string[] = []
  for (let index = 0; index < blocks.length; index++) {
    const captureId = `${batchId}-${index}`
    if (hasReceipt(syncDir, captureId)) continue
    const existingId = byCapture.get(captureId)
    if (existingId) {
      // Rebuild the receipt after a crash between Note commit and receipt commit.
      saveReceipt(syncDir, captureId, existingId)
      continue
    }
    hooks.beforeNoteSaved?.(captureId)
    const noteId = saveNote(syncDir, blocks[index], 'Inbox', [], 'pending', captureId)
    byCapture.set(captureId, noteId)
    created.push(noteId)
    hooks.afterNoteSaved?.(noteId)
    saveReceipt(syncDir, captureId, noteId)
    hooks.onNoteCreated?.(noteId)
  }
  renameSync(sourcePath, join(dir, 'archive', basename(sourcePath)))
  return created
}

/** Replay active snapshots until every block has a durable receipt. */
export function recoverImports(syncDir: string, hooks: ImportHooks = {}): string[] {
  const dir = importsDir(syncDir)
  const created: string[] = []
  for (const filename of readdirSync(dir).filter((name) => BATCH_FILE.test(name)).sort()) {
    created.push(...importBatch(syncDir, filename.slice(0, -4), hooks))
  }
  return created
}
