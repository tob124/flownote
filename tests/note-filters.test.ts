import { describe, expect, it } from 'vitest'
import { EMPTY_NOTE_FILTERS, filterNotes } from '../src/shared/note-filters'
import type { Note } from '../src/shared/types'

function note(id: string, category: string, tags: string[], favorite: boolean, date: string, status: Note['ai_status']): Note {
  return { id, title: '', raw_content: '', summary: '', category, tags, favorite,
    created_at: date, ai_status: status, retry_count: 0 }
}
describe('note filters', () => {
  const notes = [
    note('1700000000001', '学习', ['英文'], true, '2026-09-01', 'done'),
    note('1700000000002', '学习', ['阅读'], true, '2026-09-15', 'done'),
    note('1700000000003', '工作', ['英文'], true, '2026-09-15', 'done'),
    note('1700000000004', '学习', ['英文'], false, '2026-09-30', 'pending')
  ]
  it('ANDs category, favorite, state and inclusive dates while ORing tags', () => {
    const result = filterNotes(notes, { ...EMPTY_NOTE_FILTERS, category: '学习',
      favoriteOnly: true, status: 'done', tags: ['英文', '阅读'],
      from: '2026-09-01', to: '2026-09-15' })
    expect(result.map((item) => item.id)).toEqual(['1700000000002', '1700000000001'])
  })
  it('sorts a copy oldest first without changing input order', () => {
    expect(filterNotes(notes, { ...EMPTY_NOTE_FILTERS, sort: 'oldest' }).map((item) => item.id))
      .toEqual(notes.map((item) => item.id))
    expect(notes[0].id).toBe('1700000000001')
  })
})
