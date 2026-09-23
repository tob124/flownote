import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { atomicWrite } from '../src/main/store/atomic-file'
import { applyAiPatch, hashNoteInput, loadAllNotesFrom, loadNote, saveNote } from '../src/main/store/note-store'
import { readEffectiveTime } from '../src/main/store/note-time'
import type { Note } from '../src/shared/types'

const dirs: string[] = []
function library(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-storage-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'notes'))
  return dir
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('note storage', () => {
  it('saves 100 different notes with a fixed clock and tolerates clock rollback', () => {
    const dir = library()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const ids = Array.from({ length: 100 }, (_, index) => saveNote(dir, `note ${index}`))
    clock.mockReturnValue(1_600_000_000_000)
    const laterId = saveNote(dir, 'after rollback')
    expect(new Set([...ids, laterId]).size).toBe(101)
    expect(Number(laterId)).toBeGreaterThan(Number(ids[99]))
    expect(loadAllNotesFrom(dir)).toHaveLength(101)
    expect(loadNote(ids[49], dir)?.raw_content).toBe('note 49')
  })

  it('allocates after existing future-dated IDs in a newly opened library', () => {
    const dir = library()
    writeFileSync(join(dir, 'notes', '2700000000000.json'), '{}')
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    expect(saveNote(dir, 'new')).toBe('2700000000001')
  })

  it('preserves an existing file when replacement fails before commit', () => {
    const dir = library()
    const file = join(dir, 'notes', '1700000000000.json')
    writeFileSync(file, 'original', 'utf-8')
    expect(() => atomicWrite(file, 'replacement', {
      beforeCommit: () => { throw new Error('injected failure') }
    })).toThrow('injected failure')
    expect(readFileSync(file, 'utf-8')).toBe('original')
    expect(readdirSync(join(dir, 'notes'))).toEqual(['1700000000000.json'])
    expect(() => atomicWrite(file, 'replacement', { createOnly: true })).toThrow()
    expect(readFileSync(file, 'utf-8')).toBe('original')
  })

  it('does not overwrite a user edit or attachments with an old AI result', () => {
    const dir = library()
    const id = saveNote(dir, 'before')
    const originalHash = hashNoteInput('before')
    const file = join(dir, 'notes', `${id}.json`)
    const edited: Note = {
      ...loadNote(id, dir)!, raw_content: 'after', ai_status: 'processing',
      attachments: [{ name: 'photo.png', storedName: 'photo.png', ext: 'png', size: 12 }]
    }
    atomicWrite(file, JSON.stringify(edited))
    expect(applyAiPatch(dir, id, originalHash, { title: 'old title', ai_status: 'done' })).toBe('stale')
    const saved = loadNote(id, dir)!
    expect(saved.raw_content).toBe('after')
    expect(saved.attachments).toEqual(edited.attachments)
    expect(saved.title).toBe('')
    expect(saved.ai_status).toBe('pending')
    expect(applyAiPatch(dir, id, hashNoteInput('after'), { title: 'new title', ai_status: 'done' })).toBe('applied')
    expect(loadNote(id, dir)?.attachments).toEqual(edited.attachments)
  })

  it('reads legacy numeric notes and resolves effective time without migration', () => {
    const dir = library()
    const old: Note = {
      id: '1699999999999', raw_content: 'legacy', created_at: '2023-11-14',
      ai_status: 'done', retry_count: 0, title: '', category: 'Inbox', tags: []
    }
    writeFileSync(join(dir, 'notes', `${old.id}.json`), JSON.stringify(old))
    expect(loadAllNotesFrom(dir)).toEqual([old])
    expect(readEffectiveTime(old)).toBe(1_699_999_999_999)
    expect(readEffectiveTime({ ...old, created_at_ms: 12345 })).toBe(12345)
    expect(hashNoteInput('one\r\ntwo')).toBe(hashNoteInput('one\ntwo'))
  })
})
