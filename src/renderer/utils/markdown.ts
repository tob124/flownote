export interface Heading {
  level: number
  text: string
  id: string
}

export function slugify(text: string): string {
  const t = text.toLowerCase().trim()
  const clean = t.replace(/[*_~`>#\[\]()]|https?:\S+/g, '').trim()
  return clean
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
}

/**
 * 解析 markdown 文本中的所有标题（h1-h6），生成带唯一 id 的列表。
 * 规则与实际渲染保持一致：跳过围栏代码块，识别 Setext 标题（`=`/`-` 下划线式）。
 * 由于是纯函数，正文标题 id 与侧栏大纲共用同一份结果，天然无重复、StrictMode 安全。
 */
export function parseHeadings(content: string): Heading[] {
  const heads: Heading[] = []
  const norm = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = norm.split('\n')
  const counts: Record<string, number> = {}

  const push = (level: number, rawText: string): void => {
    const text = rawText.replace(/[*_`\[\]<>]/g, '').trim()
    if (!text) return
    let base = slugify(text) || `h-${level}`
    counts[base] = (counts[base] || 0) + 1
    const id = counts[base] > 1 ? `${base}-${counts[base]}` : base
    heads.push({ level, text, id })
  }

  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 跳过围栏代码块内容，避免把块内的 "# xx" 误当标题
    if (fence) {
      if (/^\s*(```|~~~)/.test(line)) fence = null
      continue
    }
    const fm = line.match(/^\s*(`{3,}|~{3,})/)
    if (fm) {
      fence = fm[1].slice(0, 3)
      continue
    }
    // ATX 标题
    const atx = line.match(/^(#{1,6})\s+(.+)$/)
    if (atx) {
      push(atx[1].length, atx[2])
      continue
    }
    // Setext 标题：紧跟在上文段落下方的 = 行(h1) / - 行(h2)
    const h1 = /^\s*=+\s*$/.test(line)
    const h2 = /^\s*-+\s*$/.test(line)
    if ((h1 || h2) && i > 0) {
      const prev = lines[i - 1]
      const prevTrimmed = prev.trim()
      if (
        prevTrimmed &&
        !/^(#{1,6})\s/.test(prev) &&
        !/^\s*(`{3,}|~{3,})\s*$/.test(prev) &&
        !/^\s*[-*+]\s/.test(prev) &&
        !/^\s*\d+[.)]\s/.test(prev)
      ) {
        push(h1 ? 1 : 2, prev)
      }
    }
  }
  return heads
}

/** 归一化一行文本以便做 diff 高亮匹配（去掉行首尾空白与 markdown 标记）。 */
export function normalizeLine(line: string): string {
  return line
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^[#>*>\- ]+|[*_`~]+/g, '')
    .trim()
}