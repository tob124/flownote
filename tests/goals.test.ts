import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  GoalStoreError, addCheckIn, addCommitment, addDecision, createGoal,
  linkNote, linkGoalCollection, listGoals, updateCommitment, updateGoal
} from '../src/main/store/goal-store'
import { createCollection } from '../src/main/store/collection-store'
import { saveNote } from '../src/main/store/note-store'

const dirs: string[] = []
function library(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-goal-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('goal journal', () => {
  it('starts empty, saves a user goal, and reloads readable JSON without a model', () => {
    const dir = library()
    expect(listGoals(dir)).toEqual([])
    const goal = createGoal(dir, {
      title: '每周读两次英文文章', motivation: '长期阅读', review_on: '2026-10-01'
    })
    expect(goal.status).toBe('active')
    expect(goal.revision).toBe(1)
    expect(listGoals(dir)[0]).toEqual(goal)
    expect(JSON.parse(readFileSync(join(dir, 'goals', `${goal.id}.json`), 'utf-8')).title)
      .toBe(goal.title)
  })

  it('rejects stale revisions without modifying a newer user decision', () => {
    const dir = library()
    const first = createGoal(dir, { title: '写文章' })
    const changed = updateGoal(dir, first.id, first.revision, { motivation: '表达想法' })
    expect(() => addDecision(dir, first.id, first.revision, {
      choice: '每天写', reason: '先建立节奏'
    })).toThrowError(GoalStoreError)
    expect(listGoals(dir)[0].decisions).toEqual([])
    const decided = addDecision(dir, first.id, changed.revision, {
      choice: '每周写两次', reason: '更可持续', concern: '工作繁忙'
    })
    const reviewed = addCheckIn(dir, first.id, decided.revision, {
      observation: '这周没有记录，不能据此断定没有行动', outcome: 'unknown'
    })
    expect(reviewed.decisions[0].choice).toBe('每周写两次')
    expect(reviewed.check_ins[0].outcome).toBe('unknown')
    expect(reviewed.decisions[0].created_at_ms).toBe(decided.decisions[0].created_at_ms)
  })

  it('links an existing note explicitly and leaves the note untouched', () => {
    const dir = library()
    const noteId = saveNote(dir, '读完一篇文章')
    const first = createGoal(dir, { title: '阅读' })
    expect(() => linkNote(dir, first.id, first.revision, '1700000000999', true))
      .toThrowError(GoalStoreError)
    const linked = linkNote(dir, first.id, first.revision, noteId, true)
    const again = linkNote(dir, first.id, linked.revision, noteId, true)
    expect(again.evidence_note_ids).toEqual([noteId])
    expect(() => addDecision(dir, first.id, again.revision, {
      choice: '继续', reason: '', evidence_note_ids: ['1700000000999']
    })).toThrowError(GoalStoreError)
    const decided = addDecision(dir, first.id, again.revision, {
      choice: '继续', reason: '', evidence_note_ids: [noteId]
    })
    expect(decided.decisions[0].evidence_note_ids).toEqual([noteId])
    expect(existsSync(join(dir, 'notes', `${noteId}.json`))).toBe(true)
    const unlinked = linkNote(dir, first.id, decided.revision, noteId, false)
    expect(unlinked.evidence_note_ids).toEqual([])
    expect(unlinked.decisions[0].evidence_note_ids).toEqual([noteId])
  })

  it('links a topic but does not silently promote its members to goal evidence', () => {
    const dir = library()
    const noteId = saveNote(dir, '独立笔记')
    const topic = createCollection(dir, { name: '长期学习' })
    const goal = createGoal(dir, { title: '阅读习惯' })
    const linked = linkGoalCollection(dir, goal.id, goal.revision, topic.id, true)
    expect(linked.collection_ids).toEqual([topic.id])
    expect(linked.evidence_note_ids).toEqual([])
    expect(linked.decisions).toEqual([])
    expect(existsSync(join(dir, 'notes', `${noteId}.json`))).toBe(true)
    expect(() => linkGoalCollection(dir, goal.id, goal.revision, topic.id, false)).toThrow()
  })

  it('tracks a confirmed next step separately from an uncommitted check-in idea', () => {
    const dir = library()
    const first = createGoal(dir, { title: '学习' })
    const proposed = addCheckIn(dir, first.id, first.revision, {
      observation: '工作忙，暂时放慢', outcome: 'blocked', next_step: '也许改成周末'
    })
    expect(proposed.commitments).toEqual([])
    const committed = addCommitment(dir, first.id, proposed.revision, {
      text: '周末读 20 分钟', due_on: '2026-10-04'
    })
    expect(committed.commitments[0].status).toBe('open')
    const done = updateCommitment(dir, first.id, committed.revision, committed.commitments[0].id, 'done')
    expect(done.commitments[0].status).toBe('done')
    expect(done.check_ins[0].next_step).toBe('也许改成周末')
  })

  it('rejects malformed dates and blank goals without creating files', () => {
    const dir = library()
    expect(() => createGoal(dir, { title: ' ', review_on: '2026-02-31' })).toThrow()
    expect(() => createGoal(dir, { title: '读书', review_on: '2026-02-31' })).toThrow()
    expect(listGoals(dir)).toEqual([])
  })
})
