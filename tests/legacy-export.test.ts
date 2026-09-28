import {describe,it,expect,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {createHash} from 'crypto'
vi.mock('electron',()=>({ipcMain:{handle:vi.fn()},dialog:{},BrowserWindow:{getAllWindows:()=>[]}}))
import {collectLegacy} from '../src/main/ipc/thinking.ipc'
describe('legacy data preservation',()=>{
 it('exports every retired module file byte-for-byte without modifying originals',()=>{
  const dir=mkdtempSync(join(tmpdir(),'flownote-legacy-'))
  try{
   for(const bucket of ['goals','collections','artifacts']){
    mkdirSync(join(dir,bucket,'history'),{recursive:true})
    writeFileSync(join(dir,bucket,'history','sample.json'),Buffer.from([0xef,0xbb,0xbf,0,65,66,13,10]))
   }
   const files=collectLegacy(dir);expect(files).toHaveLength(3)
   for(const file of files){
    const original=readFileSync(join(dir,file.path))
    expect(Buffer.from(file.base64,'base64')).toEqual(original)
    expect(file.sha256).toBe(createHash('sha256').update(original).digest('hex'))
   }
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
})
