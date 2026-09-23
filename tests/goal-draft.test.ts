import { expect, it } from 'vitest'
import { loadReviewDraft, saveReviewDraft } from '../src/renderer/utils/goal-draft'

it('restores a review draft by library and goal, then clears it after save', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }
  }
  const draft = { observation: '实际读了两次', outcome: 'progress' as const, nextStep: '下周继续' }
  saveReviewDraft(storage, 'library-a', 'goal-1', draft)
  expect(loadReviewDraft(storage, 'library-a', 'goal-1')).toEqual(draft)
  expect(loadReviewDraft(storage, 'library-b', 'goal-1').observation).toBe('')
  saveReviewDraft(storage, 'library-a', 'goal-1', { observation: '', outcome: 'progress', nextStep: '' })
  expect(values.size).toBe(0)
})
