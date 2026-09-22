/** 归一化一行文本以便做 diff 高亮匹配（去掉行首尾空白与 markdown 标记）。 */
export function normalizeLine(line: string): string {
  return line
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^[#>*>\- ]+|[*_`~]+/g, '')
    .trim()
}

/**
 * 计算"新增行"：出现在 after 中、但 before 中没有出现的行（按归一化后的多重集合之差）。
 * 返回的是归一化后的文本，用于与渲染端 Markdown 提取文本匹配。
 */
export function computeAddedLines(before: string, after: string): string[] {
  if (!after) return []

  const toLines = (s: string): string[] =>
    s
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')

  const beforeNorm = toLines(before).map((l) => normalizeLine(l))
  const afterNorm = toLines(after).map((l) => normalizeLine(l))

  // before 中每个归一化行的剩余可用计数
  const pool = new Map<string, number>()
  for (const n of beforeNorm) {
    pool.set(n, (pool.get(n) ?? 0) + 1)
  }

  const added: string[] = []
  for (const n of afterNorm) {
    if (!n) continue
    const left = pool.get(n) ?? 0
    if (left > 0) {
      pool.set(n, left - 1) // 已匹配到 before 中的同一行，不算新增
    } else {
      added.push(n)
    }
  }

  return Array.from(new Set(added)).filter(Boolean)
}