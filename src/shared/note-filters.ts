import type { Note } from './types'

export interface NoteFilters {
  category: string
  tags: string[]
  favoriteOnly: boolean
  status: '' | Note['ai_status']
  from: string
  to: string
  sort: 'newest' | 'oldest'
}
export const EMPTY_NOTE_FILTERS: NoteFilters = {
  category: '', tags: [], favoriteOnly: false, status: '', from: '', to: '', sort: 'newest'
}
/** Different filters combine with AND; multiple selected tags combine with OR. */
export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  return notes.filter((note) => {
    if (filters.category && note.category !== filters.category) return false
    if (filters.favoriteOnly && !note.favorite) return false
    if (filters.status && note.ai_status !== filters.status) return false
    if (filters.tags.length && !filters.tags.some((tag) => (note.tags || []).includes(tag))) return false
    if (filters.from && note.created_at < filters.from) return false
    if (filters.to && note.created_at > filters.to) return false
    return true
  }).sort((a, b) => filters.sort === 'newest'
    ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id))
}
