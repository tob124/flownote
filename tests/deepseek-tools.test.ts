import { afterEach, expect, it, vi } from 'vitest'
import { fetchWebClip } from '../src/main/services/deepseek-fetch'
import { parseSearch, searchDeepseek } from '../src/main/services/deepseek-search'

afterEach(() => vi.unstubAllGlobals())

it('searches with the standalone API and keeps snippets separate from source text', async () => {
  const result = { results: [
    { url: 'https://example.org/book#one', title: 'First', snippet: 'Search excerpt', content: 'Unverified' },
    { url: 'https://example.org/book#two', title: 'Duplicate' },
    { url: 'http://127.0.0.1/something', title: 'Local address' }
  ] }
  const fetch = vi.fn().mockResolvedValue(Response.json(result))
  vi.stubGlobal('fetch', fetch)
  const persist = vi.fn()
  const search = await searchDeepseek('test-key', '书😀'.repeat(64), new AbortController().signal, persist)
  expect(search.sources).toMatchObject([{ url: 'https://example.org/book', title: 'First', excerpt: 'Search excerpt', text: '' }])
  expect(search.usage).toEqual({ input: 0, output: 0, searches: 1 })
  expect(persist).toHaveBeenCalledWith(result, search.usage)
  expect(fetch).toHaveBeenCalledWith('https://api.deepseek.com/v1/tools/search', expect.objectContaining({
    method: 'POST', redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
    body: JSON.stringify({ query: '书😀'.repeat(64), count: 12, need_content: false })
  }))
  expect(parseSearch({ results: [] })).toEqual({ sources: [], usage: { input: 0, output: 0, searches: 0 } })
})

it('does not persist a malformed search response as a replayable success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: [] })))
  const persist = vi.fn()
  await expect(searchDeepseek('test-key', 'book', new AbortController().signal, persist)).rejects.toThrow('格式无效')
  expect(persist).not.toHaveBeenCalled()
})

it('clips a public page as editable Markdown with its original URL', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ title: '页面标题\n[书摘]', content: '**第一段**\n\n第二段' }))
  vi.stubGlobal('fetch', fetch)
  const clip = await fetchWebClip('test-key', 'https://example.org/a(b)?q=x#part')
  expect(clip).toBe('## 页面标题 \\[书摘\\]\n\n[来源网页](<https://example.org/a(b)?q=x#part>)\n\n**第一段**\n\n第二段')
  expect(fetch).toHaveBeenCalledWith('https://api.deepseek.com/v1/tools/fetch', expect.objectContaining({
    method: 'POST', redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
    body: JSON.stringify({ url: 'https://example.org/a(b)?q=x' })
  }))
})

it('rejects private and credentialed links without contacting DeepSeek', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  for (const url of ['http://127.0.0.1/a', 'http://host.local./a', 'https://user:pass@example.org', 'file:///memo.txt']) {
    await expect(fetchWebClip('test-key', url)).rejects.toThrow('公开网页链接')
  }
  expect(fetch).not.toHaveBeenCalled()
})

it('reports unavailable pages and enforces a response size limit', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(Response.json({ content: ' ' }))
    .mockResolvedValueOnce(Response.json({ content: '笔记'.repeat(400_000) }))
  vi.stubGlobal('fetch', fetch)
  await expect(fetchWebClip('test-key', 'https://example.org')).rejects.toThrow('未能读取')
  await expect(fetchWebClip('test-key', 'https://example.org')).rejects.toThrow('未返回可剪藏')
  await expect(fetchWebClip('test-key', 'https://example.org')).rejects.toThrow('响应过大')
})
