import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Note } from '../../shared/types'
import type { CollectionRecord, CollectionResult } from '../../shared/collections'
import { useConfig } from '../context/ConfigContext'
import NoteDetailDialog from '../components/NoteDetailDialog'
import '../styles/collections.css'

function noteName(note: Note): string { return note.title || note.raw_content.slice(0, 52) || '无标题笔记' }
export default function CollectionsPage(): JSX.Element {
  const { config } = useConfig()
  const library = useRef(config.sync_dir)
  library.current = config.sync_dir
  const [items, setItems] = useState<CollectionRecord[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState<'create' | 'update' | null>(null)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [openNote, setOpenNote] = useState<Note | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setItems([])
    setSelectedId(null)
    if (!config.sync_dir) { setLoading(false); return () => { active = false } }
    void Promise.all([window.api.collections.list(), window.api.notes.loadAll()])
      .then(([result, allNotes]) => {
        if (!active) return
        if (result.ok) {
          setItems(result.value)
          setSelectedId(result.value[0]?.id ?? null)
        } else setError(result.error.message)
        setNotes(allNotes)
      }).catch((reason) => { if (active) setError(String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [config.sync_dir])

  const selected = items.find((item) => item.id === selectedId) ?? null
  const noteMap = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes])
  const matching = useMemo(() => {
    if (!selected) return []
    const term = query.trim().toLocaleLowerCase()
    const found = notes.filter((note) => !selected.note_ids.includes(note.id) &&
      (!term || [note.title, note.raw_content, note.summary, note.category, ...(note.tags || [])]
        .some((value) => value?.toLocaleLowerCase().includes(term))))
    return found.slice(0, 40)
  }, [notes, selected, query])

  async function refreshNotes(): Promise<void> {
    try { setNotes(await window.api.notes.loadAll()) } catch (reason) { setError(String(reason)) }
  }
  function accept(value: CollectionRecord): void {
    setItems((current) => [value, ...current.filter((item) => item.id !== value.id)]
      .sort((a, b) => b.updated_at_ms - a.updated_at_ms))
    setSelectedId(value.id)
    setError(null)
  }
  async function act(request: () => Promise<CollectionResult<CollectionRecord>>): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    const start = config.sync_dir
    try {
      const result = await request()
      if (library.current !== start) return false
      if (result.ok) { accept(result.value); return true }
      setError(result.error.message)
      if (result.error.code === 'CONFLICT') {
        const latest = await window.api.collections.list()
        if (latest.ok && library.current === start) setItems(latest.value)
      }
      return false
    } catch (reason) {
      setError(String(reason))
      return false
    } finally { setBusy(false) }
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    const current = selected
    const ok = editing === 'create'
      ? await act(() => window.api.collections.create({ name, description }))
      : current ? await act(() => window.api.collections.update(current.id, current.revision, { name, description })) : false
    if (ok) { setEditing(null); setName(''); setDescription('') }
  }
  async function remove(): Promise<void> {
    if (!selected || busy) return
    setBusy(true)
    try {
      const result = await window.api.collections.delete(selected.id, selected.revision)
      if (!result.ok) throw new Error(result.error.message)
      const remaining = items.filter((item) => item.id !== selected.id)
      setItems(remaining)
      setSelectedId(remaining[0]?.id ?? null)
      setDeleteConfirm(false)
      setError(null)
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return (
    <div className="collections-page">
      <header className="collections-topbar">
        <div><span className="goals-eyebrow">LIBRARY / TOPICS</span><h1>主题知识库</h1>
          <p>把不同分类中的笔记放在同一议题下；原笔记只保留一份。</p></div>
        <button className="collections-primary" onClick={() => { setName(''); setDescription(''); setEditing('create') }}>新建知识库</button>
      </header>
      {error && <div className="collections-error" role="alert">{error}</div>}
      <div className="collections-layout">
        <aside className="collections-list" aria-label="知识库列表">
          <div className="collections-list-label">知识库 <span>{items.length}</span></div>
          {loading ? <p>正在读取…</p> : items.length === 0 ? <p>还没有知识库。为一个长期议题建立资料空间。</p> :
            items.map((item) => <button key={item.id} className={item.id === selectedId ? 'selected' : ''}
              onClick={() => { setSelectedId(item.id); setAdding(false); setDeleteConfirm(false) }}>
              <strong>{item.name}</strong><span>{item.note_ids.length} 篇关联笔记</span>
            </button>)}
        </aside>
        <main className="collections-main">
          {!selected ? <div className="collections-empty"><h2>给资料一个共同语境</h2><p>例如“英语阅读方法”可以同时包含个人记录、工作笔记与网页摘要。</p></div> : (
            <>
              <div className="collections-hero">
                <span className="goals-eyebrow">KNOWLEDGE SPACE</span>
                <h2>{selected.name}</h2><p>{selected.description || '尚无说明'}</p>
                <div className="collections-hero-actions">
                  <button onClick={() => { setName(selected.name); setDescription(selected.description); setEditing('update') }}>编辑信息</button>
                  <button onClick={() => setAdding((value) => !value)}>{adding ? '收起选择器' : '添加资料'}</button>
                  <button onClick={() => setDeleteConfirm(true)}>删除知识库</button>
                </div>
                {deleteConfirm && <div className="collections-confirm">
                  <strong>仅删除知识库，原笔记保留。</strong>
                  <button disabled={busy} onClick={() => void remove()}>确认删除</button>
                  <button onClick={() => setDeleteConfirm(false)}>取消</button>
                </div>}
              </div>
              <div className="collections-content">
                {adding && <section className="collections-add">
                  <h3>选择已有笔记</h3>
                  <input aria-label="搜索可添加的笔记" value={query} onChange={(event) => setQuery(event.target.value)}
                    placeholder="按标题、正文、摘要、分类或标签查找" />
                  <p>只显示当前库中的前 40 条候选；添加由你确认。</p>
                  <div className="collections-candidates">
                    {matching.map((note) => <div key={note.id}>
                      <span>{noteName(note)} <small>· {note.category}</small></span>
                      <button disabled={busy} onClick={() => void act(() => window.api.collections.linkNote(selected.id, selected.revision, note.id, true))}>加入</button>
                    </div>)}
                    {matching.length === 0 && <p>暂无匹配的笔记</p>}
                  </div>
                </section>}
                <section className="collections-materials">
                  <div className="collections-section-head"><h3>资料</h3><span>{selected.note_ids.filter((id) => noteMap.has(id)).length} 篇可用</span></div>
                  {selected.note_ids.length === 0 ? <p>尚无资料。添加笔记后，它会保留原来的分类和 Wiki 归属。</p> :
                    selected.note_ids.map((id) => {
                      const note = noteMap.get(id)
                      return <article key={id} className="collections-material">
                        <div><strong>{note ? noteName(note) : '资料暂不可用或已移入回收站'}</strong>
                          {note && <p>{note.summary || note.raw_content.slice(0, 150)}</p>}</div>
                        <div className="collections-material-actions">
                          {note && <button onClick={() => setOpenNote(note)}>阅读</button>}
                          <button disabled={busy} onClick={() => void act(() => window.api.collections.linkNote(selected.id, selected.revision, id, false))}>移出</button>
                        </div>
                      </article>
                    })}
                </section>
              </div>
            </>
          )}
        </main>
      </div>
      {editing && <div className="collections-modal-backdrop" onClick={() => setEditing(null)}>
        <form className="collections-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
          <h2>{editing === 'create' ? '新建知识库' : '编辑知识库'}</h2>
          <label>名称<input autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>说明<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></label>
          <div><button type="button" onClick={() => setEditing(null)}>取消</button><button type="submit" disabled={busy}>保存</button></div>
        </form>
      </div>}
      {openNote && <NoteDetailDialog note={openNote} onClose={() => setOpenNote(null)} onRefresh={refreshNotes} />}
    </div>
  )
}
