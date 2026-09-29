// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import NotesPage from '../src/renderer/pages/NotesPage'
import { deleteNote, deleteNoteForever, listTrashedNotes, restoreNote, saveNote } from '../src/main/store/note-store'

const state = vi.hoisted(() => ({ dir: '', refresh: vi.fn() }))
vi.mock('../src/renderer/context/NotesContext', () => ({
  useNotes: () => ({ loadNotes: state.refresh })
}))
vi.mock('../src/renderer/components/QuickInput', () => ({ default: () => <div>快速输入区</div> }))
vi.mock('../src/renderer/components/SearchBar', () => ({ default: () => <div>搜索区</div> }))
vi.mock('../src/renderer/components/NotesWorkspace', () => ({ default: ({onTrash}:{onTrash:()=>void}) => <button onClick={onTrash}>回收站</button> }))
afterEach(() => {
  cleanup()
  if (state.dir) rmSync(state.dir, { recursive: true, force: true })
  state.dir = ''
  state.refresh.mockClear()
})
it('shows trash even when the active list is empty and restores the same note', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-trash-ui-'))
  state.dir = dir
  const id = saveNote(dir, '可恢复的一段文字')
  deleteNote(id, dir)
  Object.defineProperty(window, 'api', { configurable: true, value: {
    notes: {
      trashList: () => Promise.resolve(listTrashedNotes(dir)),
      restore: (noteId: string) => Promise.resolve(restoreNote(dir, noteId)),
      deleteForever: (noteId: string) => Promise.resolve(deleteNoteForever(dir, noteId))
    }
  } })
  const user = userEvent.setup()
  render(<NotesPage />)
  await user.click(screen.getByRole('button', { name: '回收站' }))
  expect((await screen.findAllByText('可恢复的一段文字')).length).toBeGreaterThan(0)
  await user.click(screen.getByRole('button', { name: '恢复' }))
  await waitFor(() => expect(listTrashedNotes(dir)).toEqual([]))
  expect(state.refresh).toHaveBeenCalled()
})
it('requires an inline second action before permanent deletion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-trash-ui-'))
  state.dir = dir
  const id = saveNote(dir, '仅用于删除确认')
  deleteNote(id, dir)
  const remove = vi.fn((noteId: string) => Promise.resolve(deleteNoteForever(dir, noteId)))
  Object.defineProperty(window, 'api', { configurable: true, value: {
    notes: {
      trashList: () => Promise.resolve(listTrashedNotes(dir)),
      restore: (noteId: string) => Promise.resolve(restoreNote(dir, noteId)),
      deleteForever: remove
    }
  } })
  const user = userEvent.setup()
  render(<NotesPage />)
  await user.click(screen.getByRole('button', { name: '回收站' }))
  await screen.findAllByText('仅用于删除确认')
  await user.click(screen.getByRole('button', { name: '彻底删除' }))
  expect(remove).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认删除' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith(id))
})
