// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import CollectionsPage from '../src/renderer/pages/CollectionsPage'
import {
  CollectionStoreError, createCollection, deleteCollection, linkCollectionNote,
  listCollections, updateCollection
} from '../src/main/store/collection-store'
import { loadAllNotesFrom, saveNote } from '../src/main/store/note-store'

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('../src/renderer/context/ConfigContext', () => ({
  useConfig: () => ({ config: { sync_dir: state.dir, theme: 'paper' } })
}))
function result<T>(work: () => T) {
  try { return Promise.resolve({ ok: true as const, value: work() }) }
  catch (error) { return Promise.resolve({ ok: false as const, error: {
    code: error instanceof CollectionStoreError ? error.code : 'IO', message: String(error)
  } }) }
}
afterEach(() => {
  cleanup()
  if (state.dir) rmSync(state.dir, { recursive: true, force: true })
  state.dir = ''
})
it('creates a topic and explicitly adds one existing note', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-topic-ui-'))
  state.dir = dir
  const noteId = saveNote(dir, '跨分类的原始资料')
  Object.defineProperty(window, 'api', { configurable: true, value: {
    collections: {
      list: () => result(() => listCollections(dir)),
      create: (input: Parameters<typeof createCollection>[1]) => result(() => createCollection(dir, input)),
      update: (id: string, rev: number, input: Parameters<typeof updateCollection>[3]) =>
        result(() => updateCollection(dir, id, rev, input)),
      linkNote: (id: string, rev: number, note: string, linked: boolean) =>
        result(() => linkCollectionNote(dir, id, rev, note, linked)),
      delete: (id: string, rev: number) => result(() => deleteCollection(dir, id, rev))
    },
    notes: { loadAll: () => Promise.resolve(loadAllNotesFrom(dir)) }
  } })
  const user = userEvent.setup()
  render(<CollectionsPage />)
  await user.click(await screen.findByRole('button', { name: '新建知识库' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '学习方法' } })
  await user.click(screen.getByRole('button', { name: '保存' }))
  await screen.findByRole('heading', { name: '学习方法' })
  await user.click(screen.getByRole('button', { name: '添加资料' }))
  await user.click(screen.getByRole('button', { name: '加入' }))
  await waitFor(() => expect(listCollections(dir)[0].note_ids).toEqual([noteId]))
  expect(loadAllNotesFrom(dir)).toHaveLength(1)
})
