// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import QuickInput from '../src/renderer/components/QuickInput'
import { formatMarkdown } from '../src/renderer/components/MarkdownFormatBar'
const addNote = vi.hoisted(() => vi.fn())
vi.mock('../src/renderer/context/ConfigContext',()=>({useConfig:()=>({config:{sync_dir:'fixture',api_provider:'DeepSeek',api_key:'fixture'}})}))
vi.mock('../src/renderer/context/NotesContext',()=>({useNotes:()=>({addNote,savedId:null,revealNote:vi.fn()})}))
afterEach(()=>{cleanup();localStorage.clear();vi.useRealTimers();addNote.mockReset()})

it('formats selections and preserves surrounding Chinese text and link selection', () => {
  expect(formatMarkdown('段首 重点，结尾', 2, 5, 'bold').value).toBe('段首 **重点**，结尾')
  expect(formatMarkdown('段首 观点 段尾', 3, 5, 'italic').value).toBe('段首 *观点* 段尾')
  expect(formatMarkdown('甲\n乙\n保留', 0, 4, 'list').value).toBe('- 甲\n- 乙\n保留')
  const link = formatMarkdown('有[资料]可读', 1, 5, 'link')
  expect(link.value).toBe('有[\\[资料\\]](https://)可读')
  expect(link.value.slice(...link.selection)).toBe('https://')
})
function start(polish:()=>Promise<string|null>){
 Object.defineProperty(window,'api',{configurable:true,value:{polish}})
 render(<QuickInput/>)
 fireEvent.change(screen.getByLabelText('写下一条记录'),{target:{value:'第一行\n第二行'}})
 fireEvent.click(screen.getByRole('button',{name:'输入工具'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'润色文字'}))
}
it('shows visible pending and completion states, prevents overwriting in-flight edits and expires success',async()=>{
 vi.useFakeTimers();let resolve!:(v:string)=>void
 start(()=>new Promise(r=>{resolve=r}))
 expect(screen.getByRole('status').textContent).toContain('AI 正在润色')
 expect((screen.getByLabelText('写下一条记录') as HTMLTextAreaElement).disabled).toBe(true)
 expect((screen.getByRole('button',{name:'保存笔记'}) as HTMLButtonElement).disabled).toBe(true)
 await act(async()=>resolve('第一行。\n第二行。'))
 expect(screen.getByRole('status').textContent).toContain('AI 润色完成')
 expect((screen.getByLabelText('写下一条记录') as HTMLTextAreaElement).value).toBe('第一行。\n第二行。')
 await act(async()=>vi.advanceTimersByTime(3500))
 expect(screen.queryByRole('status')).toBeNull()
})

it('does not restore a cleared draft when saving immediately closes the editor', async () => {
  const key = 'flownote:capture:v1:fixture'
  localStorage.setItem(key, JSON.stringify({text:'要保存的笔记',files:[]}))
  addNote.mockResolvedValue('1700000000000')
  const view = render(<QuickInput onSaved={() => view.unmount()}/>)

  await act(async () => fireEvent.click(screen.getByRole('button', {name:'保存笔记'})))
  expect(addNote).toHaveBeenCalledWith('要保存的笔记', [])
  expect(localStorage.getItem(key)).toBeNull()
})
it('shows null responses as failures while retaining the original draft',async()=>{
 start(async()=>null)
 await act(async()=>{})
 expect(screen.getByRole('alert').textContent).toContain('原文已保留')
 expect((screen.getByLabelText('写下一条记录') as HTMLTextAreaElement).value).toBe('第一行\n第二行')
})

it('writes a capture draft after typing stops and flushes immediately on navigation or close', () => {
  vi.useFakeTimers()
  const key = 'flownote:capture:v1:fixture'
  const files = [{name:'page.md',storedName:'page.md',ext:'md',size:12}]
  localStorage.setItem(key, JSON.stringify({text:'上次的草稿',files}))
  const readDraft = () => JSON.parse(localStorage.getItem(key)!)
  const write = vi.spyOn(Storage.prototype, 'setItem')
  try {
    const view = render(<QuickInput/>)
    const editor = screen.getByLabelText('写下一条记录') as HTMLTextAreaElement
    expect(editor.value).toBe('上次的草稿')

    fireEvent.compositionStart(editor)
    fireEvent.change(editor, {target:{value:'输入法组字'}})
    act(() => vi.advanceTimersByTime(1000))
    expect(write).not.toHaveBeenCalled()
    fireEvent.compositionEnd(editor)
    act(() => vi.advanceTimersByTime(400))
    fireEvent.change(editor, {target:{value:'继续写'}})
    act(() => vi.advanceTimersByTime(400))
    expect(write).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(250))
    expect(write).toHaveBeenCalledTimes(1)
    expect(readDraft()).toEqual({text:'继续写',files})

    fireEvent.change(editor, {target:{value:'切页前'}})
    expect(window.dispatchEvent(new Event('flownote:before-leave', {cancelable:true}))).toBe(true)
    expect(readDraft()).toEqual({text:'切页前',files})
    act(() => vi.advanceTimersByTime(1000))
    expect(write).toHaveBeenCalledTimes(2)

    fireEvent.change(editor, {target:{value:'关闭前'}})
    expect(window.dispatchEvent(new Event('beforeunload', {cancelable:true}))).toBe(true)
    expect(readDraft()).toEqual({text:'关闭前',files})

    fireEvent.change(editor, {target:{value:'编辑器自动收起前'}})
    view.unmount()
    expect(readDraft()).toEqual({text:'编辑器自动收起前',files})
  } finally {
    write.mockRestore()
  }
})
