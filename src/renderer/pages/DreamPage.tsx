import { useCallback, useEffect, useRef, useState } from 'react'
import type { DreamReport, AiJob } from '../../shared/insights'
import { useConfig } from '../context/ConfigContext'
import ThoughtPanel from '../components/ThoughtPanel'
import MarkdownViewer from '../components/MarkdownViewer'
import '../styles/thinking.css'
export default function DreamPage():JSX.Element{
  const {config}=useConfig()
  const [reports,setReports]=useState<DreamReport[]>([])
  const [jobs,setJobs]=useState<AiJob[]>([])
  const [legacy,setLegacy]=useState<string[]>([])
  const [selection,setSelection]=useState<{kind:'new'|'old';id:string}|null>(null)
  const [oldText,setOldText]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [starting,setStarting]=useState(false)
  const seq=useRef(0)
  const oldSeq=useRef(0)
  const reload=useCallback(async()=>{
    const ticket=++seq.current
    try{
      const [r,j,l]=await Promise.all([window.api.thinking.reports(),window.api.thinking.jobs(),window.api.dream.getReports()])
      if(ticket!==seq.current)return
      setReports(r);setJobs(j.filter(x=>x.kind==='dream'));setLegacy(l);setError('')
    }catch(e){if(ticket===seq.current)setError(String(e))}
  },[config.sync_dir])
  useEffect(()=>{
    setSelection(null);setOldText(null);setReports([]);setJobs([]);setLegacy([]);void reload()
    const off=window.api.on('thinking:updated',()=>void reload())
    return()=>{++seq.current;++oldSeq.current;off()}
  },[reload])
  async function start():Promise<void>{
    setStarting(true)
    try{const j=await window.api.thinking.dream();setSelection({kind:'new',id:j.owner.id});await reload()}
    catch(e){setError(String(e))}finally{setStarting(false)}
  }
  async function selectOld(id:string):Promise<void>{
    const ticket=++oldSeq.current;setSelection({kind:'old',id});setOldText(null)
    try{const text=await window.api.dream.loadReport(id);if(ticket===oldSeq.current)setOldText(text)}
    catch(e){if(ticket===oldSeq.current)setError(String(e))}
  }
  const current=jobs.find(j=>j.status==='queued'||j.status==='running')
  const entries=[...new Set([...jobs.map(j=>j.owner.id),...reports.map(r=>r.id)])]
  return <div className="dream-workspace">
    <header className="dream-topbar"><strong>Dream</strong><span>让记录长出新的认识</span>
      <button disabled={starting||!!current} onClick={()=>void start()}>{current?'正在思考…':'开始 Dream'}</button>
      {current && <button onClick={()=>{setSelection({kind:'new',id:current.owner.id});++oldSeq.current}}>查看进度</button>}
    </header>
    {error && <p role="alert">{error} <button onClick={()=>void reload()}>重试</button></p>}
    <div className="dream-columns"><nav className="dream-history" aria-label="Dream 历史">
      {entries.map(id=>{const r=reports.find(r=>r.id===id),j=jobs.find(j=>j.owner.id===id);return <button key={id}
        className={selection?.id===id?'active':''} onClick={()=>{++oldSeq.current;setSelection({kind:'new',id})}}>
        {new Date(r?.created_at||j?.created_at||0).toLocaleString()}<br/>{r?'思考报告':j?.phase}</button>})}
      {!!legacy.length && <h3>旧版报告</h3>}
      {legacy.map(id=><button key={id} className={selection?.id===id?'active':''} onClick={()=>void selectOld(id)}>{id.replace(/^dream_/,'').replace(/\.md$/,'')}</button>)}
    </nav><main className="dream-reading">
      {selection?.kind==='new'?<ThoughtPanel key={selection.id} owner={{kind:'dream',id:selection.id}}/>:
        selection?.kind==='old'?<MarkdownViewer content={oldText}/>:
        <div className="dream-empty"><h2>从记录中，找值得再想一层的问题</h2>
          <p>Dream 会给出有理由的判断，连接相关笔记，并寻找能补充或挑战这些想法的书籍与外部观点。</p>
          <p>你可以围绕报告继续追问。材料不足时，不会强行归纳或凑书单。</p><button onClick={()=>void start()} disabled={starting||!!current}>开始一次思考</button></div>}
    </main></div>
  </div>
}
