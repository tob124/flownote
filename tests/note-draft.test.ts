import { expect, it } from 'vitest'
import { clearNoteDraft, freshNoteDraft, loadNoteDraft, saveNoteDraft } from '../src/renderer/utils/note-draft'
import type { Note } from '../src/shared/types'

it('keeps a note draft tied to its original revision until explicitly cleared', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }
  }
  const note: Note = { id: '1700000000000', raw_content: 'old', created_at: '2026-09-23',
    ai_status: 'done', retry_count: 0, title: '', category: 'Inbox', tags: [], revision: 2 }
  const draft = { ...freshNoteDraft(note), raw_content: 'unsaved' }
  saveNoteDraft(storage, 'lib', note.id, draft)
  expect(loadNoteDraft(storage, 'lib', { ...note, revision: 3 })?.baseRevision).toBe(2)
  clearNoteDraft(storage, 'lib', note.id)
  expect(loadNoteDraft(storage, 'lib', note)).toBeNull()
})
