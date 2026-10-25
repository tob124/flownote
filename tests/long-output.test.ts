import {afterEach,expect,it,vi} from 'vitest'
import {generate,GenerationError} from '../src/main/llm/thinking-client'
import {AI_LIMITS} from '../src/main/llm/models'
import {searchDeepseek,fetchDeepseekPage,parseSearch} from '../src/main/services/deepseek-search'
import type {AppConfig} from '../src/shared/types'
const config={api_provider:'DeepSeek',api_key:'fixture'} as AppConfig
afterEach(()=>vi.unstubAllGlobals())
it('requests the provider maximum and retains long input and output in every mode',async()=>{
 const text='完整回答。'.repeat(5000),material='材料\n'.repeat(25000)
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:text},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:20000}})))
 vi.stubGlobal('fetch',fetcher)
 for(const deep of [false,true]){
  const result=await generate(config,'return JSON',material,new AbortController().signal,deep)
  expect(result.text).toBe(text)
  const request=JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body))
  expect(request.max_tokens).toBe(393216)
  expect(request.model).toBe('deepseek-flash')
  expect(request.messages[1].content).toBe(material)
 }
 expect(AI_LIMITS.outputTokens).toBe(393216)
})
it('preserves provider-truncated output for recovery',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'已完成片段'},finish_reason:'length'}]}))))
 await expect(generate(config,'JSON','材料',new AbortController().signal)).rejects.toMatchObject({name:'GenerationError',rawText:'已完成片段',reason:'output_limit'})
})
it('uses standalone search and fetch without a model turn or invented token usage',async()=>{
 const send=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('search')?{results:[{url:'https://example.org/a',title:'原始资料',snippet:'摘要',content:'不作为已读证据',authority:4}]}:{content:'# 正文\n\n可逐字核对的证据'})))
 vi.stubGlobal('fetch',send)
 const onResponse=vi.fn(),signal=new AbortController().signal
 const result=await searchDeepseek('fixture','原始资料 site:example.org',signal,onResponse)
 expect(result.usage).toEqual({input:0,output:0,searches:1})
 expect(result.sources[0]).toMatchObject({text:'',kind:'unknown',search_authority:4})
 expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toEqual({query:'原始资料 site:example.org',count:12,need_content:false})
 expect(send.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/tools/search')
 expect(await fetchDeepseekPage('fixture',result.sources[0].url,signal)).toContain('可逐字核对')
 expect(send.mock.calls[1][0]).toBe('https://api.deepseek.com/v1/tools/fetch')
 expect(onResponse).toHaveBeenCalledOnce()
 expect(parseSearch({results:[]}).sources).toEqual([])
 await expect(searchDeepseek('fixture','字'.repeat(129),signal)).rejects.toThrow('128')
 expect(send).toHaveBeenCalledTimes(2)
})
