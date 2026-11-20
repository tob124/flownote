export const ATTACHMENT_SUMMARY_LIMIT = 240
const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })

export function compactText(text: string, limit: number): string {
  const value = text.trim().replace(/\s+/g, ' ')
  return value.length <= limit ? value : `${value.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd()}…`
}

/** Choose a short extract from substantive sentences without sending the file anywhere. */
export function extractAttachmentSummary(content: string): string {
  const lines = content.slice(0, 24_000)
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1[ \t]*\r?$|(?![\s\S]))/gm, '')
    .split(/\r?\n/)
    .map(line => line.trim().replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/^[>\-*]+\s*/, ''))
    .filter(line => line && !/^#|^\[PDF|^\[第\s*\d+\s*页\]|^<[^>]+>$/.test(line))
  const choices = [...new Set(lines.flatMap(line => [...sentences.segment(line)].map(item => item.segment.trim())))].filter(Boolean)
    .filter(text => !/^[A-Z0-9_-]{12,}$/.test(text))
  const first = choices.find(text => text.length >= 24) ?? choices[0]
  if (!first) return ''
  const second = choices.slice(choices.indexOf(first) + 1).find(text => text.length >= 24)
  return compactText(second && first.length + second.length < ATTACHMENT_SUMMARY_LIMIT ? `${first} ${second}` : first, ATTACHMENT_SUMMARY_LIMIT)
}
