import { useMemo, useState } from 'react'
import { useNotes } from '../context/NotesContext'
import '../styles/searchbar.css'

export default function SearchBar(): JSX.Element {
  const { notes, searchKeyword, setSearchKeyword, filters, setFilters, clearFilters } = useNotes()
  const [expanded, setExpanded] = useState(false)
  const categories = useMemo(() => [...new Set(notes.map((note) => note.category).filter(Boolean))].sort(), [notes])
  const tags = useMemo(() => [...new Set(notes.flatMap((note) => note.tags || []))].sort(), [notes])
  const activeCount = Number(!!filters.category) + Number(filters.favoriteOnly) + Number(!!filters.status) +
    filters.tags.length + Number(!!filters.from) + Number(!!filters.to) + Number(filters.sort !== 'newest')
  function toggleTag(tag: string): void {
    setFilters({ ...filters, tags: filters.tags.includes(tag)
      ? filters.tags.filter((item) => item !== tag) : [...filters.tags, tag] })
  }
  return <div className="note-search">
    <div className="note-search-row">
      <input type="search" aria-label="搜索笔记" placeholder="搜索标题、正文、摘要、分类与标签…"
        value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} />
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        筛选{activeCount ? ` · ${activeCount}` : ''}
      </button>
    </div>
    {expanded && <div className="note-filter-panel">
      <label>分类<select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
        <option value="">全部分类</option>
        {[...new Set([...categories, filters.category])].filter(Boolean).map((category) => <option key={category}>{category}</option>)}
      </select></label>
      <label>处理状态<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as typeof filters.status })}>
        <option value="">全部状态</option><option value="pending">等待</option><option value="processing">处理中</option>
        <option value="done">完成</option><option value="failed">失败</option>
      </select></label>
      <label>起始日期<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>结束日期<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <label>排序<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as typeof filters.sort })}>
        <option value="newest">新到旧</option><option value="oldest">旧到新</option>
      </select></label>
      <label className="note-filter-check"><input type="checkbox" checked={filters.favoriteOnly}
        onChange={(event) => setFilters({ ...filters, favoriteOnly: event.target.checked })} />只看收藏</label>
      {tags.length > 0 && <fieldset className="note-filter-tags"><legend>标签（所选标签之间按“或”匹配）</legend>
        {tags.map((tag) => <label key={tag}><input type="checkbox" checked={filters.tags.includes(tag)}
          onChange={() => toggleTag(tag)} />{tag}</label>)}
      </fieldset>}
      <button className="note-filter-clear" type="button" onClick={clearFilters}>清除筛选</button>
    </div>}
  </div>
}
