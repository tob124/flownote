import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ArtifactRecord, ArtifactResult } from '../../shared/artifacts'
import type { GoalRecord } from '../../shared/goals'
import type { Note } from '../../shared/types'
import { useConfig } from '../context/ConfigContext'
import '../styles/artifacts.css'
import '../styles/collections.css'

function noteName(note: Note): string { return note.title || note.raw_content.slice(0, 48) || '无标题笔记' }
function draftKey(library: string, id: string): string { return `flownote:artifact-draft:${library}:${id}` }
function initialDraft(library: string, item: ArtifactRecord): { body: string; noteIds: string[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(library, item.id)) || 'null')
    if (saved && typeof saved.body === 'string' && Array.isArray(saved.noteIds)) {
      return { body: saved.body, noteIds: saved.noteIds.filter((id: unknown) => typeof id === 'string') }
    }
  } catch { /* Ignore a damaged local draft. */ }
  const latest = item.versions.at(-1)
  return { body: latest?.body ?? '', noteIds: latest?.sources.map((source) => source.note_id) ?? [] }
}
function goalSeed(goal: GoalRecord): string {
  const lines = [`## ${goal.title}`]
  if (goal.motivation) lines.push(`为什么重要：${goal.motivation}`)
  if (goal.success_signal) lines.push(`期望的进展：${goal.success_signal}`)
  if (goal.decisions.length) {
    lines.push('\n### 当时的决定')
    for (const item of goal.decisions) lines.push(`- ${new Date(item.created_at_ms).toLocaleDateString('zh-CN')}：${item.choice}${item.reason ? `（理由：${item.reason}）` : ''}`)
  }
  if (goal.check_ins.length) {
    lines.push('\n### 后来的回看')
    for (const item of goal.check_ins) lines.push(`- ${new Date(item.created_at_ms).toLocaleDateString('zh-CN')}：${item.observation}`)
  }
  lines.push('\n### 我现在的判断\n')
  return lines.join('\n')
}
export default function ArtifactsPage(): JSX.Element {
  const { config } = useConfig()
  const library = useRef(config.sync_dir)
  library.current = config.sync_dir
  const [items, setItems] = useState<ArtifactRecord[]>([])
  const [goals, setGoals] = useState<GoalRecord[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createTitle, setCreateTitle] = useState('')
  const [createGoal, setCreateGoal] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setSelectedId(null)
    if (!config.sync_dir) { setLoading(false); return () => { active = false } }
    void Promise.all([window.api.artifacts.list(), window.api.goals.list(), window.api.notes.loadAll()])
      .then(([artifacts, goalResult, allNotes]) => {
        if (!active) return
        if (artifacts.ok) { setItems(artifacts.value); setSelectedId(artifacts.value[0]?.id ?? null) }
        else setError(artifacts.error.message)
        if (goalResult.ok) setGoals(goalResult.value)
        setNotes(allNotes)
      }).catch((reason) => { if (active) setError(String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [config.sync_dir])
  const selected = items.find((item) => item.id === selectedId) ?? null
  async function act(request: () => Promise<ArtifactResult<ArtifactRecord>>): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    const start = config.sync_dir
    try {
      const result = await request()
      if (library.current !== start) return false
      if (result.ok) {
        setItems((current) => [result.value, ...current.filter((item) => item.id !== result.value.id)]
          .sort((a, b) => b.updated_at_ms - a.updated_at_ms))
        setSelectedId(result.value.id)
        setError(null)
        return true
      }
      setError(result.error.message)
      if (result.error.code === 'CONFLICT') {
        const latest = await window.api.artifacts.list()
        if (latest.ok && library.current === start) setItems(latest.value)
      }
      return false
    } catch (reason) { setError(String(reason)); return false }
    finally { setBusy(false) }
  }
  async function create(event: FormEvent): Promise<void> {
    event.preventDefault()
    const ok = await act(() => window.api.artifacts.create({ title: createTitle, goal_id: createGoal || undefined }))
    if (ok) { setCreating(false); setCreateTitle(''); setCreateGoal('') }
  }
  return <div className="artifacts-page">
    <header className="artifacts-topbar"><div><span className="goals-eyebrow">YOUR WORK / VERSIONS</span>
      <h1>成果工作台</h1><p>把已确认的经历写成自己的结论；每次保存留下可回看的版本。</p></div>
      <button className="artifacts-primary" onClick={() => setCreating(true)}>新建成果</button></header>
    {error && <div className="artifacts-error" role="alert">{error}<button onClick={() => setError(null)}>关闭</button></div>}
    {notice && <div className="artifacts-notice" role="status">{notice}<button onClick={() => setNotice(null)}>关闭</button></div>}
    <div className="artifacts-layout">
      <aside className="artifacts-list"><div className="artifacts-list-label">成果 <span>{items.length}</span></div>
        {loading ? <p>正在读取…</p> : items.length === 0 ? <p>尚无成果。可以从一个目标的决定与回看开始。</p> :
          items.map((item) => <button key={item.id} className={item.id === selectedId ? 'selected' : ''}
            onClick={() => setSelectedId(item.id)}><strong>{item.title}</strong><span>{item.versions.length} 个版本</span></button>)}
      </aside>
      <main className="artifacts-main">{selected
        ? <ArtifactWorkspace key={selected.id} item={selected} goals={goals} notes={notes} library={config.sync_dir}
            busy={busy} act={act} onNotice={setNotice} onError={setError} />
        : <div className="artifacts-empty"><h2>把思考带出笔记</h2><p>先写一份可以持续修改的成果，而不是让记录停在收藏夹里。</p></div>}</main>
    </div>
    {creating && <div className="collections-modal-backdrop" onClick={() => setCreating(false)}>
      <form className="collections-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void create(event)}>
        <h2>新建成果</h2>
        <label>标题<input autoFocus required maxLength={160} value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} /></label>
        <label>关联目标（可选）<select value={createGoal} onChange={(event) => setCreateGoal(event.target.value)}>
          <option value="">暂不关联</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select></label>
        <div><button type="button" onClick={() => setCreating(false)}>取消</button><button disabled={busy}>创建</button></div>
      </form></div>}
  </div>
}

function ArtifactWorkspace({ item, goals, notes, library, busy, act, onNotice, onError }: {
  item: ArtifactRecord; goals: GoalRecord[]; notes: Note[]; library: string; busy: boolean
  act: (request: () => Promise<ArtifactResult<ArtifactRecord>>) => Promise<boolean>
  onNotice: (value: string) => void; onError: (value: string) => void
}): JSX.Element {
  const initial = useMemo(() => initialDraft(library, item), [library, item.id])
  const [body, setBody] = useState(initial.body)
  const [noteIds, setNoteIds] = useState<string[]>(initial.noteIds)
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState(false)
  const [versionId, setVersionId] = useState<string | null>(item.versions.at(-1)?.id ?? null)
  const versionCount = useRef(item.versions.length)
  const [titleValue, setTitleValue] = useState(item.title)
  useEffect(() => {
    if (item.versions.length > versionCount.current) setVersionId(item.versions.at(-1)?.id ?? null)
    versionCount.current = item.versions.length
  }, [item.versions.length, item.versions])
  const goal = goals.find((entry) => entry.id === item.goal_id)
  const shownVersion = item.versions.find((entry) => entry.id === versionId)
  const linkedNotes = goal ? goal.evidence_note_ids : []
  const available = useMemo(() => notes.filter((note) => {
    const term = query.trim().toLocaleLowerCase()
    return !term || [note.title, note.raw_content, note.summary, note.category, ...(note.tags || [])]
      .some((value) => value?.toLocaleLowerCase().includes(term))
  }).sort((a, b) => Number(linkedNotes.includes(b.id)) - Number(linkedNotes.includes(a.id))).slice(0, 40),
  [notes, query, linkedNotes.join('|')])

  useEffect(() => {
    localStorage.setItem(draftKey(library, item.id), JSON.stringify({ body, noteIds }))
  }, [library, item.id, body, noteIds])

  function toggleSource(id: string): void {
    setNoteIds((current) => current.includes(id) ? current.filter((value) => value !== id)
      : current.length < 12 ? [...current, id] : current)
  }
  async function saveVersion(): Promise<void> {
    const ok = await act(() => window.api.artifacts.saveVersion(item.id, item.revision, body, noteIds))
    if (ok) {
      localStorage.removeItem(draftKey(library, item.id))
      onNotice('版本已保存。旧版本保持不变。')
    }
  }
  async function exportVersion(): Promise<void> {
    if (!versionId) return
    try {
      const result = await window.api.artifacts.export(item.id, versionId)
      if (!result.ok) onError(result.error.message)
      else if (result.value) onNotice('Markdown 已导出。')
    } catch (reason) { onError(String(reason)) }
  }
  async function rename(event: FormEvent): Promise<void> {
    event.preventDefault()
    await act(() => window.api.artifacts.rename(item.id, item.revision, titleValue))
  }
  return <div className="artifact-workspace">
    <div className="artifact-hero"><span className="goals-eyebrow">ARTIFACT / {item.versions.length} VERSIONS</span>
      <form className="artifact-title-form" onSubmit={(event) => void rename(event)}>
        <input aria-label="成果标题" maxLength={160} required value={titleValue} onChange={(event) => setTitleValue(event.target.value)} />
        {titleValue.trim() !== item.title && <button disabled={busy}>保存标题</button>}
      </form>
      <p>{goal ? `来自目标：${goal.title}` : item.goal_id ? '原关联目标暂不可用' : '未关联目标'}</p>
    </div>
    <div className="artifact-content">
      {goal && <section className="artifact-context">
        <div className="collections-section-head"><h3>目标脉络</h3><span>手动加入草稿</span></div>
        <p>包含 {goal.decisions.length} 项决定、{goal.check_ins.length} 次回看。请核对后写出自己的判断。</p>
        <button onClick={() => setBody((current) => current ? `${current}\n\n${goalSeed(goal)}` : goalSeed(goal))}>把目标轨迹加入草稿</button>
      </section>}
      <section className="artifact-editor">
        <div className="artifact-section-title"><h3>当前草稿</h3><div>
          <button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>编辑</button>
          <button className={preview ? 'active' : ''} onClick={() => setPreview(true)}>预览</button>
        </div></div>
        {preview ? <div className="artifact-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{body || '暂无内容'}</ReactMarkdown></div>
          : <textarea aria-label="成果正文" value={body} onChange={(event) => setBody(event.target.value)}
              placeholder="从已有事实、当时的决定和现在的判断开始写。Markdown 可用。" />}
        <p>草稿只保存在本机；点击“保存新版本”后才写入同步目录。可在版本区查看旧稿。</p>
      </section>
      <section className="artifact-sources">
        <div className="collections-section-head"><h3>来源材料</h3><span>{noteIds.length}/12 已选</span></div>
        <input aria-label="搜索成果来源" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="按标题、正文、标签查找；目标关联资料排在前面" />
        <div className="artifact-source-list">{available.map((note) =>
          <label key={note.id}><input type="checkbox" checked={noteIds.includes(note.id)} onChange={() => toggleSource(note.id)} />
            <span>{noteName(note)}{linkedNotes.includes(note.id) && <small>目标资料</small>}</span></label>)}</div>
        <p>导出时附上所选笔记的标题、日期、ID 与保存版本时的原文节选。</p>
      </section>
      <button className="artifacts-primary artifact-save" disabled={busy || !body.trim()} onClick={() => void saveVersion()}>保存新版本</button>
      <section className="artifact-versions">
        <div className="collections-section-head"><h3>版本轨迹</h3><span>保存后不可改写</span></div>
        {item.versions.length === 0 ? <p>还没有正式版本。</p> : <>
          <div className="artifact-version-buttons">{[...item.versions].reverse().map((version) =>
            <button key={version.id} className={versionId === version.id ? 'active' : ''} onClick={() => setVersionId(version.id)}>
              V{version.number} · {new Date(version.created_at_ms).toLocaleDateString('zh-CN')}</button>)}</div>
          {shownVersion && <div className="artifact-version-detail">
            <div className="artifact-version-actions"><span>V{shownVersion.number} · {shownVersion.sources.length} 条来源</span>
              <button onClick={() => { setBody(shownVersion.body); setNoteIds(shownVersion.sources.map((source) => source.note_id)); onNotice('已复制旧版本到草稿；保存时将创建新版本。') }}>从此版继续编辑</button>
              <button onClick={() => void exportVersion()}>导出 Markdown</button></div>
            <div className="artifact-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{shownVersion.body}</ReactMarkdown></div>
          </div>}
        </>}
      </section>
    </div>
  </div>
}
