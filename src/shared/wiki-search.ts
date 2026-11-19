export const WIKI_QUERY_LIMIT = 160

export type WikiSearchHit = {
  filename: string
  sealed: boolean
  excerpt: string
}

export type WikiSearchResult = { hits: WikiSearchHit[]; total: number; skipped: number }

export function parseWikiFilename(filename: string) {
  const match = /^(.+)_(\d{4})_(\d{2})(?:_sealed_(.+))?\.md$/.exec(filename)
  if (!match) return null
  const [, category, year, month, sealedAt] = match
  return { filename, category, yearMonth: `${year}-${month}`, year: Number(year), month: Number(month), sealed: Boolean(sealedAt), sealedAt }
}

export function wikiSearchPattern(query: string): RegExp {
  const words = query.trim().split(/\s+/)
  return new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'giu')
}
