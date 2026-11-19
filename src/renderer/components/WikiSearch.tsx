import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { WIKI_QUERY_LIMIT, parseWikiFilename, wikiSearchPattern, type WikiSearchResult } from '../../shared/wiki-search'
import { useWikis } from '../context/WikisContext'
import { Button } from './ui/Controls'
import '../styles/wiki-search.css'

const MATCH_LIMIT = 1000
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, pre, th, td, blockquote'

export function findWikiMatches(container: HTMLElement, query: string): Range[] {
  if (!query.trim()) return []
  const pattern = wikiSearchPattern(query)
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const matches: Range[] = []
  let block: Element | null = null
  let parts: { text: Text; start: number }[] = []
  let content = ''
  function flush(): void {
    let part = 0
    for (const match of content.matchAll(pattern)) {
      const end = match.index + match[0].length
      while (parts[part + 1]?.start <= match.index) part++
      const first = parts[part]
      while (parts[part + 1]?.start < end) part++
      const last = parts[part]
      const range = container.ownerDocument.createRange()
      range.setStart(first.text, match.index - first.start)
      range.setEnd(last.text, end - last.start)
      matches.push(range)
      if (matches.length > MATCH_LIMIT) break
    }
    parts = []
    content = ''
  }
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const owner = node.parentElement?.closest(BLOCKS) ?? container
    if (owner !== block) {
      flush()
      if (matches.length > MATCH_LIMIT) return matches
      block = owner
    }
    if (!node.length) continue
    parts.push({ text: node, start: content.length })
    content += node.data
  }
  flush()
  return matches
}

function MatchedExcerpt({ text, query }: { text: string; query: string }): JSX.Element {
  const match = wikiSearchPattern(query).exec(text)
  if (!match) return <>{text}</>
  return <>{text.slice(0, match.index)}<mark>{match[0]}</mark>{text.slice(match.index + match[0].length)}</>
}

export default function WikiSearch({ input, viewer, highlightDiff, onClose }: {
  input: RefObject<HTMLInputElement>
  viewer: RefObject<HTMLDivElement>
  highlightDiff: boolean
  onClose: () => void
}): JSX.Element {
  const { files, sealedFiles, currentFile, currentContent, currentIsSealed, isLoading, selectFile, selectSealed } = useWikis()
  const [scope, setScope] = useState<'current' | 'all'>('current')
  const [value, setValue] = useState('')
  const [results, setResults] = useState<WikiSearchResult | null>(null)
  const [error, setError] = useState(false)
  const [target, setTarget] = useState<string | null>(null)
  const [ranges, setRanges] = useState<Range[]>([])
  const [index, setIndex] = useState(0)
  const query = value.trim()
  const documentKey = currentFile === null ? null : `${currentIsSealed}:${currentFile}`
  const searchDocument = scope === 'current' || (target !== null && target === documentKey)
  const count = Math.min(ranges.length, MATCH_LIMIT)

  useEffect(() => { input.current?.focus() }, [input])
  useEffect(() => {
    if (!query || scope !== 'all') return
    let stale = false
    setResults(null)
    setError(false)
    const timer = setTimeout(() => {
      void window.api.wikis.search(query).then(result => {
        if (!stale) setResults(result)
      }).catch(() => {
        if (!stale) setError(true)
      })
    }, 220)
    return () => { stale = true; clearTimeout(timer) }
  }, [query, scope, files, sealedFiles])

  useLayoutEffect(() => {
    const body = viewer.current?.querySelector<HTMLElement>('.markdown-body')
    setRanges(body && searchDocument ? findWikiMatches(body, query) : [])
    setIndex(0)
  }, [currentContent, documentKey, query, searchDocument, highlightDiff, viewer])

  useLayoutEffect(() => {
    if (!count || typeof Highlight === 'undefined' || !CSS.highlights) return
    CSS.highlights.set('wiki-matches', new Highlight(...ranges.slice(0, count)))
    return () => { CSS.highlights.delete('wiki-matches') }
  }, [ranges, count])

  useLayoutEffect(() => {
    const match = ranges[index]
    const body = viewer.current?.querySelector<HTMLElement>('.markdown-body')
    if (!match || !body?.contains(match.startContainer)) return
    if (typeof Highlight !== 'undefined' && CSS.highlights) {
      const active = new Highlight(match)
      active.priority = 1
      CSS.highlights.set('wiki-current-match', active)
    }
    const bounds = match.getBoundingClientRect?.()
    if (bounds) body.scrollTop += bounds.top - body.getBoundingClientRect().top - 24
    return () => { if (typeof Highlight !== 'undefined') CSS.highlights?.delete('wiki-current-match') }
  }, [ranges, index, viewer])

  function resetResults(): void {
    setResults(null)
    setError(false)
    setTarget(null)
  }

  function move(offset: number): void {
    if (count) setIndex(previous => (previous + offset + count) % count)
  }

  return <section className="wiki-search" aria-label="搜索 Wiki" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <div className="wiki-search-fields">
      <input ref={input} type="search" aria-label="Wiki 搜索词" placeholder="搜索 Wiki 正文" value={value} maxLength={WIKI_QUERY_LIMIT}
        onChange={event => { if (event.target.value.trim() !== query) resetResults(); setValue(event.target.value) }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && count) {
            event.preventDefault()
            move(event.shiftKey ? -1 : 1)
          }
        }} />
      <select aria-label="Wiki 搜索范围" value={scope} onChange={event => { resetResults(); setScope(event.target.value === 'all' ? 'all' : 'current') }}>
        <option value="current">当前 Wiki</option><option value="all">所有 Wiki</option>
      </select>
      {searchDocument && query && count > 0 && <div className="wiki-search-navigation">
        <span role="status">{index + 1} / {count}{ranges.length > count ? '+' : ''}</span>
        <Button variant="quiet" aria-label="上一处匹配" disabled={count < 2} onClick={() => move(-1)}>↑</Button>
        <Button variant="quiet" aria-label="下一处匹配" disabled={count < 2} onClick={() => move(1)}>↓</Button>
      </div>}
      <Button variant="quiet" icon="close" iconOnly aria-label="关闭 Wiki 搜索" onClick={onClose} />
    </div>
    {scope === 'current' && query && !count && <p role="status">{isLoading ? '正在读取 Wiki…' : !currentFile ? '请先选择一个 Wiki' : currentContent === null ? '无法读取当前 Wiki' : '当前 Wiki 没有匹配'}</p>}
    {scope === 'all' && query && <>
      {error ? <p role="alert">无法搜索 Wiki，请检查同步目录后重试。</p> : <p role="status">{results ?
        (results.total ? `${results.total} 份 Wiki 匹配${results.hits.length < results.total ? `，显示前 ${results.hits.length} 份` : ''}` : '没有匹配的 Wiki') +
        (results.skipped ? `，${results.skipped} 份暂时无法读取` : '') : '正在搜索所有 Wiki…'}</p>}
      {!!results?.hits.length && <ul className="wiki-search-results">
        {results.hits.map(hit => {
          const key = `${hit.sealed}:${hit.filename}`
          const file = parseWikiFilename(hit.filename)
          const label = file ? `${file.category} · ${file.year}年${file.month}月` : hit.filename.slice(0, -3)
          const archiveTime = file?.sealedAt?.replace(/T(\d\d)-(\d\d)-(\d\d)$/, ' $1:$2:$3')
          return <li key={key}><button type="button" aria-current={key === documentKey ? 'true' : undefined} onClick={() => {
            setTarget(key)
            if (key !== documentKey || (currentContent === null && !isLoading)) void (hit.sealed ? selectSealed(hit.filename) : selectFile(hit.filename))
            else setIndex(0)
          }}>
            <strong>{label}{hit.sealed && <small>已封存{archiveTime ? ` ${archiveTime}` : ''}</small>}</strong>
            <span><MatchedExcerpt text={hit.excerpt} query={query} /></span>
          </button></li>
        })}
      </ul>}
      {searchDocument && !count && <p role="status">{isLoading ? '正在读取 Wiki…' : currentContent === null ? '无法读取所选 Wiki' : '所选 Wiki 的渲染正文中没有这一处匹配'}</p>}
    </>}
  </section>
}
