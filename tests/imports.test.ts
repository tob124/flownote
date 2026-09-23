import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { captureInbox, captureLegacyProcessing, hasReceipt, recoverImports, splitImportBlocks } from '../src/main/store/import-store'
import { loadAllNotesFrom } from '../src/main/store/note-store'

const dirs: string[] = []
function library(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-import-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function activeBatch(dir: string): string {
  return readdirSync(join(dir, 'imports')).find((name) => name.endsWith('.txt'))!
}

describe('recoverable inbox import', () => {
  it('normalizes BOM and all newline styles while retaining equal-content blocks', () => {
    expect(splitImportBlocks('\uFEFFsame\r\n\r\nsame\r\r\nthird\n \t\nfourth'))
      .toEqual(['same', 'same', 'third', 'fourth'])
  })

  for (const failAt of [0, 1, 2]) {
    it(`replays without duplicates after failing just before block ${failAt + 1}`, () => {
      const dir = library()
      writeFileSync(join(dir, 'inbox.txt'), 'first\n\nsecond\n\nthird')
      captureInbox(dir)
      let index = 0
      expect(() => recoverImports(dir, {
        beforeNoteSaved: () => {
          if (index++ === failAt) throw new Error('power loss')
        }
      })).toThrow('power loss')
      expect(existsSync(join(dir, 'imports', activeBatch(dir)))).toBe(true)
      recoverImports(dir)
      recoverImports(dir)
      expect(loadAllNotesFrom(dir).map((note) => note.raw_content).sort())
        .toEqual(['first', 'second', 'third'])
      expect(readdirSync(join(dir, 'imports', 'archive'))).toHaveLength(1)
    })
  }

  it('rebuilds a missing receipt after the Note was saved and keeps deletions deleted', () => {
    const dir = library()
    writeFileSync(join(dir, 'inbox.txt'), 'same\n\nsame')
    captureInbox(dir)
    const batch = activeBatch(dir)
    expect(() => recoverImports(dir, {
      afterNoteSaved: () => { throw new Error('crash before receipt') }
    })).toThrow('crash before receipt')
    expect(loadAllNotesFrom(dir)).toHaveLength(1)
    recoverImports(dir)
    const notes = loadAllNotesFrom(dir)
    expect(notes).toHaveLength(2)
    expect(new Set(notes.map((note) => note.capture_id)).size).toBe(2)
    expect(hasReceipt(dir, notes[0].capture_id!)).toBe(true)
    expect(hasReceipt(dir, notes[1].capture_id!)).toBe(true)

    const first = notes[0]
    rmSync(join(dir, 'notes', `${first.id}.json`))
    renameSync(join(dir, 'imports', 'archive', batch), join(dir, 'imports', batch))
    recoverImports(dir)
    expect(loadAllNotesFrom(dir)).toHaveLength(1)
  })

  it('keeps the batch when note state cannot be read safely', () => {
    const dir = library()
    writeFileSync(join(dir, 'inbox.txt'), 'one')
    captureInbox(dir)
    const batch = activeBatch(dir)
    const notesDir = join(dir, 'notes')
    mkdirSync(notesDir)
    const damaged = join(notesDir, '1700000000000.json')
    writeFileSync(damaged, '{partial')
    expect(() => recoverImports(dir)).toThrow()
    expect(existsSync(join(dir, 'imports', batch))).toBe(true)
    rmSync(damaged)
    recoverImports(dir)
    expect(loadAllNotesFrom(dir)).toHaveLength(1)
  })

  it('recovers a legacy processing file before taking new inbox content', () => {
    const dir = library()
    writeFileSync(join(dir, 'processing.txt'), 'old')
    writeFileSync(join(dir, 'inbox.txt'), 'new')
    captureLegacyProcessing(dir)
    captureInbox(dir)
    recoverImports(dir)
    expect(loadAllNotesFrom(dir).map((note) => note.raw_content).sort()).toEqual(['new', 'old'])
    expect(existsSync(join(dir, 'processing.txt'))).toBe(false)
  })
})
