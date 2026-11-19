import { createHash } from 'crypto'
import type { SourceEvidence, Usage } from '../../shared/insights'
import { limited } from '../llm/request-limit'
import { sourceUrl } from './source-reader'

const SEARCH_RESULTS = 12
type SearchResult = { sources: SourceEvidence[]; usage: Usage }

export function parseSearch(data: any): SearchResult {
  const sources = new Map<string, SourceEvidence>()
  function add(item: any, excerpt: unknown, native: boolean): void {
    if (typeof item?.url !== 'string') return
    try {
      const url = sourceUrl(item.url)
      url.hash = ''
      if (sources.has(url.href)) return
      sources.set(url.href, {
        id: createHash('sha256').update(url.href).digest('hex').slice(0, 20),
        url: url.href, title: typeof item.title === 'string' ? item.title.slice(0, 500) : '',
        fetched_at: Date.now(), text: '', kind: 'unknown',
        excerpt: typeof excerpt === 'string' ? excerpt.slice(0, 2000) : undefined,
        ...(native && typeof item.authority === 'number' ? { search_authority: item.authority } : {}),
        ...(native && typeof item.rerank_score === 'number' ? { search_score: item.rerank_score } : {})
      })
    } catch { /* Reject non-public URLs. */ }
  }

  if (Array.isArray(data?.results)) {
    for (const item of data.results) add(item, item?.snippet || item?.summary, true)
    return {
      sources: [...sources.values()].slice(0, SEARCH_RESULTS),
      usage: { input: 0, output: 0, searches: data.results.length ? 1 : 0 }
    }
  }

  // Incomplete jobs can replay responses saved before the standalone API.
  const blocks = Array.isArray(data?.content) ? data.content : []
  const results = blocks.filter((block: any) => block?.type === 'web_search_tool_result')
  if (!results.length) throw new Error('搜索未返回结构化来源，本次未完成核查')
  const snippets = new Map<string, string>()
  for (const block of blocks) for (const citation of Array.isArray(block?.citations) ? block.citations : []) {
    if (typeof citation?.url === 'string' && typeof citation.cited_text === 'string') snippets.set(citation.url, citation.cited_text)
  }
  for (const block of results) {
    if (!Array.isArray(block.content)) continue
    for (const item of block.content) {
      if (item?.type === 'web_search_result') add(item, snippets.get(item.url), false)
    }
  }
  return { sources: [...sources.values()].slice(0, SEARCH_RESULTS), usage: {
    input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0,
    searches: data.usage?.server_tool_use?.web_search_requests ?? 0
  } }
}

export async function searchDeepseek(key: string, query: string, signal: AbortSignal, onResponse?: (data: unknown, usage: Usage) => void): Promise<SearchResult> {
  const searchQuery = query.trim()
  if (!searchQuery || Array.from(searchQuery).length > 128) throw new Error('搜索词需为 1–128 个字符，请缩短查询')
  if (!key) throw new Error('请先配置 DeepSeek API Key')
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
