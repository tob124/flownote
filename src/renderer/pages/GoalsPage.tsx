import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Note } from '../../shared/types'
import type { CollectionRecord } from '../../shared/collections'
import type {
  CheckInOutcome, CommitmentStatus, GoalRecord, GoalResult, GoalStatus
} from '../../shared/goals'
import { suggestGoalNotes } from '../../shared/goal-candidates'
import { useConfig } from '../context/ConfigContext'
import { loadReviewDraft, saveReviewDraft } from '../utils/goal-draft'
import NoteDetailDialog from '../components/NoteDetailDialog'
import '../styles/goals.css'

type Tab = 'overview' | 'review' | 'evidence' | 'history'
const STATUS: Record<GoalStatus, string> = {
  active: '推进中', paused: '暂缓', completed: '已完成'
}
const OUTCOME: Record<CheckInOutcome, string> = {
  progress: '有进展', blocked: '遇到阻碍', changed: '调整方向', unknown: '需要厘清'
}
const COMMITMENT: Record<CommitmentStatus, string> = {
  open: '待推进', done: '已完成', dropped: '不再执行'
}
function dateTime(ms: number): string {
  return new Date(ms).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}
function noteTime(note: Note): number {
  return note.created_at_ms || Number(note.id) || Date.parse(note.created_at) || 0
}
function noteName(note: Note): string {
  return note.title || note.raw_content.slice(0, 42) || '无标题笔记'
}

export default function GoalsPage(): JSX.Element {
  const { config } = useConfig()
  const libraryRef = useRef(config.sync_dir)
  libraryRef.current = config.sync_dir
  const [goals, setGoals] = useState<GoalRecord[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [collections, setCollections] = useState<CollectionRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newMotivation, setNewMotivation] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setSelectedId(null)
    if (!config.sync_dir) {
      setGoals([])
      setNotes([])
      setCollections([])
      setLoading(false)
      return () => { active = false }
    }
    void Promise.allSettled([window.api.goals.list(), window.api.notes.loadAll(), window.api.collections.list()])
      .then(([goalResult, noteResult, topicResult]) => {
        if (!active) return
        const problems: string[] = []
        if (goalResult.status === 'fulfilled') {
          if (goalResult.value.ok) {
            const availableGoals = goalResult.value.value
            setGoals(availableGoals)
            setSelectedId((current) => availableGoals.some((g) => g.id === current)
              ? current : availableGoals[0]?.id ?? null)
          } else problems.push(goalResult.value.error.message)
        } else problems.push(String(goalResult.reason))
        if (noteResult.status === 'fulfilled') setNotes(noteResult.value)
        else problems.push(`笔记读取失败：${String(noteResult.reason)}`)
        if (topicResult.status === 'fulfilled') {
          if (topicResult.value.ok) setCollections(topicResult.value.value)
          else problems.push(topicResult.value.error.message)
        } else problems.push(`知识库读取失败：${String(topicResult.reason)}`)
        setError(problems.join('；') || null)
      }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [config.sync_dir])

  const selected = goals.find((goal) => goal.id === selectedId) ?? null
  function accept(goal: GoalRecord): void {
    setGoals((current) => [goal, ...current.filter((item) => item.id !== goal.id)]
      .sort((a, b) => b.updated_at_ms - a.updated_at_ms))
    setSelectedId(goal.id)
    setError(null)
  }
  async function act(request: () => Promise<GoalResult<GoalRecord>>): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    const libraryAtStart = config.sync_dir
    try {
      const result = await request()
      if (libraryRef.current !== libraryAtStart) return false
      if (result.ok) { accept(result.value); return true }
      setError(result.error.message)
      if (result.error.code === 'CONFLICT') {
        const latest = await window.api.goals.list()
        if (latest.ok && libraryRef.current === libraryAtStart) setGoals(latest.value)
      }
      return false
    } catch (reason) {
      setError(String(reason))
      return false
    } finally { setBusy(false) }
  }
  async function create(event: FormEvent): Promise<void> {
    event.preventDefault()
    const ok = await act(() => window.api.goals.create({ title: newTitle, motivation: newMotivation }))
    if (ok) { setNewTitle(''); setNewMotivation(''); setCreating(false) }
  }

  return (
    <main className="goals-page">
      <header className="goals-topbar">
        <div>
          <div className="goals-eyebrow">YOUR DIRECTION</div>
          <h1>我的目标</h1>
          <p>保留当时的决定，看清后来发生了什么。</p>
        </div>
        <button className="goal-button primary" type="button" onClick={() => setCreating(true)}>＋ 新目标</button>
      </header>
      {error && <div className="goal-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>关闭</button></div>}
      <div className="goals-layout">
        <aside className="goals-list" aria-label="目标列表">
          <div className="goals-list-heading">正在关注 <span>{goals.length}</span></div>
          {creating && (
            <form className="goal-create" onSubmit={(event) => void create(event)}>
              <label htmlFor="new-goal-title">想推进什么？</label>
              <input id="new-goal-title" autoFocus maxLength={160} value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)} placeholder="例如：建立英文阅读习惯" required />
              <label htmlFor="new-goal-why">为什么重要（可选）</label>
              <textarea id="new-goal-why" rows={3} maxLength={2000} value={newMotivation}
                onChange={(event) => setNewMotivation(event.target.value)} />
              <div className="goal-inline-actions">
                <button className="goal-button primary" disabled={busy} type="submit">保存目标</button>
                <button className="goal-button quiet" type="button" onClick={() => setCreating(false)}>取消</button>
              </div>
            </form>
          )}
          {goals.map((goal) => (
            <button key={goal.id} type="button"
              className={`goal-list-item${selectedId === goal.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(goal.id)}>
              <span className="goal-list-item-title">{goal.title}</span>
              <span className="goal-list-item-meta">{STATUS[goal.status]} · {goal.check_ins.length} 次回看</span>
            </button>
          ))}
          {!loading && goals.length === 0 && !creating && (
            <p className="goal-list-empty">这里还没有目标。先写下你真正想推进的一件事。</p>
          )}
        </aside>
        <div className="goals-main">
          {loading ? <div className="goals-empty">正在读取目标…</div> : selected ? (
            <GoalWorkspace key={selected.id} goal={selected} notes={notes} collections={collections} busy={busy} act={act}
              libraryKey={config.sync_dir} refreshNotes={() => { void window.api.notes.loadAll().then(setNotes) }} />
          ) : (
            <div className="goals-empty">
              <span className="goals-empty-mark">✦</span>
              <h2>从一个方向开始</h2>
              <p>目标由你亲自设立。以后每次记录、决定和回看，都能在这里找到来路。</p>
              <button className="goal-button primary" type="button" onClick={() => setCreating(true)}>写下第一个目标</button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function GoalWorkspace({ goal, notes, collections, busy, act, libraryKey, refreshNotes }: {
  goal: GoalRecord
  notes: Note[]
  collections: CollectionRecord[]
  busy: boolean
  libraryKey: string
  refreshNotes: () => void
  act: (request: () => Promise<GoalResult<GoalRecord>>) => Promise<boolean>
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(goal.title)
  const [motivation, setMotivation] = useState(goal.motivation ?? '')
  const [signal, setSignal] = useState(goal.success_signal ?? '')
  const [reviewOn, setReviewOn] = useState(goal.review_on ?? '')
  const [commitment, setCommitment] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [choice, setChoice] = useState('')
  const [reason, setReason] = useState('')
  const [concern, setConcern] = useState('')
  const [decisionReview, setDecisionReview] = useState('')
  const [decisionEvidence, setDecisionEvidence] = useState<string[]>([])
  const [reviewDraft, setReviewDraft] = useState(() => loadReviewDraft(window.localStorage, libraryKey, goal.id))
  const [detailNote, setDetailNote] = useState<Note | null>(null)
  useEffect(() => { saveReviewDraft(window.localStorage, libraryKey, goal.id, reviewDraft) }, [libraryKey, goal.id, reviewDraft])
  const [noteQuery, setNoteQuery] = useState('')

  const noteMap = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes])
  const linkedNotes = goal.evidence_note_ids.map((id) => ({ id, note: noteMap.get(id) }))
  const candidates = useMemo(() => suggestGoalNotes(goal, notes, 8, collections), [goal, notes, collections])
  const query = noteQuery.trim().toLocaleLowerCase()
  const searchable = query
    ? notes.filter((note) => !goal.evidence_note_ids.includes(note.id) &&
      `${note.title} ${note.raw_content} ${note.tags.join(' ')}`.toLocaleLowerCase().includes(query))
      .slice(0, 8).map((note) => ({ note, matchedTerms: [noteQuery.trim()] }))
    : candidates
  const lastDecision = goal.decisions.at(-1)
  const sinceDecision = lastDecision
    ? goal.check_ins.filter((entry) => entry.created_at_ms >= lastDecision.created_at_ms)
    : goal.check_ins
  const recentEvidence = linkedNotes.filter(({ note }) => note &&
    (!lastDecision || noteTime(note) >= lastDecision.created_at_ms))

  async function saveDetails(event: FormEvent): Promise<void> {
    event.preventDefault()
    const ok = await act(() => window.api.goals.update(goal.id, goal.revision, {
      title, motivation, success_signal: signal, review_on: reviewOn
    }))
    if (ok) setEditing(false)
  }
  async function addNext(event: FormEvent): Promise<void> {
    event.preventDefault()
    const ok = await act(() => window.api.goals.addCommitment(goal.id, goal.revision, { text: commitment, due_on: dueOn }))
    if (ok) { setCommitment(''); setDueOn('') }
  }
  async function decide(event: FormEvent): Promise<void> {
    event.preventDefault()
    const ok = await act(() => window.api.goals.addDecision(goal.id, goal.revision, {
      choice, reason, concern, review_on: decisionReview, evidence_note_ids: decisionEvidence
    }))
    if (ok) { setChoice(''); setReason(''); setConcern(''); setDecisionReview(''); setDecisionEvidence([]) }
  }
  async function checkIn(event: FormEvent): Promise<void> {
    event.preventDefault()
    const ok = await act(() => window.api.goals.addCheckIn(goal.id, goal.revision, {
      observation: reviewDraft.observation, outcome: reviewDraft.outcome, next_step: reviewDraft.nextStep
    }))
    if (ok) setReviewDraft({ observation: '', outcome: 'progress', nextStep: '' })
  }
  function setStatus(status: GoalStatus): void {
    if (status !== goal.status) void act(() => window.api.goals.update(goal.id, goal.revision, { status }))
  }

  return (
    <div className="goal-workspace">
      <div className="goal-hero">
        <div className="goal-hero-meta"><span className={`goal-status ${goal.status}`}>{STATUS[goal.status]}</span><span>建立于 {dateTime(goal.created_at_ms)}</span></div>
        <div className="goal-hero-title"><h2>{goal.title}</h2><button className="goal-text-button" type="button" onClick={() => setEditing(!editing)}>编辑</button></div>
        {goal.motivation && <p className="goal-motivation">{goal.motivation}</p>}
        <div className="goal-hero-bottom">
          {goal.success_signal && <span>进展信号：{goal.success_signal}</span>}
          {goal.review_on && <span>计划回看：{goal.review_on}</span>}
        </div>
        {editing && (
          <form className="goal-edit-form" onSubmit={(event) => void saveDetails(event)}>
            <label>目标名称<input value={title} maxLength={160} required onChange={(e) => setTitle(e.target.value)} /></label>
            <label>为什么重要<textarea rows={2} value={motivation} maxLength={2000} onChange={(e) => setMotivation(e.target.value)} /></label>
            <label>如何知道有进展（可选）<input value={signal} maxLength={1000} onChange={(e) => setSignal(e.target.value)} /></label>
            <label>想在什么时候回看<input type="date" value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} /></label>
            <div className="goal-inline-actions"><button className="goal-button primary" disabled={busy}>保存修改</button><button className="goal-button quiet" type="button" onClick={() => setEditing(false)}>取消</button></div>
          </form>
        )}
      </div>
      <div className="goal-tabs" role="tablist" aria-label="目标内容">
        {([['overview', '推进'], ['review', '回看'], ['evidence', '资料'], ['history', '轨迹']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="goal-content">
        {tab === 'overview' && <>
          <section className="goal-section">
            <div className="goal-section-heading"><h3>现在的方向</h3><span>由你确认</span></div>
            <div className="goal-status-actions">
              {(['active', 'paused', 'completed'] as GoalStatus[]).map((status) => (
                <button key={status} type="button" disabled={busy} className={goal.status === status ? 'selected' : ''} onClick={() => setStatus(status)}>{STATUS[status]}</button>
              ))}
            </div>
          </section>
          <section className="goal-section">
            <div className="goal-section-heading"><h3>已确认的下一步</h3><span>{goal.commitments.filter((item) => item.status === 'open').length} 项待推进</span></div>
            {goal.commitments.length === 0 ? <p className="goal-muted">还没有承诺下一步。可以先观察，再决定。</p> : (
              <div className="goal-commitments">{goal.commitments.map((item) => (
                <div className="goal-commitment" key={item.id}>
                  <span className={`goal-mini-status ${item.status}`}>{COMMITMENT[item.status]}</span>
                  <div><strong>{item.text}</strong>{item.due_on && <small>预计 {item.due_on}</small>}</div>
                  {item.status === 'open' && <div className="goal-item-actions">
                    <button disabled={busy} type="button" onClick={() => void act(() => window.api.goals.updateCommitment(goal.id, goal.revision, item.id, 'done'))}>完成</button>
                    <button disabled={busy} type="button" onClick={() => void act(() => window.api.goals.updateCommitment(goal.id, goal.revision, item.id, 'dropped'))}>不再执行</button>
                  </div>}
                </div>
              ))}</div>
            )}
            <form className="goal-row-form" onSubmit={(event) => void addNext(event)}>
              <input value={commitment} maxLength={500} required onChange={(e) => setCommitment(e.target.value)} placeholder="写下一步，由你确认后才加入" aria-label="新的下一步" />
              <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="预计日期" />
              <button className="goal-button primary" disabled={busy}>确认</button>
            </form>
          </section>
          <section className="goal-section">
            <div className="goal-section-heading"><h3>当时的决定</h3><span>保留原来的理由</span></div>
            {lastDecision ? <div className="goal-decision">
              <div className="goal-kicker">{dateTime(lastDecision.created_at_ms)} · 最近一次</div>
              <strong>{lastDecision.choice}</strong>
              {lastDecision.reason && <p>当时的理由：{lastDecision.reason}</p>}
              {lastDecision.concern && <p>当时的顾虑：{lastDecision.concern}</p>}
              {lastDecision.review_on && <small>想在 {lastDecision.review_on} 复查</small>}
            </div> : <p className="goal-muted">还没有记录决定。之后改变想法时，旧决定仍会保留。</p>}
            <details className="goal-disclosure"><summary>记录一项新的决定</summary>
              <form className="goal-form" onSubmit={(event) => void decide(event)}>
                <label>我决定<input required maxLength={1000} value={choice} onChange={(e) => setChoice(e.target.value)} placeholder="例如：每周读两次，每次 20 分钟" /></label>
                <label>为什么这样决定<textarea rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                <label>仍有的顾虑<textarea rows={2} maxLength={2000} value={concern} onChange={(e) => setConcern(e.target.value)} /></label>
                <label>复查日期（可选）<input type="date" value={decisionReview} onChange={(e) => setDecisionReview(e.target.value)} /></label>
                {linkedNotes.length > 0 && <fieldset className="goal-evidence-choices"><legend>这项决定依据哪些已关联笔记？</legend>{linkedNotes.map(({ id, note }) => (
                  <label key={id}><input type="checkbox" checked={decisionEvidence.includes(id)} onChange={(e) => setDecisionEvidence((current) => e.target.checked ? [...current, id] : current.filter((item) => item !== id))} />{note ? noteName(note) : `已缺失的笔记 ${id}`}</label>
                ))}</fieldset>}
                <button className="goal-button primary" disabled={busy}>保存决定</button>
              </form>
            </details>
          </section>
        </>}
        {tab === 'review' && <>
          <div className="goal-review-intro"><div className="goals-eyebrow">REFLECTION</div><h3>上次决定之后，发生了什么？</h3><p>先看已记录的变化；没有记录，不代表你没有行动。</p></div>
          <div className="goal-review-grid">
            <section className="goal-section"><div className="goal-section-heading"><h3>上次决定</h3><span>{lastDecision ? dateTime(lastDecision.created_at_ms) : '暂无'}</span></div>
              {lastDecision ? <><strong>{lastDecision.choice}</strong>{lastDecision.reason && <p className="goal-muted">当时的理由：{lastDecision.reason}</p>}</> : <p className="goal-muted">还没有确认过决定。可以先在“推进”里写下。</p>}
            </section>
            <section className="goal-section"><div className="goal-section-heading"><h3>已知进展</h3><span>来自你的回看</span></div>
              {sinceDecision.filter((entry) => entry.outcome === 'progress').length ? sinceDecision.filter((entry) => entry.outcome === 'progress').map((entry) => <p key={entry.id} className="goal-review-fact">{entry.observation}<small>{dateTime(entry.created_at_ms)}</small></p>) : <p className="goal-muted">这段时间尚无已记录的进展；先由你补充实际发生的事。</p>}
            </section>
            <section className="goal-section"><div className="goal-section-heading"><h3>相关记录</h3><span>{recentEvidence.length} 条已关联</span></div>
              {recentEvidence.length ? recentEvidence.slice(0, 4).map(({ id, note }) => <p key={id} className="goal-review-fact">{note ? noteName(note) : '笔记已缺失'}<small>{note?.created_at ?? ''}</small></p>) : <p className="goal-muted">决定之后还没有关联的新笔记；这不代表没有采取行动。</p>}
            </section>
            <section className="goal-section"><div className="goal-section-heading"><h3>待你确认</h3><span>本地关键词候选</span></div>
              {candidates.length ? <><p>有 {candidates.length} 条可能相关的笔记，尚未纳入目标依据。</p><button type="button" className="goal-text-button" onClick={() => setTab('evidence')}>查看候选并确认 →</button></> : <p className="goal-muted">暂未找到关键词匹配的未关联笔记。</p>}
            </section>
          </div>
          <section className="goal-section goal-checkin-form"><div className="goal-section-heading"><h3>写下这次回看</h3><span>可以只写一句话</span></div>
            <form className="goal-form" onSubmit={(event) => void checkIn(event)}>
              <label>实际发生了什么<textarea required rows={4} maxLength={4000} value={reviewDraft.observation} onChange={(e) => setReviewDraft((draft) => ({ ...draft, observation: e.target.value }))} placeholder="例如：本周没有记录；实际上读了两次，但没有写笔记。" /></label>
              <label>这次的状态<select value={reviewDraft.outcome} onChange={(e) => setReviewDraft((draft) => ({ ...draft, outcome: e.target.value as CheckInOutcome }))}>
                {Object.entries(OUTCOME).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>
              <label>想到的下一步（可选）<input maxLength={1000} value={reviewDraft.nextStep} onChange={(e) => setReviewDraft((draft) => ({ ...draft, nextStep: e.target.value }))} placeholder="这里只记录想法；确认执行请到推进页添加下一步" /></label>
              <div className="goal-inline-actions"><button className="goal-button primary" disabled={busy}>保存回看</button><span className="goal-hint">不会自动创建待办或调用 AI</span></div>
            </form>
          </section>
        </>}
        {tab === 'evidence' && <>
          <section className="goal-section"><div className="goal-section-heading"><h3>关联知识库</h3><span>主题资料只是候选</span></div>
            <p className="goal-hint">关联主题后，其中的笔记会优先成为候选；只有你逐条确认的笔记才成为目标依据。</p>
            {collections.length ? <div className="goal-topic-list">{collections.map((topic) => {
              const linked = goal.collection_ids?.includes(topic.id) ?? false
              return <div key={topic.id}><div><strong>{topic.name}</strong><small>{topic.note_ids.length} 篇关联笔记</small></div>
                <button className="goal-button secondary" type="button" disabled={busy} onClick={() =>
                  void act(() => window.api.goals.linkCollection(goal.id, goal.revision, topic.id, !linked))}>
                  {linked ? '取消关联' : '关联主题'}
                </button></div>
            })}</div> : <p className="goal-muted">还没有知识库。可先在“主题知识库”建立议题，也可直接关联笔记。</p>}
          </section>
          <section className="goal-section"><div className="goal-section-heading"><h3>已关联的笔记</h3><span>{linkedNotes.length} 条</span></div>
            {linkedNotes.length ? linkedNotes.map(({ id, note }) => <div className="goal-note" key={id}>
              <div><strong>{note ? noteName(note) : `笔记 ${id} 已缺失`}</strong><p>{note ? note.raw_content.slice(0, 180) : '来源已失效，保留关联记录以便核对。'}</p><small>{note?.created_at ?? ''}</small></div>
              <div className="goal-item-actions">{note && <button type="button" onClick={() => setDetailNote(note)}>查看原文</button>}<button className="goal-text-button" disabled={busy} type="button" onClick={() => void act(() => window.api.goals.linkNote(goal.id, goal.revision, id, false))}>移除关联</button></div>
            </div>) : <p className="goal-muted">还没有资料。可以从下方候选或关键词查找中手动加入。</p>}
          </section>
          <section className="goal-section"><div className="goal-section-heading"><h3>查找并关联</h3><span>你确认后才成为依据</span></div>
            <input className="goal-search" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} placeholder="搜索笔记标题、正文或标签" aria-label="搜索可关联笔记" />
            {!query && <p className="goal-hint">以下候选来自目标关键词或关联知识库；不代表内容支持目标。</p>}
            {searchable.length ? searchable.map(({ note, matchedTerms }) => <div className="goal-note" key={note.id}>
              <div><strong>{noteName(note)}</strong><p>{note.raw_content.slice(0, 180)}</p><small>{query ? '匹配搜索词' : `命中：${matchedTerms.join('、')}`}</small></div>
              <div className="goal-item-actions"><button type="button" onClick={() => setDetailNote(note)}>查看原文</button><button className="goal-button secondary" disabled={busy} type="button" onClick={() => void act(() => window.api.goals.linkNote(goal.id, goal.revision, note.id, true))}>关联</button></div>
            </div>) : <p className="goal-muted">{query ? '没有匹配的未关联笔记。试试其他词。' : '暂时没有关键词候选；也可以输入词语查找。'}</p>}
          </section>
        </>}
        {tab === 'history' && <section className="goal-section"><div className="goal-section-heading"><h3>决策与回看轨迹</h3><span>旧决定不会被后来认识改写</span></div>
          {goal.decisions.length + goal.check_ins.length === 0 ? <p className="goal-muted">轨迹从第一项决定或回看开始。</p> : [
            ...goal.decisions.map((entry) => ({ key: entry.id, time: entry.created_at_ms, type: '决定', title: entry.choice, detail: entry.reason })),
            ...goal.check_ins.map((entry) => ({ key: entry.id, time: entry.created_at_ms, type: OUTCOME[entry.outcome], title: entry.observation, detail: entry.next_step ? `当时想到：${entry.next_step}` : '' }))
          ].sort((a, b) => b.time - a.time).map((entry) => <div className="goal-history-item" key={entry.key}>
            <span>{dateTime(entry.time)} · {entry.type}</span><strong>{entry.title}</strong>{entry.detail && <p>{entry.detail}</p>}
          </div>)}
        </section>}
      </div>
      {detailNote && <NoteDetailDialog note={detailNote} onClose={() => setDetailNote(null)} onRefresh={refreshNotes} />}
    </div>
  )
}
