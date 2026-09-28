import { createHash } from 'crypto'
import type { SourceEvidence, Usage } from '../../shared/insights'
import { limited } from '../llm/request-limit'
import { AI_MODELS } from '../llm/models'
import { sourceUrl } from './source-reader'

export function parseSearch(data: any): { sources: SourceEvidence[]; usage: Usage } {
  const blocks = Array.isArray(data.content) ? data.content : []
  const results = blocks.filter((b:any) => b.type === 'web_search_tool_result')
  if (!results.length) throw new Error('搜索未返回结构化来源，本次未完成核查')
  const snippets = new Map<string,string>()
  for (const b of blocks) for (const c of b.citations ?? []) {
    if (typeof c.url === 'string' && typeof c.cited_text === 'string') snippets.set(c.url,c.cited_text)
  }
  const sources = new Map<string,SourceEvidence>()
  for (const b of results) {
    if (!Array.isArray(b.content)) continue
    for (const item of b.content) {
      if (item.type !== 'web_search_result' || typeof item.url !== 'string') continue
      try {
        const url = sourceUrl(item.url); url.hash = ''
        sources.set(url.href, {
          id: createHash('sha256').update(url.href).digest('hex').slice(0,20),
          url: url.href, title: String(item.title ?? '').slice(0,500), fetched_at: Date.now(),
          text: '', excerpt: snippets.get(item.url)?.slice(0,2000), kind: 'unknown'
        })
      } catch { /* Reject non-web links. */ }
    }
  }
  if (!sources.size) throw new Error('未检索到可用来源')
  return { sources: [...sources.values()].slice(0,12), usage: {
    input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0,
    searches: data.usage?.server_tool_use?.web_search_requests ?? 0
  } }
}
export async function searchDeepseek(key: string, query: string, signal: AbortSignal): Promise<ReturnType<typeof parseSearch>> {
  return limited(async () => {
    const response = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
      method: 'POST', redirect:'error', signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      headers: { 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: AI_MODELS.deepseek, max_tokens: 2000,
        messages: [{ role:'user', content:'Run one focused web search for the query below. Prefer author, publisher, university or professional institution pages with readable HTML. Exclude PDFs, Office files and login-only pages: the reader supports public HTML only. Keep the target population and subject of the query; do not substitute a narrower group such as children or patients without reason. Return sources briefly; do not research additional topics or answer the underlying question. Query: ' + query.slice(0,600) + ' -filetype:pdf -filetype:docx -filetype:doc' }],
        tools: [{ type:'web_search_20250305', name:'web_search', max_uses:2 }]
      })
    })
    if (!response.ok) throw new Error('联网搜索失败（' + response.status + '）')
    return parseSearch(await response.json())
  }, signal)
}
