import type { Note } from './types'
type DatedNote = Pick<Note, 'id' | 'created_at' | 'created_at_ms'>
export function readEffectiveTime(note: DatedNote): number {
  const explicit = Number(note.created_at_ms)
  if (Number.isSafeInteger(explicit) && explicit > 0 && explicit <= 8.64e15) return explicit
  if (/^\d{13}$/.test(note.id)) {
    const value = Number(note.id)
    if (new Date(value).toISOString().slice(0, 10) === note.created_at) return value
  }
  const fallback = Date.parse(note.created_at)
  return Number.isFinite(fallback) ? fallback : 0
}
export function noteDate(note: DatedNote): string {
  return new Date(readEffectiveTime(note)).toISOString().slice(0, 10)
}
export function newestFirst(a: DatedNote, b: DatedNote): number {
  return readEffectiveTime(b) - readEffectiveTime(a) || b.id.localeCompare(a.id)
}
