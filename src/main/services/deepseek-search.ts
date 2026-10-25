import { createHash } from 'crypto'
import type { SourceEvidence, Usage } from '../../shared/insights'
import { limited } from '../llm/request-limit'
import { sourceUrl } from './source-reader'

// Official schema: https://api-docs.deepseek.com/guides/search/
export function parseSearch(data: any): { sources: SourceEvidence[]; usage: Usage } {
  const native = Array.isArray(data?.results)
  // Read old persisted responses so interrupted jobs remain recoverable.
  const legacy = Array.isArray(data?.content) ? data.content.filter((b:any)=>b.type==='web_search_tool_result') : []
  if (!native && !legacy.length) throw new Error('搜索未返回结构化来源，本次未完成核查')
  const items = native ? data.results : legacy.flatMap((b:any)=>Array.isArray(b.content)?b.content:[])
  const sources = new Map<string,SourceEvidence>()
  for (const item of items) {
    if (!item || typeof item.url !== 'string' || (!native && item.type!=='web_search_result')) continue
    try {
      const url=sourceUrl(item.url); url.hash=''
      sources.set(url.href, {
        id:createHash('sha256').update(url.href).digest('hex').slice(0,20),
        url:url.href,title:typeof item.title==='string'?item.title.slice(0,500):'',fetched_at:Date.now(),
        // Search summaries and authority scores cannot establish an attribution.
        text:'',excerpt:typeof item.snippet==='string'?item.snippet:undefined,kind:'unknown',
        ...(native ? {search_authority:item.authority,search_score:item.rerank_score} : {})
      })
    } catch { /* Reject unsafe/non-web URLs. */ }
  }
  return {sources:[...sources.values()].slice(0,12),usage:native?{input:0,output:0,searches:1}:{
    input:data.usage?.input_tokens??0,output:data.usage?.output_tokens??0,
    searches:data.usage?.server_tool_use?.web_search_requests??0
  }}
}
export function searchQuery(query:string):string {
  const normalized=query.trim()
  if(!normalized || [...normalized].length>128)throw new Error('搜索词需为 1–128 个字符，请缩短查询')
  return normalized
}
async function request(key:string,tool:'search'|'fetch',body:unknown,signal:AbortSignal):Promise<any> {
  if(!key)throw new Error('请先配置 DeepSeek API Key')
  return limited(async()=>{
    const response=await fetch('https://api.deepseek.com/v1/tools/'+tool,{
      method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(90000)]),
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)
    })
    if(!response.ok)throw new Error('DeepSeek '+(tool==='search'?'搜索':'正文抓取')+'失败（'+response.status+'）')
    return response.json()
  },signal)
}
export async function searchDeepseek(key:string,query:string,signal:AbortSignal,onResponse?:(data:any)=>void):Promise<ReturnType<typeof parseSearch>> {
  const data=await request(key,'search',{query:searchQuery(query),count:12,need_content:false},signal)
  onResponse?.(data)
  return parseSearch(data)
}
export async function fetchDeepseekPage(key:string,url:string,signal:AbortSignal):Promise<string> {
  const safe=sourceUrl(url)
  const data=await request(key,'fetch',{url:safe.href},signal)
  if(typeof data?.content!=='string' || !data.content.trim())throw new Error('未取得可核对的页面正文')
  return data.content
}
