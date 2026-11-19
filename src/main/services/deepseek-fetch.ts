import { sourceUrl } from './source-reader'

const MAX_RESPONSE_BYTES = 2_000_000
const MAX_CLIP_LENGTH = 100_000

export async function fetchWebClip(key: string, rawUrl: unknown): Promise<string> {
  let url: URL
  let source: string
  try {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length > 8192) throw new Error()
    url = sourceUrl(rawUrl.trim())
    // A trailing DNS dot does not make a local hostname public.
    if (url.hostname.endsWith('.')) {
      url.hostname = url.hostname.slice(0, -1)
      sourceUrl(url.href)
    }
    source = url.href
    url.hash = ''
    if (url.href.length > 8192) throw new Error()
  } catch {
    throw new Error('请输入有效的公开网页链接（HTTP 或 HTTPS）')
  }

  const signal = AbortSignal.timeout(25_000)
  let page: { title?: unknown; content?: unknown }
  try {
    const response = await fetch('https://api.deepseek.com/v1/tools/fetch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.href }),
      redirect: 'error',
      signal
    })
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      const messages: Record<number, string> = {
        401: 'DeepSeek API 密钥无效，请检查设置',
        402: 'DeepSeek 账户余额不足',
        403: 'DeepSeek 拒绝读取该链接，请换用公开来源',
        404: 'DeepSeek 未能读取该网页的正文，请检查链接或手动复制',
        429: '剪藏请求过于频繁，请稍后重试',
        504: 'DeepSeek 读取网页超时，请稍后重试'
      }
      throw new ClipError(messages[response.status] ?? `剪藏失败（HTTP ${response.status}），请稍后重试`)
    }
    if (!response.body) throw new ClipError('DeepSeek 未返回网页正文')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_RESPONSE_BYTES) {
          void reader.cancel().catch(() => {})
          throw new ClipError('网页响应过大，请手动复制需要的段落')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    page = JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
  } catch (error) {
    if (error instanceof ClipError) throw error
    if (signal.aborted) throw new Error('剪藏网页超时，请稍后重试')
    if (error instanceof SyntaxError) throw new Error('DeepSeek 返回的网页数据格式无效，请稍后重试')
    throw new Error('无法连接 DeepSeek，请检查网络后重试')
  }
  const content = typeof page?.content === 'string' ? page.content.trim() : ''
  if (!content) throw new Error('DeepSeek 未返回可剪藏的网页正文')
  const title = typeof page.title === 'string' ? page.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  const heading = title || url.hostname
  const prefix = `## ${heading.replace(/[\\`*_[\]<>#~&]/g, '\\$&')}\n\n[来源网页](<${source}>)\n\n`
  if (content.length <= MAX_CLIP_LENGTH) return prefix + content
  const excerpt = content.slice(0, MAX_CLIP_LENGTH).replace(/[\uD800-\uDBFF]$/, '')
  return `${prefix}${excerpt}\n\n（网页较长，剪藏内容已截断。）`
}

class ClipError extends Error {}
