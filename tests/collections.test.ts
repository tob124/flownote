import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createCollection, deleteCollection, linkCollectionNote, listCollections, updateCollection
} from '../src/main/store/collection-store'
import { saveNote } from '../src/main/store/note-store'

const dirs: string[] = []
function library(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-collections-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('collections', () => {
  it('keeps one note in multiple topics without changing the note', () => {
    const dir = library()
    const id = saveNote(dir, 'A source note', '工作')
    const first = createCollection(dir, { name: '阅读' })
    const second = createCollection(dir, { name: '长期学习' })
    const linked = linkCollectionNote(dir, first.id, first.revision, id, true)
    linkCollectionNote(dir, second.id, second.revision, id, true)
    expect(linked.note_ids).toEqual([id])
    expect(listCollections(dir)).toHaveLength(2)
    expect(() => linkCollectionNote(dir, first.id, first.revision, id, false)).toThrow()
    expect(updateCollection(dir, first.id, linked.revision, { name: '精读', description: '读书与研究' }).name).toBe('精读')
    expect(deleteCollection(dir, second.id, 2)).toBe(true)
    expect(existsSync(join(dir, 'notes', `${id}.json`))).toBe(true)
  })
  it('rejects missing notes and invalid names', () => {
    const dir = library()
    expect(() => createCollection(dir, { name: ' ' })).toThrow()
    const item = createCollection(dir, { name: '真实主题' })
    expect(() => linkCollectionNote(dir, item.id, 1, '1700000000000', true)).toThrow()
    expect(listCollections(dir)[0].revision).toBe(1)
  })
})
