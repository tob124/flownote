import { createHash } from 'crypto'
import type { SourceEvidence, Usage } from '../../shared/insights'
import { limited } from '../llm/request-limit'
import { sourceUrl } from './source-reader'

const SEARCH_RESULTS = 12
type SearchResult = { sources: SourceEvidence[]; usage: Usage }

export function parseSearch(data: any): SearchResult {
  const sources = new Map<string, SourceEvidence>()
  function add(rawUrl: unknown, title: unknown, excerpt: unknown): void {
    if (typeof rawUrl !== 'string') return
    try {
      const url = sourceUrl(rawUrl)
      url.hash = ''
      if (sources.has(url.href)) return
      sources.set(url.href, {
        id: createHash('sha256').update(url.href).digest('hex').slice(0, 20),
        url: url.href, title: typeof title === 'string' ? title.slice(0, 500) : '',
        fetched_at: Date.now(), text: '', kind: 'unknown',
        excerpt: typeof excerpt === 'string' ? excerpt.slice(0, 2000) : undefined
      })
    } catch { /* Reject non-public URLs. */ }
  }

  if (Array.isArray(data?.results)) {
    for (const item of data.results) {
      add(item?.url, item?.title, item?.snippet || item?.summary)
    }
    return {
      sources: [...sources.values()].slice(0, SEARCH_RESULTS),
      usage: { input: 0, output: 0, searches: data.results.length ? 1 : 0 }
    }
  }

  // Incomplete research jobs can still replay responses saved before migration.
  const blocks = Array.isArray(data?.content) ? data.content : []
  const results = blocks.filter((b:any) => b.type === 'web_search_tool_result')
  if (!results.length) throw new Error('搜索未返回结构化来源，本次未完成核查')
  const snippets = new Map<string,string>()
  for (const b of blocks) for (const c of b.citations ?? []) {
    if (typeof c.url === 'string' && typeof c.cited_text === 'string') snippets.set(c.url,c.cited_text)
  }
  for (const b of results) {
    if (!Array.isArray(b.content)) continue
    for (const item of b.content) {
      if (item.type === 'web_search_result') add(item.url, item.title, snippets.get(item.url))
    }
  }
  if (!sources.size) throw new Error('未检索到可用来源')
  return { sources: [...sources.values()].slice(0, SEARCH_RESULTS), usage: {
    input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0,
    searches: data.usage?.server_tool_use?.web_search_requests ?? 0
  } }
}
export async function searchDeepseek(key: string, query: string, signal: AbortSignal, onResponse?: (data: unknown, usage: Usage) => void): Promise<SearchResult> {
  const searchQuery = Array.from(query.trim()).slice(0, 128).join('')
  if (!searchQuery) throw new Error('联网搜索需要关键词')
  return limited(async () => {
    const response = await fetch('https://api.deepseek.com/v1/tools/search', {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: searchQuery, count: SEARCH_RESULTS, need_content: false })
    })
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      throw new Error('联网搜索失败（HTTP ' + response.status + '）')
    }
    const data = await response.json() as { results?: unknown } | null
    if (!Array.isArray(data?.results)) throw new Error('联网搜索返回的数据格式无效')
    const result = parseSearch(data)
    onResponse?.(data, result.usage)
    return result
  }, signal)
}
