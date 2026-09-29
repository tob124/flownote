import {it,expect,vi,beforeEach} from 'vitest'
const env=vi.hoisted(()=>({handlers:new Map<string,Function>(),open:vi.fn(),show:vi.fn(),load:vi.fn(),path:vi.fn()}))
vi.mock('electron',()=>({ipcMain:{handle:(name:string,fn:Function)=>env.handlers.set(name,fn)},dialog:{},shell:{openPath:env.open,showItemInFolder:env.show}}))
vi.mock('../src/main/store/note-store',()=>({getSyncDir:()=>'/library',loadNote:env.load,updateNote:vi.fn()}))
vi.mock('../src/main/store/file-store',()=>({attachmentPath:env.path,saveFiles:vi.fn(),checkFiles:vi.fn()}))
import {registerFilesIpc} from '../src/main/ipc/files.ipc'
beforeEach(()=>{vi.resetAllMocks();env.handlers.clear();registerFilesIpc();env.load.mockReturnValue({attachments:[{storedName:'owned.md'}]});env.path.mockReturnValue('/library/files/owned.md')})
it('awaits the operating system and reports association errors',async()=>{
 env.open.mockResolvedValue('No associated application')
 const result=await env.handlers.get('files:open')!({},'note','owned.md')
 expect(result.ok).toBe(false);expect(result.error).toContain('No associated application')
 env.open.mockResolvedValue('');expect((await env.handlers.get('files:open')!({},'note','owned.md')).ok).toBe(true)
})
it('refuses foreign or missing attachments before invoking the operating system',async()=>{
 expect((await env.handlers.get('files:open')!({},'note','foreign.md')).ok).toBe(false)
 env.path.mockReturnValue(null);expect((await env.handlers.get('files:open')!({},'note','owned.md')).ok).toBe(false)
 expect(env.open).not.toHaveBeenCalled()
})
