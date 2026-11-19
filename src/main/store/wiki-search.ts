import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { WIKI_QUERY_LIMIT, parseWikiFilename, wikiSearchPattern, type WikiSearchResult } from '../../shared/wiki-search'

const MAX_HITS = 50

function excerpt(text: string, query: string): string {
  const pattern = wikiSearchPattern(query)
  for (const line of text.split(/\r\n?|\n/)) {
    // Prefer readable snippets and allow phrases split by common inline markup.
    const plain = line.trim().replace(/^\s*(?:[#>]+\s*)+/, '')
      .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '')
    const match = pattern.exec(plain) ?? pattern.exec(line)
    if (!match) continue
    const source = match.input
    const start = Math.max(0, match.index - 45)
    const end = Math.min(source.length, match.index + match[0].length + 75)
    return (start ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '')
  }
  return ''
}

export async function searchWikiFiles(syncDir: string, rawQuery: unknown): Promise<WikiSearchResult> {
  const result: WikiSearchResult = { hits: [], total: 0, skipped: 0 }
  if (!syncDir || typeof rawQuery !== 'string') return result
  const query = rawQuery.trim().slice(0, WIKI_QUERY_LIMIT)
  if (!query) return result

  const root = join(syncDir, 'wikis')
  const directories = [{ directory: root, sealed: false }, { directory: join(root, 'sealed'), sealed: true }]
  const files = (await Promise.all(directories.map(async ({ directory, sealed }) => {
    try {
      const entries = await readdir(directory, { withFileTypes: true })
      return entries.filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => ({ directory, sealed, filename: entry.name, month: parseWikiFilename(entry.name)?.yearMonth ?? '' }))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }))).flat()
  files.sort((a, b) => b.month.localeCompare(a.month) ||
    Number(a.sealed) - Number(b.sealed) || a.filename.localeCompare(b.filename))

  for (const { directory, sealed, filename } of files) {
    try {
      const match = excerpt(await readFile(join(directory, filename), 'utf8'), query)
      if (!match) continue
      result.total++
      if (result.hits.length < MAX_HITS) result.hits.push({ filename, sealed, excerpt: match })
    } catch {
      result.skipped++
    }
  }
  return result
}
