import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  artifactMarkdown, createArtifact, listArtifacts, renameArtifact, saveArtifactVersion
} from '../src/main/store/artifact-store'
import { createGoal } from '../src/main/store/goal-store'
import { patchNote, saveNote } from '../src/main/store/note-store'

const dirs: string[] = []
function library(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-artifact-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('artifact versions', () => {
  it('keeps immutable source snapshots while a note and newer version change', () => {
    const dir = library()
    const goal = createGoal(dir, { title: '提高阅读能力' })
    const noteId = saveNote(dir, 'Original observation')
    const note = patchNote(dir, noteId, 1, { title: 'Reading log' })
    const artifact = createArtifact(dir, { title: '我的复盘', goal_id: goal.id })
    const first = saveArtifactVersion(dir, artifact.id, 1, 'First judgement', [noteId])
    expect(first.versions[0].sources[0].excerpt).toBe('Original observation')
    patchNote(dir, noteId, note.revision!, { raw_content: 'Later correction' })
    const second = saveArtifactVersion(dir, artifact.id, first.revision, 'Revised judgement', [noteId])
    expect(second.versions.map((version) => version.body)).toEqual(['First judgement', 'Revised judgement'])
    expect(second.versions[0].sources[0].excerpt).toBe('Original observation')
    expect(second.versions[1].sources[0].excerpt).toBe('Later correction')
    expect(artifactMarkdown(second, second.versions[0].id)).toContain('Original observation')
    expect(artifactMarkdown(second, second.versions[0].id)).toContain(noteId)
    expect(() => saveArtifactVersion(dir, artifact.id, first.revision, 'stale', [])).toThrow()
    expect(renameArtifact(dir, artifact.id, second.revision, '更新后的复盘').title).toBe('更新后的复盘')
    expect(listArtifacts(dir)).toHaveLength(1)
  })
  it('rejects a missing source and does not append an empty version', () => {
    const dir = library()
    const item = createArtifact(dir, { title: 'Short essay' })
    expect(() => saveArtifactVersion(dir, item.id, 1, 'Body', ['1700000000000'])).toThrow()
    expect(() => saveArtifactVersion(dir, item.id, 1, ' ', [])).toThrow()
    expect(listArtifacts(dir)[0].versions).toEqual([])
  })
})
