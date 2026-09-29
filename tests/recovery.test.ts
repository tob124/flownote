import {describe,it,expect,vi,afterEach} from 'vitest'
import {parseObject} from '../src/main/llm/thinking-client'
import {aiCommit,aiRead} from '../src/main/store/insight-store'
import * as atomic from '../src/main/store/atomic-file'
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'fs'
import {tmpdir} from 'os'
import {join} from 'path'
import {attachmentPath} from '../src/main/store/file-store'
const roots:string[]=[]
const temp=()=>{const p=mkdtempSync(join(tmpdir(),'flownote-recovery-'));roots.push(p);return p}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();roots.forEach(p=>rmSync(p,{recursive:true,force:true}));roots.length=0;delete process.env.FLOWNOTE_LOCAL_DATA})
describe('paid response and commit recovery',()=>{
 it('accepts one complete object with a fence or commentary but rejects ambiguous or truncated responses',()=>{
  expect(parseObject('```json\n{"body":"ok"}\n```\n说明')).toEqual({body:'ok'})
  expect(parseObject('{"body":"a } brace and \\" quote"}\nDone').body).toBeTruthy()
  for(const text of ['{"body":"cut','{"body":"one"}\n{"body":"two"}','```json\n{"body":"ok"}','[{"body":"ok"}]'])expect(()=>parseObject(text)).toThrow()
 })
 it('retries a transient occupied file while preserving the previous report',async()=>{
  vi.useFakeTimers();const dir=temp();process.env.FLOWNOTE_LOCAL_DATA=temp()
  const original=atomic.atomicWrite;let attempts=0
  vi.spyOn(atomic,'atomicWrite').mockImplementation((file,text,options)=>{
   if(file.includes(join('thinking','reports')) && attempts++<2)throw Object.assign(new Error('occupied'),{code:'EPERM'})
   return original(file,text,options)
  })
  const pending=aiCommit(dir,'reports','sample',{body:'finished'});await vi.runAllTimersAsync();await pending
  expect(attempts).toBe(3);expect(aiRead<any>(dir,'reports','sample').body).toBe('finished')
  expect(aiRead<any>(dir,'pending','reports_sample').pending).toBe(false)
 })
 it('preserves a pending result on permanent permission errors without repeated writes',async()=>{
  const dir=temp();process.env.FLOWNOTE_LOCAL_DATA=temp();const original=atomic.atomicWrite
  vi.spyOn(atomic,'atomicWrite').mockImplementation((file,text,options)=>{
   if(file.includes(join('thinking','reports')))throw Object.assign(new Error('denied'),{code:'EACCES'})
   return original(file,text,options)
  })
  await expect(aiCommit(dir,'reports','sample',{body:'paid result'})).rejects.toThrow('权限')
  expect(aiRead<any>(dir,'pending','reports_sample').value.body).toBe('paid result')
  expect(aiRead(dir,'reports','sample')).toBeNull()
 })
 it('rejects attachment path traversal',()=>{
  const dir=temp();mkdirSync(join(dir,'files'));writeFileSync(join(dir,'files','note.md'),'text')
  expect(attachmentPath(dir,'note.md')).toBeTruthy()
  expect(attachmentPath(dir,'../note.md')).toBeNull()
  expect(attachmentPath(dir,'missing.md')).toBeNull()
 })
})
