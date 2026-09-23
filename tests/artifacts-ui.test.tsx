// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ArtifactsPage from '../src/renderer/pages/ArtifactsPage'
import { ArtifactStoreError, createArtifact, listArtifacts, renameArtifact, saveArtifactVersion } from '../src/main/store/artifact-store'
import { createGoal, listGoals } from '../src/main/store/goal-store'
import { loadAllNotesFrom, saveNote } from '../src/main/store/note-store'

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('../src/renderer/context/ConfigContext', () => ({
  useConfig: () => ({ config: { sync_dir: state.dir, theme: 'paper' } })
}))
function result<T>(work: () => T) {
  try { return Promise.resolve({ ok: true as const, value: work() }) }
  catch (error) {
    return Promise.resolve({ ok: false as const, error: {
      code: error instanceof ArtifactStoreError ? error.code : 'IO', message: String(error)
    } })
  }
}
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  if (state.dir) rmSync(state.dir, { recursive: true, force: true })
  state.dir = ''
})
it('creates a goal-based artifact, saves a version and exposes Markdown export', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-artifact-ui-'))
  state.dir = dir
  createGoal(dir, { title: '阅读目标' })
  const noteId = saveNote(dir, '这次阅读让我发现了一个问题')
  const exportCall = vi.fn().mockResolvedValue({ ok: true, value: true })
  Object.defineProperty(window, 'api', { configurable: true, value: {
    artifacts: {
      list: () => result(() => listArtifacts(dir)),
      create: (input: Parameters<typeof createArtifact>[1]) => result(() => createArtifact(dir, input)),
      rename: (id: string, rev: number, name: string) => result(() => renameArtifact(dir, id, rev, name)),
      saveVersion: (id: string, rev: number, body: string, ids: string[]) =>
        result(() => saveArtifactVersion(dir, id, rev, body, ids)),
      export: exportCall
    },
    goals: { list: () => Promise.resolve({ ok: true, value: listGoals(dir) }) },
    notes: { loadAll: () => Promise.resolve(loadAllNotesFrom(dir)) }
  } })
  const user = userEvent.setup()
  render(<ArtifactsPage />)
  await user.click(await screen.findByRole('button', { name: '新建成果' }))
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: '我的阅读复盘' } })
  await user.selectOptions(screen.getByLabelText('关联目标（可选）'), listGoals(dir)[0].id)
  await user.click(screen.getByRole('button', { name: '创建' }))
  await screen.findByDisplayValue('我的阅读复盘')
  await user.click(screen.getByRole('button', { name: '把目标轨迹加入草稿' }))
  fireEvent.change(screen.getByLabelText('成果正文'), { target: { value: '## 我的判断\n阅读需要固定时间。' } })
  await user.click(screen.getByText('这次阅读让我发现了一个问题'))
  await user.click(screen.getByRole('button', { name: '保存新版本' }))
  await waitFor(() => expect(listArtifacts(dir)[0].versions).toHaveLength(1))
  expect(listArtifacts(dir)[0].versions[0].sources[0].note_id).toBe(noteId)
  await user.click(await screen.findByRole('button', { name: '导出 Markdown' }))
  expect(exportCall).toHaveBeenCalledWith(listArtifacts(dir)[0].id, listArtifacts(dir)[0].versions[0].id)
})
