import { Button } from './ui/Controls'
import { useDraftGuard } from '../utils/useDraftGuard'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Note, NotePatch } from '../../shared/types'
import { useConfig } from '../context/ConfigContext'
import { clearNoteDraft, freshNoteDraft, loadNoteDraft, saveNoteDraft } from '../utils/note-draft'
import AttachmentList from './AttachmentList'
import '../styles/notecard.css'

interface Props {
  note: Note
  onClose: () => void
  onRefresh?: () => void
  scrollTop?: number
  onScroll?: (top: number) => void
}

export default function NoteEditor({ note, onRefresh, scrollTop=0, onScroll }: Props): JSX.Element {
  const { config } = useConfig()
  const library = config.sync_dir
  const [viewNote, setViewNote] = useState(note)
  const [draft, setDraft] = useState(() => loadNoteDraft(window.localStorage, library, note) ?? freshNoteDraft(note))
  const [editing, setEditing] = useState(() => loadNoteDraft(window.localStorage, library, note) !== null)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [attaching,setAttaching]=useState(false)
  const [conflictNote, setConflictNote] = useState<Note | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current=true; return () => { alive.current=false } }, [])
  useEffect(() => { if(scrollRef.current) scrollRef.current.scrollTop=scrollTop }, [note.id])
  useEffect(() => { if(!editing) { setViewNote(note); setDraft(freshNoteDraft(note)) } }, [note])
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function notify(message: string): void {
    if (tipTimer.current) clearTimeout(tipTimer.current)
    setTip(message)
    tipTimer.current = setTimeout(() => setTip(null), 3500)
  }
  function hasUnsavedChanges(): boolean {
    const original = freshNoteDraft(viewNote)
    return draft.raw_content !== original.raw_content || draft.title !== original.title ||
      draft.summary !== original.summary || draft.category !== original.category ||
      draft.tags !== original.tags
  }
  const flush = (): boolean => {
    if(saving||attaching) { setTip('正在保存，请稍候再离开');return false }
    if (!editing || !hasUnsavedChanges()) return true
    const ok=saveNoteDraft(window.localStorage, library, note.id, draft)
    if(!ok) setTip('本机草稿无法保存，请先保存修改再离开。')
    return ok
  }
  useDraftGuard(flush)
  useEffect(() => { if(editing) flush() }, [editing,draft])
  useEffect(() => () => { if(tipTimer.current) clearTimeout(tipTimer.current) }, [])

  async function save(event?: FormEvent): Promise<boolean> {
    event?.preventDefault()
    if (saving) return false
    const tags = draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)
    const patch: NotePatch = {}
    if (draft.raw_content !== viewNote.raw_content) patch.raw_content = draft.raw_content
    if (draft.title !== viewNote.title) patch.title = draft.title
    if (draft.summary !== (viewNote.summary ?? '')) patch.summary = draft.summary
    if (draft.category !== viewNote.category) patch.category = draft.category
    if (JSON.stringify(tags) !== JSON.stringify(viewNote.tags)) patch.tags = tags
    if (Object.keys(patch).length === 0) {
      clearNoteDraft(window.localStorage, library, note.id)
      setEditing(false)
      return true
    }
    setSaving(true)
    try {
      const result = await window.api.notes.patch(viewNote.id, draft.baseRevision, patch)
      if (!alive.current) return false
      if (!result.ok) {
        notify(result.error.message)
        if (result.error.code === 'CONFLICT') {
          const latest = (await window.api.notes.loadAll()).find((item) => item.id === viewNote.id)
          if (latest) setConflictNote(latest)
        }
        return false
      }
      setViewNote(result.value)
      setDraft(freshNoteDraft(result.value))
      setConflictNote(null)
      clearNoteDraft(window.localStorage, library, note.id)
      setEditing(false)
      onRefresh?.()
      notify('笔记已保存')
      return true
    } catch (reason) { notify(`保存失败：${String(reason)}`); return false }
    finally { setSaving(false) }
  }
  function onEditorKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void save()
    }
  }
  function discardDraft(): void {
    clearNoteDraft(window.localStorage, library, note.id)
    setDraft(freshNoteDraft(viewNote))
    setConflictNote(null)
    setEditing(false)
  }

  return (
<div className="note-editor" ref={scrollRef} onScroll={e=>onScroll?.(e.currentTarget.scrollTop)}>
        <div className="note-detail-head">
          <h1 className="note-detail-title">{viewNote.title || '无标题笔记'}</h1>
        </div>
        <div className="note-detail-meta">{viewNote.created_at}<span className={`note-card-status ${viewNote.ai_status}`}>
          {viewNote.ai_status === 'done' ? '' : viewNote.ai_status === 'processing' ? '处理中' : viewNote.ai_status === 'failed' ? '整理失败' : '等待整理'}
        </span></div>
        <div className="note-detail-toolbar">
          <Button onClick={() => {if(flush()){if(!editing)setDraft(loadNoteDraft(localStorage,library,note)??freshNoteDraft(viewNote));setEditing(!editing)}}}>{editing ? '阅读' : '编辑笔记'}</Button>
          <Button variant="quiet" icon="clip" disabled={attaching} onClick={()=>void (async()=>{setAttaching(true);try{const files=await window.api.files.select();if(!alive.current||!files.length)return;await window.api.files.attach(note.id,files);if(alive.current){onRefresh?.();notify('附件已添加')}}catch(e){if(alive.current)notify(String(e))}finally{if(alive.current)setAttaching(false)}})()}>添加附件</Button>
          {editing && <><Button variant="quiet" onClick={discardDraft}>丢弃草稿</Button><span>Ctrl+S 保存</span></>}
        </div>
        {editing ? (
          <form className="note-edit-form" onSubmit={(event) => void save(event)} onKeyDown={onEditorKey}>
            {conflictNote && <div className="note-edit-conflict" role="alert">
              <strong>磁盘上的笔记已有更新，草稿未覆盖它。</strong>
              <details><summary>查看当前磁盘版本</summary><p>{conflictNote.raw_content}</p></details>
              <button className="ui-button ui-button-secondary" type="button" onClick={() => {
                setViewNote(conflictNote)
                setDraft((current) => ({ ...current, baseRevision: conflictNote.revision ?? 0 }))
                setConflictNote(null)
              }}>我已核对，以草稿继续编辑</button>
            </div>}
            <label>标题<input maxLength={2000} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label>
            <details className="note-properties"><summary>笔记属性</summary><label>分类<select value={draft.category} onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value }))}>
              {[...new Set(['Inbox', draft.category, ...config.categories])].map((category) => <option key={category}>{category}</option>)}
            </select></label>
            <label>摘要<textarea rows={2} maxLength={2000} value={draft.summary} onChange={(event) => setDraft((value) => ({ ...value, summary: event.target.value }))} /></label>
            <label>标签（用逗号分隔）<input value={draft.tags} onChange={(event) => setDraft((value) => ({ ...value, tags: event.target.value }))} /></label></details>
            <div className="note-edit-tabs"><button className={!preview ? 'active' : ''} type="button" onClick={() => setPreview(false)}>编辑正文</button><button className={preview ? 'active' : ''} type="button" onClick={() => setPreview(true)}>预览</button></div>
            {preview ? <div className="note-edit-preview markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.raw_content}</ReactMarkdown></div> :
              <textarea className="note-edit-body" aria-label="笔记正文" rows={14} maxLength={1000000} value={draft.raw_content} onChange={(event) => setDraft((value) => ({ ...value, raw_content: event.target.value }))} />}
            <div className="editor-actions"><Button variant="primary" type="submit" disabled={saving}>保存修改</Button><span className="editor-hint">关闭后，本机草稿仍会保留</span></div>
          </form>
        ) : <>
          <details className="note-properties"><summary>笔记信息</summary><p>{viewNote.category}</p>{viewNote.summary && <p>{viewNote.summary}</p>}<p>{viewNote.tags?.map(t=>'#'+t).join(' ')}</p></details>
          <div className="note-detail-content markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{viewNote.raw_content}</ReactMarkdown></div>

          <AttachmentList note={viewNote} onSaved={setViewNote} onRefresh={onRefresh} onNotify={notify} />
        </>}
        {tip && <div className="note-card-tip" role="status">{tip}</div>}
    </div>
  )
}
