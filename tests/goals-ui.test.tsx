// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import GoalsPage from '../src/renderer/pages/GoalsPage'
import {
  GoalStoreError, addCheckIn, addCommitment, addDecision, createGoal,
  linkNote, listGoals, updateCommitment, updateGoal
} from '../src/main/store/goal-store'
import { loadAllNotesFrom, saveNote } from '../src/main/store/note-store'

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('../src/renderer/context/ConfigContext', () => ({
  useConfig: () => ({ config: { sync_dir: state.dir, categories: ['个人', '工作'], theme: 'paper' } })
}))
function result<T>(work: () => T) {
  try { return Promise.resolve({ ok: true as const, value: work() }) }
  catch (error) {
    return Promise.resolve({ ok: false as const, error: {
      code: error instanceof GoalStoreError ? error.code : 'IO', message: String(error)
    } })
  }
}
function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-ui-'))
  state.dir = dir
  Object.defineProperty(window, 'api', { configurable: true, value: {
    goals: {
      list: () => result(() => listGoals(dir)),
      create: (input: Parameters<typeof createGoal>[1]) => result(() => createGoal(dir, input)),
      update: (id: string, rev: number, patch: Parameters<typeof updateGoal>[3]) => result(() => updateGoal(dir, id, rev, patch)),
      addCommitment: (id: string, rev: number, input: Parameters<typeof addCommitment>[3]) => result(() => addCommitment(dir, id, rev, input)),
      updateCommitment: (id: string, rev: number, cid: string, status: Parameters<typeof updateCommitment>[4]) => result(() => updateCommitment(dir, id, rev, cid, status)),
      addDecision: (id: string, rev: number, input: Parameters<typeof addDecision>[3]) => result(() => addDecision(dir, id, rev, input)),
      addCheckIn: (id: string, rev: number, input: Parameters<typeof addCheckIn>[3]) => result(() => addCheckIn(dir, id, rev, input)),
      linkNote: (id: string, rev: number, noteId: string, linked: boolean) => result(() => linkNote(dir, id, rev, noteId, linked))
    },
    collections: { list: () => Promise.resolve({ ok: true, value: [] }) },
    notes: { loadAll: () => Promise.resolve(loadAllNotesFrom(dir)) }
  } })
  return dir
}
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  if (state.dir) rmSync(state.dir, { recursive: true, force: true })
  state.dir = ''
})

it('creates a goal, preserves an unfinished review, and only confirms a user-saved check-in', async () => {
  const dir = setup()
  const user = userEvent.setup()
  const noteId = saveNote(dir, '今天做了英文阅读，读完一篇文章')
  const view = render(<GoalsPage />)
  await user.click(await screen.findByRole('button', { name: '写下第一个目标' }))
  fireEvent.change(screen.getByLabelText('想推进什么？'), { target: { value: '英文阅读习惯' } })
  await user.click(screen.getByRole('button', { name: '保存目标' }))
  await screen.findByRole('heading', { name: '英文阅读习惯' })
  const goalId = listGoals(dir)[0].id
  await user.click(screen.getByRole('tab', { name: '资料' }))
  await user.click(await screen.findByRole('button', { name: '关联' }))
  expect(listGoals(dir)[0].evidence_note_ids).toEqual([noteId])
  await user.click(screen.getByRole('tab', { name: '回看' }))
  fireEvent.change(screen.getByLabelText('实际发生了什么'), { target: { value: '确实读了两次，但没有写完整笔记' } })
  view.unmount()
  render(<GoalsPage />)
  await screen.findByRole('heading', { name: '英文阅读习惯' })
  await user.click(screen.getByRole('tab', { name: '回看' }))
  expect((screen.getByLabelText('实际发生了什么') as HTMLTextAreaElement).value)
    .toBe('确实读了两次，但没有写完整笔记')
  await user.click(screen.getByRole('button', { name: '保存回看' }))
  await waitFor(() => expect(listGoals(dir)[0].check_ins).toHaveLength(1))
  expect(listGoals(dir)[0].commitments).toHaveLength(0)
  expect(listGoals(dir)[0].id).toBe(goalId)
  expect(within(screen.getByRole('main')).getByText(/不会自动创建待办/)).toBeTruthy()
})
