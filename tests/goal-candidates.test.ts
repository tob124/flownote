import { expect, it } from 'vitest'
import { suggestGoalNotes } from '../src/shared/goal-candidates'
import type { GoalRecord } from '../src/shared/goals'
import type { Note } from '../src/shared/types'

const goal: GoalRecord = {
  schema_version: 1, id: 'g', revision: 1, title: '英文阅读习惯',
  status: 'active', evidence_note_ids: ['1700000000000'],
  commitments: [], decisions: [], check_ins: [],
  created_at_ms: 1, updated_at_ms: 1
}
function note(id: string, body: string, title = ''): Note {
  return { id, raw_content: body, title, created_at: '2026-09-23',
    ai_status: 'done', retry_count: 0, category: 'Inbox', tags: [] }
}
it('shows inspectable keyword matches but never repeats already linked notes', () => {
  const result = suggestGoalNotes(goal, [
    note('1700000000000', '英文阅读'),
    note('1700000000001', '英文阅读的进展', '阅读记录'),
    note('1700000000002', '完全无关的资料')
  ])
  expect(result.map((item) => item.note.id)).toEqual(['1700000000001'])
  expect(result[0].matchedTerms.length).toBeGreaterThan(0)
})

it('prioritizes explicitly linked topic materials without treating them as evidence', () => {
  const topicId = '11111111-1111-4111-8111-111111111111'
  const candidate = note('1700000000003', '有关练习方法的记录')
  const suggestions = suggestGoalNotes(
    { ...goal, collection_ids: [topicId] }, [candidate], 5,
    [{ schema_version: 1, id: topicId, revision: 1, name: '学习方法',
      description: '', note_ids: [candidate.id], created_at_ms: 1, updated_at_ms: 1 }]
  )
  expect(suggestions[0].note.id).toBe(candidate.id)
  expect(suggestions[0].matchedTerms).toContain('知识库：学习方法')
  expect(goal.evidence_note_ids).not.toContain(candidate.id)
})
