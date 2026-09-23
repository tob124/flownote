import type { Note } from '../../shared/types'

export interface NoteDraft {
  baseRevision: number
  raw_content: string
  title: string
  summary: string
  category: string
  tags: string
}
function key(library: string, noteId: string): string {
  return `flownote:note-draft:${library}:${noteId}`
}
export function freshNoteDraft(note: Note): NoteDraft {
  return {
    baseRevision: note.revision ?? 0, raw_content: note.raw_content,
    title: note.title, summary: note.summary ?? '', category: note.category,
    tags: note.tags.join(', ')
  }
}
export function loadNoteDraft(
  storage: Pick<Storage, 'getItem'>, library: string, note: Note
): NoteDraft | null {
  try {
    const raw = storage.getItem(key(library, note.id))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<NoteDraft>
    if (!Number.isSafeInteger(value.baseRevision) ||
      ['raw_content', 'title', 'summary', 'category', 'tags'].some((field) =>
        typeof value[field as keyof NoteDraft] !== 'string')) return null
    return value as NoteDraft
  } catch { return null }
}
export function saveNoteDraft(
  storage: Pick<Storage, 'setItem'>, library: string, noteId: string, draft: NoteDraft
): void {
  try { storage.setItem(key(library, noteId), JSON.stringify(draft)) } catch { /* editor remains usable */ }
}
export function clearNoteDraft(
  storage: Pick<Storage, 'removeItem'>, library: string, noteId: string
): void {
  try { storage.removeItem(key(library, noteId)) } catch { /* ignore */ }
}
