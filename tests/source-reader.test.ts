import {afterEach,describe,expect,it,vi} from 'vitest'
const dns=vi.hoisted(()=>({lookup:vi.fn()}))
vi.mock('dns/promises',()=>({lookup:dns.lookup}))
import {resolvePublicHost,sourceUrl} from '../src/main/services/source-reader'
afterEach(()=>vi.unstubAllGlobals())
describe('public source DNS validation',()=>{
 it('resolves proxy placeholders to public addresses without permitting the placeholder',async()=>{
  dns.lookup.mockResolvedValue([{address:'198.18.0.70'}])
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({Answer:[{type:5,data:'alias.example.com'},{type:1,data:'93.184.216.34'}]})))
  vi.stubGlobal('fetch',fetcher)
  expect(await resolvePublicHost('example.com',new AbortController().signal)).toEqual(['93.184.216.34'])
  expect(fetcher.mock.calls[0][0]).toContain('name=example.com&type=A')
 })
 it('rejects private DNS answers including a private answer behind a proxy placeholder',async()=>{
  dns.lookup.mockResolvedValue([{address:'198.18.0.70'}])
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({Answer:[{type:1,data:'127.0.0.1'}]}))))
  await expect(resolvePublicHost('example.com',new AbortController().signal)).rejects.toThrow('非公网')
  dns.lookup.mockResolvedValue([{address:'93.184.216.34'},{address:'10.0.0.1'}])
  await expect(resolvePublicHost('example.com',new AbortController().signal)).rejects.toThrow('非公网')
 })
 it('does not query an external resolver for ordinary public DNS or private addresses',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  dns.lookup.mockResolvedValue([{address:'93.184.216.34'}])
  expect(await resolvePublicHost('example.com',new AbortController().signal)).toEqual(['93.184.216.34'])
  dns.lookup.mockResolvedValue([{address:'192.168.1.1'}])
  await expect(resolvePublicHost('example.com',new AbortController().signal)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
 })
 it('rejects local names and proxy-placeholder literals before any network call',()=>{
  for(const url of ['https://198.18.0.70','http://localhost','http://printer.local','http://127.1','https://[::1]'])expect(()=>sourceUrl(url)).toThrow()
 })
})
