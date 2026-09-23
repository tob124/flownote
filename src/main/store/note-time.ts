import type { Note } from '../../shared/types'

/** Read old numeric IDs and dates without rewriting the original files. */
export function readEffectiveTime(note: Pick<Note, 'id' | 'created_at' | 'created_at_ms'>): number {
  if (Number.isSafeInteger(note.created_at_ms) && Number(note.created_at_ms) > 0) {
    return Number(note.created_at_ms)
  }
  if (/^\d{13,}$/.test(note.id)) {
    const fromId = Number(note.id)
    if (Number.isSafeInteger(fromId) && fromId > 0) return fromId
  }
  const fromDate = Date.parse(note.created_at)
  return Number.isFinite(fromDate) ? fromDate : 0
}
