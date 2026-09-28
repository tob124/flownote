import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { InsightView, Owner, SourceEvidence } from '../../shared/insights'
import { useConfig } from '../context/ConfigContext'
import { useApp } from '../context/AppContext'
import { useNotes } from '../context/NotesContext'
import '../styles/thinking.css'

export function ThoughtMarkdown({text}:{text:string}):JSX.Element {
  return <div className="thought-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}
    components={{a:({children,href})=><a href={href} target="_blank" rel="noreferrer">{children}</a>}}>{text}</ReactMarkdown></div>
}
function Sources({items}:{items:SourceEvidence[]}):JSX.Element {
  return <details className="thought-sources"><summary>查看资料来源 · {items.filter(s=>s.text).length}/{items.length} 篇已读取</summary>
    {items.map(s=><div key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
      <small>{new Date(s.fetched_at).toLocaleDateString()} · {s.text ? '已读取正文' : s.read_status==='failed' ? '正文暂不可读' : '检索线索，未读取正文'}</small>
      {s.read_error && <small>{s.read_error}；可以打开原网页查看。</small>}
      {s.excerpt && <blockquote>{s.excerpt}</blockquote>}</div>)}</details>
}
export default function ThoughtPanel({owner,compact=false,noteLabel='这条笔记'}:{owner:Owner;compact?:boolean;noteLabel?:string}):JSX.Element|null {
  const {config}=useConfig()
  const {setPageId}=useApp()
  const {revealNote}=useNotes()
  const panelId=useId()
  const [view,setView]=useState<InsightView|null>(null)
  const [expanded,setExpanded]=useState(!compact)
  const [tab,setTab]=useState<'response'|'reading'|'discussion'>('response')
  const [question,setQuestion]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const dialog=useRef<HTMLDialogElement>(null)
  const seq=useRef(0)
  const kind=owner.kind,id=owner.id,dir=config.sync_dir
  const reload=useCallback(async()=>{
    if(!window.api.thinking)return
    const ticket=++seq.current
    try{const data=await window.api.thinking.view({kind,id});if(ticket===seq.current){setView(data);setError('')}}
    catch(e){if(ticket===seq.current)setError(String(e))}
  },[kind,id,dir])
  useEffect(()=>{
    setView(null);setQuestion('');setError('');setExpanded(!compact);setTab('response');void reload()
    if(!window.api.thinking)return
    let timer:ReturnType<typeof setTimeout>|undefined
    const off=window.api.on('thinking:updated',()=>{
      if(timer)clearTimeout(timer)
      timer=setTimeout(()=>void reload(),200)
    })
    return()=>{++seq.current;off();if(timer)clearTimeout(timer)}
  },[reload,compact])
  useEffect(()=>{
    if(!compact||!expanded)return
    const node=dialog.current
    if(node&&!node.open)node.showModal()
    return()=>{if(node?.open)node.close()}
  },[compact,expanded])
  async function act(action:()=>Promise<unknown>):Promise<void>{
    setBusy(true);setError('')
    try{await action();await reload()}catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  if(!window.api.thinking)return null
  const value=view?.report || view?.insight
  const current=view?.jobs.find(j=>j.status==='queued'||j.status==='running')
  const disabled=busy||!!current
  const body=value?.body || ''
  const latest=view?.jobs[0]
  const content=<section className={'thought-panel '+(compact&&!expanded?'thought-compact':'thought-full')} aria-label={kind==='note'?'AI 评论与讨论':'Dream 分析与讨论'}>
    <div className="thought-heading">
      {!(compact&&expanded) && <strong>{kind==='note'?'另一种视角':'Dream · 深入思考'}</strong>}
      {compact && !expanded && <button onClick={()=>setExpanded(true)} aria-expanded={expanded}>展开</button>}
      {current && <span role="status">{current.phase.startsWith('读取来源')?'正在读取资料…':current.phase.startsWith('搜索')?'正在搜索相关资料…':current.phase.startsWith('定位需修正')?'正在更新 Wiki…':current.phase}</span>}
    </div>
    {view?.stale && <p className="thought-warning">以下回应针对旧版本；新版笔记将重新分析。</p>}
    {!expanded && body && <p className="thought-preview">{body.replace(/[#*_>`]/g,'').slice(0,120)}{body.length>120?'…':''}</p>}
    {kind==='note' && (!expanded||tab!=='discussion') && <div className="thought-entry-actions">
      {(!expanded||tab==='response') && <button disabled={disabled} onClick={()=>{setExpanded(true);setTab('response');void act(()=>window.api.thinking.run(id,'comment'))}}>{value?'重新评论':'请 AI 评价'}</button>}
      {(!expanded||tab==='reading') && <button disabled={disabled} onClick={()=>{setExpanded(true);setTab('reading');void act(()=>window.api.thinking.run(id,'research'))}}>找些相关观点</button>}
      {!expanded && <button onClick={()=>{setExpanded(true);setTab('discussion')}}>追问{view?.thread.messages.length?' · '+view.thread.messages.length:''}</button>}
    </div>}
    {expanded && <>
      <div className="thought-tabs" role="tablist" aria-label="思考内容">
        {(['response','reading','discussion'] as const).map((item,i)=><button key={item} role="tab" id={panelId+'-'+item}
          tabIndex={tab===item?0:-1} onKeyDown={e=>{const tabs=['response','reading','discussion'] as const;let index=i;if(e.key==='ArrowRight')index=(i+1)%3;else if(e.key==='ArrowLeft')index=(i+2)%3;else if(e.key==='Home')index=0;else if(e.key==='End')index=2;else return;e.preventDefault();setTab(tabs[index]);document.getElementById(panelId+'-'+tabs[index])?.focus()}}
          aria-selected={tab===item} aria-controls={panelId+'-content'} onClick={()=>setTab(item)}>{['回应','延伸阅读','继续讨论'][i]}{item==='reading'&&value?.recommendations.length?' · '+value.recommendations.length:''}</button>)}
      </div>
      <div role="tabpanel" id={panelId+'-content'} aria-labelledby={panelId+'-'+tab}>
      {tab==='response' && <>
      {body && <ThoughtMarkdown text={body}/>}
      {!body && !current && !view?.insight?.skipped && <p className="thought-empty">日常判断也值得认真对待。请求一次评价，听听解释、适用条件或不同看法。</p>}
      {!body && view?.insight?.skipped && <p>这条记录暂不需要额外评论。你仍可以主动追问。</p>}
      {value?.warning && !value.recommendations.length && <p className="thought-warning">{value.warning}</p>}
      {view?.report && <>
        <p className="thought-meta">{view.report.coverage}</p>
        <details className="thought-sources"><summary>本次引用的笔记 · {view.report.notes.length}</summary><div className="thought-actions">{view.report.notes.map(n=><button key={n.id} onClick={()=>{revealNote(n.id);setPageId('notes')}}>↗ {n.title.slice(0,35)}</button>)}</div></details>
      </>}
      </>}
      {tab==='reading' && <>
      <div className="thought-reading-intro"><strong>让想法与外部知识相遇</strong><p>先看这项资料能补充什么，再决定是否值得读。</p></div>
      {value?.warning && <div className="thought-warning"><strong>部分资料还没有核实</strong><p>{value.warning}</p><p>可先阅读下面的思考；未核实的推荐仅作为线索，不能视为作者已证实的观点。</p></div>}
      {latest?.status==='done' && ['research','dream'].includes(latest.kind) && value?.sources.some(s=>s.read_status==='failed') && <div className="thought-recheck"><button disabled={disabled} onClick={()=>void act(()=>window.api.thinking.action(latest.id,'retry'))}>重试资料核查</button><small>复用已完成的搜索，重新读取失败页面并生成推荐。</small></div>}
      {!value?.recommendations.length && <p className="thought-empty">{current?'正在寻找与这条内容真正相关的观点…':value?.sources.length?'已有资料线索，暂未形成合适的阅读推荐。可以打开来源，或追问一个更具体的问题。':'从一个具体问题出发寻找书籍、文章和不同解释。点击“找些相关观点”开始。'}</p>}
      {value?.recommendations.map(r=><article className="thought-recommendation" key={r.id}>
        <h3>{r.title} {r.author && <small>· {r.author}</small>}</h3>
        {r.original_title && r.original_title!==r.title && <p>{r.original_title}</p>}
        <span className={'thought-evidence '+r.evidence}>{r.evidence==='primary'?'有原始资料支持':r.evidence==='secondary'?'有二手资料支持':'基于模型知识，尚未核实'}</span>
        {!r.identity_source_ids.length && <small> · 书目身份尚未核实</small>}
        <p className="thought-reading-question">{r.question}</p>
        <p>{r.idea}</p>
        <p><strong>为什么有帮助：</strong>{r.relevance}</p>
        <details className="thought-recommendation-detail"><summary>阅读建议与观点依据</summary>
        <p>{r.attribution==='extension'?'以上联系包含 AI 的延伸理解。':'观点归属按所列证据范围理解。'} {r.limits}</p>
        <p>{r.reading} {r.translation}</p>
        {r.quote && <blockquote>{r.quote}</blockquote>}
        {!!r.source_ids.length && <Sources items={value.sources.filter(s=>r.source_ids.includes(s.id))}/>}
        </details>
        <div className="thought-actions">{(['read','irrelevant','helpful'] as const).map((f,i)=><button key={f} disabled={busy}
          aria-pressed={r.feedback===f} onClick={()=>void act(()=>window.api.thinking.feedback({kind,id},f,r.id))}>{['已读','不相关','有帮助'][i]}</button>)}</div>
      </article>)}
      {!!value?.sources.length && <Sources items={value.sources}/>}
      </>}
      {tab==='response' && <>
      {view?.corrections.map(c=><article className="thought-correction" key={c.id}>
        <h3>一个值得核对的判断</h3>
        <p><strong>原判断：</strong>{c.claim}</p>
        <p><strong>建议改写：</strong>{c.replacement}</p>
        <p>{c.reason}</p><Sources items={c.sources}/>
        {c.status==='pending'?<div className="thought-actions">
          <button className="primary" disabled={disabled||view.stale} onClick={()=>void act(()=>window.api.thinking.correction(c.id,'accept'))}>接纳并融入 Wiki</button>
          <button disabled={busy} onClick={()=>void act(()=>window.api.thinking.correction(c.id,'deny'))}>否决</button>
        </div>:<p role="status">{({accepted:'已接纳，等待融入 Wiki',denied:'已否决，不会改写 Wiki',applied:'已融入 Wiki',stale:'原笔记已变化，需要重新核查'} as Record<string,string>)[c.status]} {c.wiki_file}</p>}
      </article>)}
      {kind==='note' && <div className="thought-actions thought-feedback">
        {!!view?.insight && (['helpful','unhelpful','less'] as const).map((f,i)=><button key={f} disabled={busy}
          aria-pressed={view.insight?.feedback===f} onClick={()=>void act(()=>window.api.thinking.feedback({kind,id},f))}>{['有帮助','没帮助','少对这类内容评论'][i]}</button>)}
      </div>}
      {!!value?.sources.length && !value.recommendations.length && <Sources items={value.sources}/>}
      </>}
      {tab==='discussion' && <>
      {!view?.thread.messages.length && <p className="thought-empty">围绕这条内容接着聊。可以问“这个判断在什么条件下成立？”或“有没有相反的证据？”</p>}
      {!!view?.thread.messages.length && <div className="thought-discussion" aria-label="围绕这条内容的讨论">
        {view.thread.messages.map(m=><div key={m.id} className={'thought-message '+m.role}><strong>{m.role==='user'?'你':'AI'}</strong><ThoughtMarkdown text={m.text}/>{!!m.sources?.length && <Sources items={m.sources}/>}</div>)}
      </div>}
      {current?.kind==='reply' && <p>正在回应：{current.prompt}</p>}
      <form className="thought-reply" onSubmit={e=>{e.preventDefault();const q=question.trim();if(q)void act(async()=>{await window.api.thinking.reply({kind,id},q);setQuestion('')})}}>
        <textarea aria-label="继续追问" placeholder="就这条内容继续问…" rows={2} maxLength={4000} value={question} onChange={e=>setQuestion(e.target.value)}/>
        <button className="primary" disabled={disabled||!question.trim()} type="submit">继续讨论</button>
      </form>
      </>}
      </div>
      {value && <details className="thought-usage"><summary>本次生成记录</summary><p className="thought-meta">输入 {value.usage.input} · 输出 {value.usage.output} token · 搜索 {value.usage.searches} 次</p></details>}
    </>}
    {current && <button disabled={busy} onClick={()=>void act(()=>window.api.thinking.action(current.id,'cancel'))}>取消本次处理</button>}
    {latest && ['failed','interrupted','cancelled'].includes(latest.status) && <div className="thought-warning" role="status">
      {latest.error || '本次处理已取消'} <button disabled={disabled} onClick={()=>void act(()=>window.api.thinking.action(latest.id,'retry'))}>重试未完成步骤</button>
    </div>}
    {error && <p role="alert" className="thought-warning">{error}</p>}
  </section>
  return compact&&expanded?createPortal(<dialog ref={dialog} className="thought-dialog" aria-label="笔记的回应与延伸阅读"
    onCancel={()=>setExpanded(false)} onClick={e=>{if(e.target===dialog.current)setExpanded(false)}}>
    <header className="thought-dialog-header"><div><small>围绕这条笔记</small><h2>{noteLabel.slice(0,120)}</h2></div><button aria-label="关闭思考窗口" onClick={()=>setExpanded(false)}>关闭 ×</button></header>
    <div className="thought-dialog-content">{content}</div>
  </dialog>,document.body):content
}
