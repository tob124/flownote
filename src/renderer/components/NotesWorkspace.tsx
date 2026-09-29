import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNotes } from '../context/NotesContext'
import { useConfig } from '../context/ConfigContext'
import { noteDate } from '../../shared/note-time'
import { mayLeave, readWorkspace, writeWorkspace, type WorkspaceState } from '../utils/workspace'
import SearchBar from './SearchBar'
import QuickInput from './QuickInput'
import NoteEditor from './NoteEditor'
import ThoughtPanel from './ThoughtPanel'
import { ActionMenu, Button } from './ui/Controls'
import { SpatialPanel, Splitter } from './ui/SpatialPanel'

export default function NotesWorkspace({ onTrash }: { onTrash: () => void }): JSX.Element {
  const { config } = useConfig()
  return <Workspace key={config.sync_dir} dir={config.sync_dir} onTrash={onTrash}/>
}
function Workspace({ dir, onTrash }: { dir: string; onTrash: () => void }): JSX.Element {
  const { notes, filteredNotes, isLoading, isRefreshing, error, loadNotes, focusId, focusRequest, searchKeyword, filters, savedId, revealNote, deleteNote } = useNotes()
  const [prefs, setPrefs] = useState(() => readWorkspace(dir))
  const prefsRef = useRef(prefs)
  const [selected, setSelected] = useState<string | null>(prefs.selected)
  const [creating, setCreating] = useState(false)
  const [ai, setAi] = useState(false)
  const [focused, setFocused] = useState(false)
  const [browse, setBrowse] = useState(false)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [available, setAvailable] = useState(window.innerWidth - 64)
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const scrollTimer=useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(()=>()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);writeWorkspace(dir,prefsRef.current)},[dir])
  const recordScroll=(patch:Partial<WorkspaceState>):void=>{prefsRef.current={...prefsRef.current,...patch};if(scrollTimer.current)clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(()=>writeWorkspace(dir,prefsRef.current),150)}
  const [page, setPage] = useState(prefs.page || 1)
  const [snapshot, setSnapshot] = useState<string[]>([])
  const [highlight, setHighlight] = useState<string | null>(null)
  const queryKey = JSON.stringify([searchKeyword, filters])
  const previousQuery = useRef(queryKey)
  const snapshotReady = useRef(false)
  const currentIds = filteredNotes.map(n => n.id)
  const hasUpdates = snapshot.join('|') !== currentIds.join('|')
  const pageCount = Math.max(1, Math.ceil(snapshot.length / 30))
  function changePage(value: number): void {
    const next = Math.max(1, Math.min(pageCount, value))
    setPage(next); update({ page: next, listScroll: 0 })
    if (listScroll.current) listScroll.current.scrollTop = 0
  }
  function locate(id: string, ids = snapshot): void {
    const index = ids.indexOf(id)
    if (index < 0) { setNotice('当前笔记不在浏览结果中，请清除筛选并定位。'); return }
    const next = Math.floor(index / 30) + 1
    setPage(next); update({ page: next }); setHighlight(id)
    requestAnimationFrame(() => {
      const row = document.getElementById('note-' + id)
      const list = listScroll.current
      if (row && list) list.scrollTop = row.offsetTop - list.offsetTop
    })
  }
  useEffect(() => {
    if (isLoading || (!snapshotReady.current && !notes.length)) return
    if (!snapshotReady.current || previousQuery.current !== queryKey) {
      const changed = snapshotReady.current && previousQuery.current !== queryKey
      snapshotReady.current = true; previousQuery.current = queryKey
      setSnapshot(currentIds)
      if(!changed && page>Math.max(1,Math.ceil(currentIds.length/30))){const next=Math.max(1,Math.ceil(currentIds.length/30));setPage(next);update({page:next})}
      if (changed) { setPage(1); update({ page: 1, listScroll: 0 }); if(listScroll.current) listScroll.current.scrollTop=0 }
    }
  }, [queryKey, filteredNotes, isLoading])
  useEffect(() => { if (!highlight) return; const timer=setTimeout(()=>setHighlight(null),1800); return()=>clearTimeout(timer) }, [highlight])
  function applyUpdates(): void {
    const list = listScroll.current
    const rows = list ? Array.from(list.querySelectorAll<HTMLElement>('.workspace-note')) : []
    const anchor = rows.find(row => row.getBoundingClientRect().bottom > list!.getBoundingClientRect().top)
    const id = anchor?.id.slice(5)
    const offset = anchor && list ? anchor.getBoundingClientRect().top-list.getBoundingClientRect().top : 0
    setSnapshot(currentIds)
    const index = id ? currentIds.indexOf(id) : -1
    const next = index >= 0 ? Math.floor(index/30)+1 : Math.min(page,Math.max(1,Math.ceil(currentIds.length/30)))
    setPage(next); update({page:next})
    requestAnimationFrame(()=>{const row=id?document.getElementById('note-'+id):null;if(list && row) list.scrollTop=row.offsetTop-list.offsetTop-offset})
  }
  const initialized = useRef(false)
  const shell = useRef<HTMLDivElement>(null)
  const listScroll = useRef<HTMLDivElement>(null)
  const reader = useRef<HTMLDivElement>(null)
  const aiTrigger = useRef<HTMLButtonElement>(null)
  const lastFocus = useRef<string | null>(null)
  const note = notes.find(n => n.id === selected)
  const update = (patch: Partial<WorkspaceState>): void => { setPrefs(() => { const next = { ...prefsRef.current, ...patch }; prefsRef.current=next;writeWorkspace(dir, next); return next }) }
  const navigate = (action: () => void): void => { if (mayLeave()) { setConfirmDelete(false); action() } }
  function select(id: string): void { navigate(() => { setSelected(id); setCreating(false); setBrowse(false); update({ selected: id }); if (windowWidth < 1100) setAi(false) }) }
  function newNote(): void { navigate(() => { setCreating(true); setAi(false); setBrowse(false); setNotice('') }) }
  function toggleAi(): void {
    navigate(() => { if (ai) aiTrigger.current?.focus({ preventScroll: true }); setAi(!ai) })
  }
  useLayoutEffect(() => {
    const resize = (): void => { setWindowWidth(window.innerWidth); setAvailable(shell.current?.clientWidth || window.innerWidth) }
    resize(); window.addEventListener('resize', resize)
    const observer = new ResizeObserver(resize); observer.observe(shell.current!)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize) }
  }, [])
  useEffect(() => {
    if (isLoading) return
    if (!initialized.current && notes.length) {
      initialized.current = true
      const id = notes.some(n => n.id === prefsRef.current.selected) ? prefsRef.current.selected! : notes[0].id
      setSelected(id); update({ selected: id })
      requestAnimationFrame(() => { if (listScroll.current) listScroll.current.scrollTop = prefsRef.current.listScroll })
    }
  }, [notes, isLoading])
  useEffect(() => {
    if (focusId && String(focusRequest) !== lastFocus.current && notes.some(n => n.id === focusId)) {
      lastFocus.current = String(focusRequest); select(focusId)
      setSnapshot(currentIds); locate(focusId, currentIds)
    }
  }, [focusId, focusRequest, notes])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('flownote:focus-mode', { detail: focused }))
    return () => { window.dispatchEvent(new CustomEvent('flownote:focus-mode', { detail: false })) }
  }, [focused])
  const narrow = windowWidth < 1100
  const aiWidth = Math.min(prefs.aiWidth, Math.max(360, available - 606))
  const showAi = ai && !!note && !creating
  const aiOnly = showAi && (narrow || available < 966)
  const showList = !focused && (narrow ? browse || (!note && !creating) : !showAi || (windowWidth >= 1600 && available >= prefs.listWidth + aiWidth + 612))
  const showReader = !(narrow && showList)
  const listWidth = narrow ? available : Math.min(prefs.listWidth, Math.max(240, available - 606))

  useLayoutEffect(()=>{if(reader.current)reader.current.inert=aiOnly},[aiOnly])
  const wasAi=useRef(false)
  useEffect(()=>{
    if(showAi&&!wasAi.current) shell.current?.querySelector<HTMLButtonElement>('.workspace-ai [role=tab][aria-selected=true]')?.focus({ preventScroll: true })
    if(!showAi&&wasAi.current) aiTrigger.current?.focus({ preventScroll: true })
    wasAi.current=showAi
  },[showAi])
  useEffect(()=>{
    if(narrow&&!showList&&!showAi) reader.current?.focus({preventScroll:true})
  },[selected,showList,showAi,narrow])
  useEffect(()=>{if(creating)shell.current?.querySelector<HTMLTextAreaElement>('#quick-note')?.focus({ preventScroll: true })},[creating])

  return <div className="notes-workspace" ref={shell} data-focused={focused} data-ai-overlay={narrow || available < 966}>
    <SpatialPanel open={showList} side="left" width={listWidth} className="workspace-library">
      <header className="library-heading"><h1>笔记</h1><Button variant="primary" icon="note" onClick={newNote}>新建笔记</Button></header>
      <SearchBar/>
      <div className="library-meta"><span>{snapshot.length} 篇{isRefreshing ? ' · 正在刷新…' : ''}</span><Button variant="quiet" icon="trash" iconOnly aria-label="回收站" onClick={() => navigate(onTrash)}/></div>
      <div className="library-actions"><Button variant="quiet" disabled={!selected} onClick={() => selected && locate(selected)}>定位到当前</Button>{hasUpdates && <Button variant="quiet" onClick={applyUpdates}>有更新</Button>}</div>
      <div className="workspace-note-list" ref={listScroll} onScroll={e => recordScroll({ listScroll: e.currentTarget.scrollTop })} aria-label="笔记列表">
        {isLoading && !notes.length && <p className="workspace-empty">正在读取笔记…</p>}
        {!isLoading && !filteredNotes.length && <p className="workspace-empty">没有符合当前条件的笔记</p>}
        {snapshot.slice((page-1)*30, page*30).map(id => { const n=notes.find(item=>item.id===id); return !n ? <div key={id} className="workspace-note" aria-disabled="true">已移除</div> : <button key={n.id} id={'note-' + n.id} className="workspace-note" data-located={highlight===n.id} aria-current={n.id === selected && !creating ? 'true' : undefined} onClick={() => select(n.id)}>
          <strong>{n.title || n.raw_content.slice(0, 60) || '无标题笔记'}</strong><p>{n.raw_content}</p>
          <span>{noteDate(n)}{n.favorite ? ' · 已收藏' : ''}{n.ai_status === 'failed' ? ' · 整理失败' : n.ai_status === 'processing' ? ' · 整理中' : n.ai_status === 'pending' ? ' · 等待整理' : ''}</span>
        </button>})}
      </div>
      <nav className="library-pagination" aria-label="笔记分页"><Button variant="quiet" disabled={page<=1} onClick={()=>changePage(page-1)}>上一页</Button><label><input aria-label="页码" type="number" min={1} max={pageCount} value={page} onChange={e=>changePage(Number(e.target.value)||1)}/> / {pageCount}</label><Button variant="quiet" disabled={page>=pageCount} onClick={()=>changePage(page+1)}>下一页</Button></nav>
    </SpatialPanel>
    {showList && !narrow && <Splitter label="笔记列表宽度" value={listWidth} min={240} max={Math.min(400, available - 606)} reset={280} onChange={v => update({ listWidth: v })}/>}
    <main aria-hidden={aiOnly || undefined} ref={reader} tabIndex={-1} className="workspace-reader" hidden={!showReader} aria-label="笔记工作区">
      <header className="workspace-toolbar">
        {(!showList || narrow) && <Button variant="quiet" onClick={() => navigate(() => { setFocused(false); setAi(false); setBrowse(true) })}>笔记列表</Button>}
        {!showList && <Button variant="quiet" icon="note" onClick={newNote}>新建</Button>}
        <span className="workspace-context">{creating ? '记录' : '阅读'}</span>
        <Button variant="quiet" onClick={() => update({ wide: !prefs.wide })} aria-pressed={prefs.wide}>{prefs.wide ? '宽幅' : '舒适'}</Button>
        <Button variant="quiet" icon="expand" iconOnly aria-label={focused ? '退出专注' : '专注阅读'} title={focused ? '退出专注' : '专注阅读'} onClick={() => setFocused(v => !v)}/>
        {note && !creating && <><Button ref={aiTrigger} variant={ai ? 'secondary' : 'quiet'} icon="spark" aria-expanded={showAi} onClick={toggleAi}>AI 思考</Button>
          <ActionMenu label="笔记更多操作" items={[
            { label: note.favorite ? '取消收藏' : '收藏笔记', icon: 'star', onSelect: () => { void window.api.notes.patch(note.id, note.revision ?? 0, { favorite: !note.favorite }).then(r => { if (!r.ok) setNotice(r.error.message); void loadNotes() }).catch(e => setNotice(String(e))) } },
            { label: '移至回收站', icon: 'trash', danger: true, separator: true, onSelect: () => setConfirmDelete(true) }
          ]}/></>}
      </header>
      {error && <p className="workspace-notice" role="alert">{error} <Button onClick={() => void loadNotes()}>重试</Button></p>}
      {notice && <p className="workspace-notice" role="status">{notice}{notice.includes('清除筛选') && selected && <Button onClick={()=>{revealNote(selected);setNotice('')}}>清除筛选并定位</Button>}</p>}
      {savedId && !filteredNotes.some(n => n.id === savedId) && <p className="workspace-notice" role="status">已保存，当前筛选未显示这条笔记。<Button variant="quiet" onClick={() => revealNote(savedId)}>查看笔记</Button></p>}
      {confirmDelete && <div className="workspace-notice" role="group" aria-label="删除确认">将这条笔记移至回收站？<Button variant="danger" onClick={() => { if (mayLeave()) void deleteNote(note!.id).then(ok => { if (ok) { setConfirmDelete(false); setSelected(null); setAi(false) } }) }}>确认移除</Button><Button onClick={() => setConfirmDelete(false)}>取消</Button></div>}
      <div className={'workspace-document' + (prefs.wide ? ' is-wide' : '')}>
        {creating || (!note && !notes.length && !isLoading) ? <QuickInput workspace onSaved={(id, warning) => { setSelected(id); update({ selected: id }); setCreating(false); setNotice(warning || '笔记已保存') }}/>
          : note ? <NoteEditor key={dir + ':' + note.id} note={note} onClose={() => {}} onRefresh={() => void loadNotes()} scrollTop={prefsRef.current.scroll[note.id] || 0} onScroll={top => recordScroll({ scroll: { ...prefsRef.current.scroll, [note.id]: top } })}/>
          : <div className="workspace-empty"><h2>选一条笔记，继续阅读</h2><p>或开始记录一个新的想法。</p><Button onClick={newNote}>新建笔记</Button></div>}
      </div>
    </main>
    {showAi && !aiOnly && <Splitter label="AI 面板宽度" value={aiWidth} min={360} max={Math.min(520, available - (showList ? listWidth + 6 : 0) - 606)} reset={400} reverse onChange={v => update({ aiWidth: v })}/>}
    <SpatialPanel open={showAi} side="right" width={aiOnly ? available : aiWidth} className="workspace-ai">
      <header className="workspace-ai-heading"><strong>思考</strong><Button variant="quiet" aria-label="关闭思考面板" onClick={toggleAi}>{aiOnly ? '返回笔记' : '收起'}</Button></header>
      <div className="workspace-ai-content">{note && !creating && <ThoughtPanel key={dir + ':' + note.id} owner={{ kind: 'note', id: note.id }} embedded/>}</div>
    </SpatialPanel>
  </div>
}
