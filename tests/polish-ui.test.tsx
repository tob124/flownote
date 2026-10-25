// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import QuickInput from '../src/renderer/components/QuickInput'
vi.mock('../src/renderer/context/ConfigContext',()=>({useConfig:()=>({config:{sync_dir:'fixture',api_key:'fixture'}})}))
vi.mock('../src/renderer/context/NotesContext',()=>({useNotes:()=>({addNote:vi.fn(),savedId:null,revealNote:vi.fn()})}))
afterEach(()=>{cleanup();localStorage.clear();vi.useRealTimers()})
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
it('shows null responses as failures while retaining the original draft',async()=>{
 start(async()=>null)
 await act(async()=>{})
 expect(screen.getByRole('alert').textContent).toContain('原文已保留')
 expect((screen.getByLabelText('写下一条记录') as HTMLTextAreaElement).value).toBe('第一行\n第二行')
})
