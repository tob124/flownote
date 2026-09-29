// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import NoteDetailDialog from '../src/renderer/components/NoteDetailDialog'
import { loadAllNotesFrom, loadNote, NoteConflictError, patchNote, saveNote } from '../src/main/store/note-store'

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('../src/renderer/context/ConfigContext', () => ({
  useConfig: () => ({ config: { sync_dir: state.dir, categories: ['个人', '工作'] } })
}))
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-editor-ui-'))
  state.dir = dir
  const id = saveNote(dir, '原文')
  Object.defineProperty(window, 'api', { configurable: true, value: { notes: {
    patch: (noteId: string, revision: number, patch: Parameters<typeof patchNote>[3]) => {
      try { return Promise.resolve({ ok: true, value: patchNote(dir, noteId, revision, patch) }) }
      catch (error) { return Promise.resolve({ ok: false, error: {
        code: error instanceof NoteConflictError ? 'CONFLICT' : 'IO', message: String(error)
      } }) }
    },
    loadAll: () => Promise.resolve(loadAllNotesFrom(dir))
  } } })
  return { dir, id }
}
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  if (state.dir) rmSync(state.dir, { recursive: true, force: true })
  state.dir = ''
})

it('opens editing from details and saves user changes with a revision', async () => {
  const { dir, id } = setup()
  const user = userEvent.setup()
  render(<NoteDetailDialog note={loadNote(id, dir)!} onClose={() => {}} />)
  await user.click(screen.getByRole('button', { name: '编辑笔记' }))
  fireEvent.change(screen.getByLabelText('笔记正文'), { target: { value: '修订后的正文' } })
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: '我的标题' } })
  await user.click(screen.getByRole('button', { name: '保存修改' }))
  await waitFor(() => expect(loadNote(id, dir)?.raw_content).toBe('修订后的正文'))
  expect(loadNote(id, dir)?.title).toBe('我的标题')
  expect(loadNote(id, dir)?.revision).toBe(2)
})

it('keeps an old draft when the disk changes and requires explicit overwrite', async () => {
  const { dir, id } = setup()
  const user = userEvent.setup()
  render(<NoteDetailDialog note={loadNote(id, dir)!} onClose={() => {}} />)
  await user.click(screen.getByRole('button', { name: '编辑笔记' }))
  fireEvent.change(screen.getByLabelText('笔记正文'), { target: { value: '我的草稿' } })
  patchNote(dir, id, 1, { raw_content: '外部更新' })
  await user.click(screen.getByRole('button', { name: '保存修改' }))
  await screen.findByText(/磁盘上的笔记已有更新/)
  expect(loadNote(id, dir)?.raw_content).toBe('外部更新')
  await user.click(screen.getByRole('button', { name: '我已核对，以草稿继续编辑' }))
  await user.click(screen.getByRole('button', { name: '保存修改' }))
  await waitFor(() => expect(loadNote(id, dir)?.raw_content).toBe('我的草稿'))
})

it('keeps a local draft when closing without changing the saved note', async () => {
  const { dir, id } = setup()
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<NoteDetailDialog note={loadNote(id, dir)!} onClose={onClose} />)
  await user.click(screen.getByRole('button', { name: '编辑笔记' }))
  fireEvent.change(screen.getByLabelText('笔记正文'), { target: { value: '尚未提交的草稿' } })
  await user.click(screen.getByRole('button', { name: '关闭' }))
  expect(window.localStorage.getItem('flownote:note-draft:'+dir+':'+id)).toContain('尚未提交的草稿')
  expect(onClose).toHaveBeenCalledOnce()
  expect(loadNote(id, dir)?.raw_content).toBe('原文')
})

it('blocks navigation when local draft storage fails', async () => {
  const {dir,id}=setup()
  const user=userEvent.setup(),onClose=vi.fn()
  render(<NoteDetailDialog note={loadNote(id,dir)!} onClose={onClose}/>)
  await user.click(screen.getByRole('button',{name:'编辑笔记'}))
  const failure=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')})
  fireEvent.change(screen.getByLabelText('笔记正文'),{target:{value:'不能丢失的内容'}})
  await user.click(screen.getByRole('button',{name:'关闭'}))
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText(/本机草稿无法保存/)).toBeTruthy()
  failure.mockRestore()
})
