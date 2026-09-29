import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import type { AppConfig, Note } from '../../shared/types'
import type { AiJob, Owner, InsightView, NoteInsight, DreamReport, SourceEvidence, WikiCorrection, Feedback, Usage } from '../../shared/insights'
import { EMPTY_USAGE } from '../../shared/insights'
import { loadConfig } from '../store/config-store'
import { loadAllNotesFrom, loadNote, hashNoteInput, getSyncDir } from '../store/note-store'
import { aiRead, aiWrite, aiCommit, aiList, jobs, reports, insight, thread, ownerKey, readThinkingState, writeThinkingState } from '../store/insight-store'
import { getDreamableNotes, getNotesForDream, loadDreamState, saveDreamState, releaseDreamLock } from '../store/dream-store'
import { generate, parseObject, BOUNDARY, GenerationError } from '../llm/thinking-client'
import { AI_LIMITS } from '../llm/models'
import { searchDeepseek, parseSearch } from './deepseek-search'
import { selectPassages } from './source-passages'
import { readPublicPage } from './source-reader'
import { validateRecommendations, sourceKind } from './evidence'
import { readWikiAt, commitWiki, correctionAppendix, acceptedCorrections } from '../store/wiki-revision'
import { getLogger } from '../utils/logger'

const log = getLogger('thinking')
const hash = (n: Note): string => hashNoteInput(n.raw_content.trim())
const active = new Map<string,AbortController>()
let timer: NodeJS.Timeout | undefined
let library = ''
let pumping = false
function notify(channel = 'thinking:updated', ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel,...args)
}
function record(dir: string, job: AiJob): void { aiWrite(dir,'jobs',job.id,job); notify() }
function sum(target: Usage, addition: Usage): void {
  target.input += addition.input; target.output += addition.output; target.searches += addition.searches
}
function configDir(): string {
  const dir = getSyncDir(); if (!dir) throw new Error('请先设置数据目录'); return dir
}
export function initializeThinking(dir: string): void {
  if (!dir) return
  if (!readThinkingState(dir)) {
    const known = Object.fromEntries(loadAllNotesFrom(dir).map(n => [n.id,hash(n)]))
    writeThinkingState(dir,{schema_version:1,known,processed:{...known},last_auto:0})
  }
  for (const job of jobs(dir)) {
    const pending=aiRead<{pending:boolean}>(dir,'pending',job.owner.kind==='dream'?'reports_'+job.owner.id:'insights_'+ownerKey(job.owner))
    if(pending?.pending && ['failed','running','interrupted'].includes(job.status)){
      job.status='queued';job.phase='恢复待保存结果';job.error=undefined;record(dir,job)
    }else if(job.status==='running'){
      job.status='interrupted';job.error='结果未确认：上次请求被中断。已完成步骤保留，重试未确认的请求可能再次计费。';record(dir,job)
    }
  }
  releaseDreamLock(false,dir)
}
export function enqueue(owner: Owner, kind: AiJob['kind'], prompt?: string, automatic = false, dir = configDir()): AiJob {
  ownerKey(owner)
  const note = owner.kind === 'note' ? loadNote(owner.id,dir) : null
  if (owner.kind === 'note' && !note) throw new Error('笔记不存在或已移入回收站')
  if (kind === 'reply' && (!prompt?.trim() || prompt.length > 4000)) throw new Error('请输入 1–4000 字的问题')
  const existing = jobs(dir).find(j => ownerKey(j.owner) === ownerKey(owner) && ['queued','running'].includes(j.status))
  if (existing && (!note || existing.input_hash === hash(note))) return existing
  if (existing) { active.get(existing.id)?.abort(); existing.status='cancelled'; existing.error='笔记已更新'; record(dir,existing) }
  if (kind === 'dream') {
    const running = jobs(dir).find(j => j.kind === 'dream' && ['queued','running'].includes(j.status))
    if (running) return running
  }
  const job: AiJob = { schema_version:1,id:randomUUID(),owner,kind,status:'queued',created_at:Date.now(),
    input_hash:note ? hash(note) : '',prompt,automatic,phase:'等待处理',steps:{},usage:EMPTY_USAGE() }
  record(dir,job)
  return job
}
export function requestDream(): AiJob {
  return enqueue({kind:'dream',id:randomUUID()},'dream')
}
export function getInsightView(owner: Owner): InsightView {
  const dir = configDir(); ownerKey(owner)
  const note = owner.kind === 'note' ? loadNote(owner.id,dir) : null
  if (owner.kind === 'note' && !note) throw new Error('笔记不存在或已移入回收站')
  const value = insight(dir,owner)
  return {
    insight:value, report: owner.kind === 'dream' ? aiRead<DreamReport>(dir,'reports',owner.id) : null,
    thread:thread(dir,owner), jobs:jobs(dir).filter(j => ownerKey(j.owner) === ownerKey(owner)).sort((a,b) => b.created_at-a.created_at).slice(0,8),
    stale:!!note && !!value && hash(note) !== value.input_hash,
    corrections: owner.kind === 'note' ? aiList<WikiCorrection>(dir,'corrections').filter(c => c.note_id === owner.id)
      .map(c=>note && c.input_hash!==hash(note) && ['pending','accepted'].includes(c.status)?{...c,status:'stale' as const}:c) : []
  }
}
export function jobAction(id: string, action: 'cancel' | 'retry'): void {
  const dir = configDir()
  const job = aiRead<AiJob>(dir,'jobs',id); if (!job) throw new Error('任务不存在')
  if (action === 'cancel') {
    if (!['queued','running'].includes(job.status)) return
    active.get(id)?.abort(); job.status = 'cancelled'; job.phase = '已取消'
  } else {
    if (job.status==='done' && ['research','dream'].includes(job.kind)) {
      const value = job.owner.kind==='dream' ? aiRead<DreamReport>(dir,'reports',job.owner.id) : insight(dir,job.owner)
      if (value?.id!== (job.owner.kind==='dream'?job.owner.id:job.id) || (!value.sources.some(s=>s.read_status==='failed') && !(job.kind==='dream' && (value as DreamReport).supplement_status==='failed'))) return
      // Reuse successful search/model preparation and page reads. Only the final
      // synthesis must be regenerated after new evidence becomes available.
      delete job.steps['形成有依据的推荐']
      delete job.steps['核对观点归属']
      for(const key of Object.keys(job.steps))if(/^(原始响应|格式修复) (形成有依据的推荐|核对观点归属|核对资料类型)$/.test(key))delete job.steps[key]
      delete job.steps['核对资料类型']
    } else if (!['failed','interrupted','cancelled'].includes(job.status)) return
    if (job.owner.kind === 'note') {
      const note = loadNote(job.owner.id,dir)
      if (!note || hash(note) !== job.input_hash) throw new Error('笔记已变化，请基于当前版本重新发起')
    }
    for(const key of Object.keys(job.steps)){
      const value=job.steps[key] as {error?:string}|undefined
      if((key.startsWith('原始响应 ') && value?.error) || key.startsWith('格式修复 ')){
        job.steps['历史响应_'+Date.now()+'_'+key]=value;delete job.steps[key]
      }
    }
    job.status = 'queued'; job.error = undefined; job.phase = '等待重试'
  }
  record(dir,job)
}
export function saveFeedback(owner: Owner, feedback: Feedback, recommendationId?: string): void {
  const dir = configDir()
  if (!['helpful','unhelpful','less','read','irrelevant'].includes(feedback)) throw new Error('无效反馈')
  const bucket = owner.kind === 'dream' ? 'reports' : 'insights'
  const id = owner.kind === 'dream' ? owner.id : ownerKey(owner)
  const value = aiRead<NoteInsight | DreamReport>(dir,bucket,id)
  if (!value) throw new Error('内容不存在')
  if (recommendationId !== undefined) {
    const rec = value.recommendations.find(r => r.id === recommendationId)
    if (!rec) throw new Error('推荐不存在')
    rec.feedback = feedback
  } else if ('input_hash' in value) value.feedback = feedback
  aiWrite(dir,bucket,id,value); notify()
}
export function decideCorrection(id: string, decision: 'accept' | 'deny'): void {
  const dir = configDir(); const correction = aiRead<WikiCorrection>(dir,'corrections',id)
  if (!correction) throw new Error('纠正建议不存在')
  if (correction.status !== 'pending') return
  const note = loadNote(correction.note_id,dir)
  if (!note || hash(note) !== correction.input_hash) {
    correction.status = 'stale'; aiWrite(dir,'corrections',id,correction); throw new Error('原笔记已变化，请重新核查')
  }
  if (decision === 'deny') correction.status = 'denied'
  else {
    if (!correction.sources.some(s => s.text || s.excerpt)) throw new Error('缺少可核对依据，不能写入 Wiki')
    const busy = jobs(dir).some(j => j.owner.kind === 'note' && j.owner.id === note.id && ['queued','running'].includes(j.status))
    if (busy) throw new Error('请等待当前笔记任务结束后接纳')
    correction.status = 'accepted'
    const job = enqueue({kind:'note',id:note.id},'correction',id,false,dir)
    // The queued job cannot run until this synchronous transaction returns.
    if (!job) throw new Error('无法排队')
  }
  aiWrite(dir,'corrections',id,correction); notify()
}
function check(dir: string, job: AiJob, signal: AbortSignal): void {
  signal.throwIfAborted()
  if (getSyncDir() !== dir) throw new Error('数据目录已切换，旧任务停止')
  if (job.owner.kind === 'note') {
    const note = loadNote(job.owner.id,dir)
    if (!note || hash(note) !== job.input_hash) throw new Error('笔记已编辑或删除，旧结果不会写入')
  }
}
async function step<T>(dir: string, job: AiJob, name: string, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  check(dir,job,signal)
  if (Object.prototype.hasOwnProperty.call(job.steps,name)) return job.steps[name] as T
  job.phase = name; record(dir,job)
  const value = await fn()
  check(dir,job,signal)
  job.steps[name] = value; record(dir,job)
  return value
}
async function ask(dir: string, job: AiJob, name: string, config: AppConfig, signal: AbortSignal, instruction: string, data: unknown, deep = false): Promise<Record<string,any>> {
  return step(dir,job,name,signal,async () => {
    async function response(key:string, prompt:string, input:string, thinking:boolean):Promise<{text:string;usage:Usage}> {
      const cached = job.steps[key] as {text:string;usage:Usage;error?:string} | undefined
      if (cached) { if(cached.error)throw new Error(cached.error); return cached }
      try {
        const result=await generate(config,prompt,input,signal,thinking)
        sum(job.usage,result.usage)
        job.steps[key]=result;record(dir,job)
        return result
      } catch(error) {
        if(error instanceof GenerationError){sum(job.usage,error.usage);job.steps[key]={text:error.rawText,usage:error.usage,error:error.message};record(dir,job)}
        throw error
      }
    }
    const result=await response('原始响应 '+name,BOUNDARY+'\n'+instruction,JSON.stringify(data),deep)
    const validate=(text:string):Record<string,any>=>{
      const parsed=parseObject(text)
      if(parsed.repair_failed)throw new Error('响应无法安全修复')
      // Required top-level fields come from the explicitly specified output schema.
      const schema=/返回(?:相同格式)?\s*JSON\s*(\{[\s\S]*)/.exec(instruction)?.[1]
      const required=schema ? [...schema.matchAll(/(?:^\{|,)\s*"(body|recommendations|queries|candidates|skip|fact_check|correction)"\s*:/g)].map(m=>m[1]) : []
      if(required.some(key=>!(key in parsed)))throw new Error('模型响应格式错误：缺少必要字段')
      if('body' in parsed && typeof parsed.body!=='string')throw new Error('模型响应格式错误：正文不是文本')
      if('recommendations' in parsed && !Array.isArray(parsed.recommendations))throw new Error('模型响应格式错误：推荐不是列表')
      return parsed
    }
    try{return validate(result.text)}catch(error){
      const repaired=await response('格式修复 '+name,BOUNDARY+'只修复所附响应的 JSON 格式。不得新增事实、续写截断内容或补造缺失字段。无法恢复则返回 {"repair_failed":true}。原输出要求：'+instruction,result.text,false)
      try{return validate(repaired.text)}catch{throw new Error('模型响应格式错误：一次格式修复未成功；原始响应已保留。'+String(error))}
    }
  })
}
const clean = (value: unknown, limit = 12000): string => typeof value === 'string' ? value.trim().slice(0,limit) : ''
async function material(dir: string, job: AiJob, config: AppConfig, signal: AbortSignal): Promise<{ text: string; notes: {id:string;hash:string;title:string}[]; coverage:string }> {
  return step(dir,job,'准备材料',signal,async () => {
    let all = job.owner.kind === 'note' ? [loadNote(job.owner.id,dir)!] : getNotesForDream(dir)
    if (job.automatic && job.kind === 'dream') {
      const state=readThinkingState(dir)!
      const range=getDreamableNotes(dir)
      const pending=range.filter(n=>state.processed[n.id]!==hash(n)).reverse().slice(0,80)
      const chosen=new Set(pending.map(n=>n.id))
      all=[...pending,...range.filter(n=>!chosen.has(n.id)).slice(0,20)]
    }
    if (!all.length) throw new Error('所选范围内没有可分析的笔记')
    const perNote = Math.min(48000,Math.floor(96000/all.length))
    const selected = all.map(n => ({id:n.id,hash:hash(n),title:n.title || n.raw_content.slice(0,50),body:n.raw_content.slice(0,perNote)}))
    const clipped = all.filter(n => n.raw_content.length > perNote).length
    const total = job.owner.kind === 'note' ? 1 : getDreamableNotes(dir).length
    let text = selected.map(n => '笔记 ID '+n.id+'\n'+n.title+'\n'+n.body).join('\n\n---\n\n')
    if (text.length > 16000) {
      const summaries: string[] = []
      for (let i=0;i<text.length;i+=12000) {
        const summary = await ask(dir,job,'材料摘要 '+i,config,signal,'保留论点、具体问题、矛盾和笔记 ID，不做评价，不引入外部知识。返回 JSON {"body":"摘要"}。',text.slice(i,i+12000))
        summaries.push(clean(summary.body,5000))
      }
      text = summaries.join('\n').slice(0,48000)
    }
    return {text,notes:selected.map(({id,hash,title}) => ({id,hash,title})),
      coverage:'范围内 '+total+' 条，选取 '+selected.length+' 条；'+(clipped ? clipped+' 条长笔记仅覆盖前 '+perNote+' 字。' : '选取笔记全文已纳入。')+(text.length>16000 ? '长材料已分段摘要。' : '')}
  })
}
async function searched(dir:string,job:AiJob,config:AppConfig,query:string,signal:AbortSignal):Promise<ReturnType<typeof parseSearch>> {
  const id=job.id+'_'+hashNoteInput(query)
  const saved=aiRead<{data:any}>(dir,'responses',id)
  if(saved)return parseSearch(saved.data)
  let accounted=false
  const result=await searchDeepseek(config.api_key,query,signal,data=>{
    aiWrite(dir,'responses',id,{at:Date.now(),step:job.phase,data})
    sum(job.usage,{input:data.usage?.input_tokens || 0,output:data.usage?.output_tokens || 0,searches:data.usage?.server_tool_use?.web_search_requests || 0})
    accounted=true;record(dir,job)
  })
  if(!accounted)sum(job.usage,result.usage)
  return result
}
async function retrieve(dir: string, job: AiJob, config: AppConfig, signal: AbortSignal, queries: string[], maxPages: number = AI_LIMITS.pages): Promise<{sources:SourceEvidence[];warning:string}> {
  const sources = new Map<string,SourceEvidence>(); const errors: string[] = []
  const ranks = new Map<string,number>()
  if (config.api_provider !== 'DeepSeek') return {sources:[],warning:'当前提供商尚未接入联网核查，以下观点未核实'}
  for (let i=0;i<Math.min(AI_LIMITS.searchCalls-2,queries.length);i++) {
    const query = queries[i].trim().slice(0,600); if (!query) continue
    try {
      const result = await step(dir,job,'搜索 '+i,signal,async () => {
        const key = hashNoteInput(query)
        const cached = aiRead<{at:number;sources:SourceEvidence[]}>(dir,'search-cache',key)
        if (cached && Date.now()-cached.at < 7*86400000) return cached.sources
        const found = await searched(dir,job,config,query,signal)
        aiWrite(dir,'search-cache',key,{at:Date.now(),sources:found.sources})
        return found.sources
      })
      result.forEach((s,index) => {sources.set(s.id,s);ranks.set(s.id,Math.min(ranks.get(s.id)??Infinity,index))})
    } catch (e) { signal.throwIfAborted(); errors.push(String(e)) }
  }
  let read = 0, successes = 0
  const score = (s:SourceEvidence):number => (sourceKind(s.url)==='primary'?-100:0)+(ranks.get(s.id)??12)
  const ranked = [...sources.values()].sort((a,b) => score(a)-score(b))
  let alternativesSearched=false
  for (const source of ranked) {
    source.kind = 'unknown'
    source.document_type='unknown'
    source.read_status = 'not_attempted'
    if (/\.(docx?|pptx?|xlsx?)(?:$|[?#])/i.test(source.url)) {
      source.read_error='这是文档下载链接；当前仅核查公开网页正文';continue
    }
    const pageCache=aiRead<{at:number}>(dir,'page-cache',source.id)
    const cached=Object.prototype.hasOwnProperty.call(job.steps,'读取来源 '+source.id) || (pageCache && Date.now()-pageCache.at<86400000)
    if ((!cached && read >= AI_LIMITS.fetchAttempts) || successes >= maxPages) continue
    if(!cached)read++
    try {
      source.text = await step(dir,job,'读取来源 '+source.id,signal,async () => {
        const cached = aiRead<{at:number;text:string}>(dir,'page-cache',source.id)
        if (cached && Date.now()-cached.at < 86400000) return cached.text
        const text = await readPublicPage(source.url,signal)
        aiWrite(dir,'page-cache',source.id,{at:Date.now(),text}); return text
      })
      if (!source.text.trim()) throw new Error('页面未提供可提取的正文')
      source.format=source.text.startsWith('[PDF')?'pdf':source.text.startsWith('[公开 XML')?'xml':'html'
      source.coverage=source.format==='pdf'?source.text.split('\n')[0]:source.format==='xml'?'公开 XML 正文，最多前 100000 字':'静态网页提取，最多前 24000 字；不代表完整全文'
      if(source.format==='xml'){source.document_type='paper';source.kind='primary'}
      source.read_status = source.text.startsWith('[仅摘要')?'abstract':'read'
      if(source.read_status==='read')successes++
      else source.coverage='仅取得论文摘要，未读取全文'
      delete source.read_error
    } catch (e) {
      signal.throwIfAborted()
      source.read_status = 'failed'
      source.read_error = e instanceof Error ? e.message : String(e)
    }
    if(source===ranked[ranked.length-1] && successes<3 && !alternativesSearched && read<AI_LIMITS.fetchAttempts){
      alternativesSearched=true
      const failed=ranked.filter(s=>s.read_status==='failed' || s.read_status==='abstract').slice(0,2)
      for(let i=0;i<failed.length;i++)try{
        const result=await step(dir,job,'查找公开替代版本 '+i,signal,async()=>{
          const found=await searched(dir,job,config,failed[i].title.slice(0,250)+' open access full text author manuscript repository PMC',signal)
          return found.sources
        })
        for(const item of result)if(!sources.has(item.id)){sources.set(item.id,item);ranked.push(item)}
      }catch(error){signal.throwIfAborted();errors.push(String(error))}
    }
  }
  return {sources:[...sources.values()],warning:errors.length ? '部分联网核查未完成。' : sources.size && ![...sources.values()].some(s => s.text) ? '仅取得检索来源，未读取到正文；观点归属尚未核实。' : ''}
}

async function research(dir: string, job: AiJob, config: AppConfig, signal: AbortSignal, text: string): Promise<{body:string;recommendations:NoteInsight['recommendations'];sources:SourceEvidence[];warning:string}> {
  const prior = [...aiList<NoteInsight>(dir,'insights'),...reports(dir)].flatMap(x => x.recommendations || [])
    .filter(r => r.feedback === 'read' || r.feedback === 'irrelevant').slice(-20)
    .map(r => ({title:r.title,idea:r.idea,feedback:r.feedback}))
  const plan = await ask(dir,job,'选择值得展开的问题',config,signal,
    '选择最多三个值得展开的问题。先给暂定判断，再给依据、不同解释和边界。必要时建议行动，不强行统一主题。优先找对当前具体判断有帮助的书籍观点，允许论文、访谈。外文书必须提供候选原文书名和作者原名，供后续核查；不要把猜测的中译本当成已核实书目。返回 JSON {"body":"深入分析，不含书籍引文","candidates":[{"title":"候选书/资料","author":"","original_title":"原文书名","original_author":"作者原名","idea":"待核查观点"}],"queries":["抽象议题或书名作者观点核查词，禁止包含用户身份或私事，最多六条"]}。没有有益候选可为空。', {notes:text,avoid_repeating:prior},true)
  const queries = Array.isArray(plan.queries) ? plan.queries.filter((x:unknown) => typeof x === 'string') : []
  // Candidate books must actually be searched: broad topic queries alone tend
  // to return loosely related papers and cannot establish book attribution.
  const bookQueries = (Array.isArray(plan.candidates)?plan.candidates:[]).slice(0,2)
    .filter((c:any)=>clean(c.title)&&clean(c.author))
    .map((c:any)=>[clean(c.original_title)||clean(c.title),clean(c.original_author)||clean(c.author),'book review rating Goodreads 豆瓣'].join(' '))
  const found = await retrieve(dir,job,config,signal,[...bookQueries,...queries].slice(0,6))
  const supplied=aiRead<SourceEvidence[]>(dir,'provided-sources',ownerKey(job.owner)) || []
  found.sources=[...supplied,...found.sources.filter(s=>!supplied.some(p=>p.id===s.id))].slice(0,72)
  const passages=new Map(found.sources.map(source=>[source.id,selectPassages(source,queries)]))
  for(const source of found.sources)source.coverage=(source.coverage || '取得静态正文')+'；本次选读 '+(source.analysis_ranges?.length||0)+' 段、最多 9000 字，非全文逐字审读'
  const classification=await ask(dir,job,'核对资料类型',config,signal,
    '按文档本身而非域名分类。返回 JSON {"sources":[{"id":"","document_type":"author/publisher/paper/review/repost/unknown","excerpt":"直接证明文档性质、署名、研究方法或专业书评出处的原文片段"}]}。不能把一般转载、书商介绍、用户短评当成专业评论，无法判断用unknown。',
    found.sources.filter(s=>s.text).map(s=>({id:s.id,url:s.url,text:s.text.slice(0,12000)})))
  for(const item of Array.isArray(classification.sources)?classification.sources:[]){
    const source=found.sources.find(s=>s.id===item.id)
    if(!source || typeof item.excerpt!=='string' || item.excerpt.length<20 || !source.text.includes(item.excerpt))continue
    if(!['author','publisher','paper','review','repost','unknown'].includes(item.document_type))continue
    source.document_type=item.document_type
    source.kind=['author','publisher','paper'].includes(item.document_type)?'primary':item.document_type==='review'?'secondary':'unknown'
  }
  const result = await ask(dir,job,'形成有依据的推荐' ,config,signal,
    '每项添加 material_type（book/paper/article）。书籍必须添加 quality，含kind（rating/professional_review）、source_id、excerpt（评分及人数或专业书评逐字依据）、edition、reason；评分另含score、count。豆瓣>=8且>=100人，或Goodreads>=4且>=200人；不混版本、不补数字。无评分可用可靠专业书评，出版社广告不能代替。无质量依据的书不推荐。论文说明对象、方法、发表状态和局限，不以引用次数断言正确。基于材料筛选最多三项有益推荐，没有合适项就为空。只把资料直接支持的内容归于作者。AI的联系与推论标为 extension。来源仅标题/搜索摘要时不算正文证据。不得从著名书籍推断任意观点、编造引文或页码。未核实时不提供章节页码或直接引文；中译本未经来源确认应写尚未核实。支持片段必须逐字摘自给定 source.text，且直接支持 idea。返回 JSON {"body":"深入分析，不能虚构外部事实或出处","recommendations":[{"title":"","author":"","original_title":"","translation":"","question":"对应笔记的具体问题","idea":"","relevance":"如何改变理解","limits":"","reading":"","attribution":"author 或 extension","identity_source_ids":[],"support":[{"source_id":"","excerpt":"","supports_claim":true}]}]}。',
    {notes:text,analysis:plan,sources:found.sources.map(s => ({...s,text:passages.get(s.id)||''}))},true)
  // A second, evidence-only pass checks attribution rather than trusting the drafting pass.
  let recommendations: NoteInsight['recommendations'] = []
  if (Array.isArray(result.recommendations) && result.recommendations.length) {
    const checked = await ask(dir,job,'核对观点归属',config,signal,
      '逐项审计候选推荐。只有正文真正支持具体 idea 时保留 support；仅相关、同名、书商广告、AI延伸推断不能证明作者观点。保留有益但未核实的推荐时清空 support。删除编造的引文、章节、页码和中译本信息。返回相同格式 JSON {"recommendations": [...]}。不得新增来源或推荐。必须保留 material_type 与 quality 字段并核对其原文依据；缺失评分不能补数。',
      {recommendations:result.recommendations,sources:found.sources.map(s => ({...s,text:passages.get(s.id)||''}))})
    recommendations = validateRecommendations(Array.isArray(checked.recommendations)?checked.recommendations.filter((r:any)=>['book','paper','article'].includes(r.material_type)):[],found.sources)
  }
  const body = clean(result.body) || clean(plan.body)
  if (!body) throw new Error('未生成可用分析')
  return {...found,body,recommendations}
}
async function evaluateCorrection(dir: string, job: AiJob, config: AppConfig, signal: AbortSignal, candidate: any, text: string): Promise<{body?:string;sources:SourceEvidence[];warning:string}> {
  if (!candidate || !clean(candidate.query) || !clean(candidate.claim)) return {sources:[],warning:''}
  const found = await retrieve(dir,job,config,signal,[clean(candidate.query)],2)
  if (!found.sources.some(s => s.text)) return {...found,warning:'未获得足够正文依据，暂不提出可写入 Wiki 的纠正。'}
  const checked = await ask(dir,job,'核查日常观点',config,signal,
    '客观评价普通观点。区分证据不足、因人而异、明确错误。健康/医疗/法律/金融主张必须使用对应专业机构的直接资料，不能给个体诊断或从单个研究泛化。不得为了纠正而纠正。返回 JSON {"body":"结合核查后的简评，100–250字","correction":null 或 {"claim":"原笔记中的逐字原判断","replacement":"有条件、有边界的准确表述","reason":"为什么值得修正","domain":"health/legal/finance/general","support":[{"source_id":"","excerpt":"逐字正文证据"}]}}。没有直接依据时 correction 必须为 null。',
    {note:text,candidate,sources:found.sources.map(s => ({...s,text:s.text.slice(0,12000)}))},true)
  const c = checked.correction
  if (c && clean(c.claim) && text.includes(c.claim) && clean(c.replacement)) {
    const supports = Array.isArray(c.support) ? c.support : []
    const used = found.sources.filter(s => supports.some((p:any) => p.source_id === s.id &&
      typeof p.excerpt === 'string' && p.excerpt.trim().length >= 20 && s.text.includes(p.excerpt.trim())))
    const professional = used.some(s => /(^|\.)(nhs\.uk|who\.int|medlineplus\.gov|nih\.gov|cdc\.gov|nhc\.gov\.cn|gov\.cn|fda\.gov|gov\.uk|sec\.gov|finra\.org)$/.test(new URL(s.url).hostname))
    if (used.length && (c.domain === 'general' || professional)) {
      const id = hashNoteInput(job.owner.id + job.input_hash + c.claim)
      const previous = aiRead<WikiCorrection>(dir,'corrections',id)
      for (const source of used) source.excerpt = supports.find((p:any)=>p.source_id===source.id)?.excerpt
      if (!previous) {
        const correction: WikiCorrection = {schema_version:1,id,note_id:job.owner.id,input_hash:job.input_hash,created_at:Date.now(),
          claim:clean(c.claim),replacement:clean(c.replacement),reason:clean(c.reason),sources:used,status:'pending'}
        check(dir,job,signal); aiWrite(dir,'corrections',id,correction)
      }
    }
  }
  return {...found,body:clean(checked.body)}
}
async function applyCorrection(dir: string, job: AiJob, config: AppConfig, signal: AbortSignal): Promise<void> {
  const c = aiRead<WikiCorrection>(dir,'corrections',job.prompt || '')
  if (!c || !['accepted','applied'].includes(c.status)) throw new Error('建议尚未接纳')
  if (c.status === 'applied') return
  const note = loadNote(c.note_id,dir)!
  if (!note.category || note.category === 'Inbox') throw new Error('笔记正在等待归类，归类后可重试融入 Wiki')
  const now = new Date()
  const filename = c.wiki_file || note.category + '_' + now.getFullYear() + '_' + String(now.getMonth()+1).padStart(2,'0') + '.md'
  c.wiki_file=filename
  aiWrite(dir,'corrections',c.id,c)
  const old = readWikiAt(dir,filename)
  if (old.includes('修正记录：'+c.id)) {
    c.status='applied'; c.wiki_file=filename; aiWrite(dir,'corrections',c.id,c); return
  }
  const body = old.split('<!-- flownote-corrections -->')[0].trim()
  const patches = await ask(dir,job,'定位需修正的 Wiki 段落 '+hashNoteInput(old).slice(0,12),config,signal,
    '找出 Wiki 中与已接纳纠正直接冲突的句子或段落。仅返回逐字片段，不能选择无关段落或整个文档。返回 JSON {"before":["原文逐字片段"]}。没有匹配则为空数组。',
    {wiki:body.slice(0,48000),correction:{claim:c.claim,replacement:c.replacement}})
  let next = body
  const snippets: unknown[] = Array.isArray(patches.before) ? patches.before : []
  for (const before of snippets.slice(0,5)) {
    if (typeof before !== 'string' || !before.trim() || before.length > 1600 || !next.includes(before)) continue
    next = next.replace(before,c.replacement)
  }
  if (!next) next = '# ' + note.category
  c.wiki_file = filename
  const approved = acceptedCorrections(dir,filename).filter(x => x.id !== c.id)
  next += correctionAppendix([...approved,c])
  check(dir,job,signal)
  commitWiki(dir,filename,old,next)
  c.status='applied';c.applied_at=Date.now();c.before_hash=hashNoteInput(old);c.after_hash=hashNoteInput(next)
  aiWrite(dir,'corrections',c.id,c)
  notify('wikis:updated')
}
async function execute(dir: string, job: AiJob, config: AppConfig, signal: AbortSignal): Promise<void> {
  if (job.kind === 'correction') return applyCorrection(dir,job,config,signal)
  if (job.kind === 'reply') {
    const owner = job.owner
    const context = owner.kind === 'note' ? loadNote(owner.id,dir) : aiRead<DreamReport>(dir,'reports',owner.id)
    if (!context) throw new Error('讨论对象已不存在')
    const discussion = thread(dir,owner)
    const existing = discussion.messages.some(m => m.id === job.id+'_answer')
    if (existing) return
    const previous = insight(dir,owner)
    const contextText = 'raw_content' in context ? context.raw_content : context.body
    const data = {question:job.prompt,context:contextText.slice(0,16000),previous:previous?.body.slice(0,6000),
      sources:('sources' in context ? context.sources : previous?.sources ?? []).slice(0,6).map(s=>({...s,text:s.text.slice(0,1500)})),
      messages:discussion.messages.slice(-10).map(m=>({role:m.role,text:m.text.slice(0,1200)}))}
    let replySources:SourceEvidence[] = []
    const plan = await ask(dir,job,'判断追问需要的资料',config,signal,
      '直接回答追问，优先复用已有材料与来源；涉及新的外部事实才搜索。返回 JSON {"body":"回答","queries":["必要时最多三条公开议题查询，不含个人信息"]}。',
      JSON.stringify(data).slice(0,48000),true)
    let answer = clean(plan.body)
    if (Array.isArray(plan.queries) && plan.queries.length) {
      const found = await retrieve(dir,job,config,signal,plan.queries.filter((q:unknown)=>typeof q==='string'))
      replySources=found.sources
      const reply = await ask(dir,job,'结合来源回答追问',config,signal,
        '回答追问。明确未核实处；只引用给定来源，使用来源编号 [source_id]。禁止虚构引文或页码。返回 JSON {"body":"回答"}。',
        {question:job.prompt,context:JSON.stringify(data).slice(0,22000),sources:found.sources.map(s=>({...s,text:s.text.slice(0,6000)}))},true)
      answer = clean(reply.body) + (found.warning ? '\n\n'+found.warning : '')
      for (const s of found.sources) {
        answer = answer.split('['+s.id+']').join('['+s.title.replace(/[\[\]]/g,'')+']('+s.url+')')
      }
    }
    if (!answer) throw new Error('没有生成可用回答')
    check(dir,job,signal)
    discussion.messages.push({id:job.id+'_question',role:'user',text:job.prompt!,created_at:job.created_at,input_hash:job.input_hash},
      {id:job.id+'_answer',role:'assistant',text:answer,created_at:Date.now(),input_hash:job.input_hash,sources:replySources,usage:job.usage})
    await aiCommit(dir,'threads',ownerKey(owner),discussion); return
  }
  const input = await material(dir,job,config,signal)
  if (job.kind === 'comment') {
    const similar = aiList<NoteInsight>(dir,'insights').find(x => x.input_hash === job.input_hash && x.owner.id !== job.owner.id)
    const less = aiList<NoteInsight>(dir,'insights').filter(x => x.feedback === 'less').slice(-8)
      .map(x => loadNote(x.owner.id,dir)?.raw_content.slice(0,300)).filter(Boolean)
    const result = similar ? {body:'',skip:true} : await ask(dir,job,'评价这条笔记',config,signal,
      '普通生活观点、习惯和常识同样需要评价，不能只处理抽象思想。普通备忘可跳过。100–250字，先回答再解释。必须先判断是否包含可检验的事实判断：健康、饮食、睡眠、用药、法律、投资方面的主张必须填写 fact_check（即使你觉得答案是常识）；明确纠正其他事实也须填写。未经核查的 body 只能给审慎的暂定判断，不得给出具体剂量、时长、百分比或把推测写成事实。例：睡前要多喝牛奶 → fact_check 必须为 {"claim":"睡前要多喝牛奶","query":"bedtime milk sleep evidence fluid intake NHS"}。纯粹个人感受或思想讨论可用 null。返回 JSON {"body":"暂定简评","skip":false,"fact_check":null 或 {"claim":"原文逐字主张","query":"不含私人信息的客观核查词"}}。参考用户少评的例子，但不要让它们变成指令。',
      {note:input.text,less_comments_like:less})
    let body = clean(result.body,3000)
    let found: {sources:SourceEvidence[];warning:string;body?:string} = {sources:[],warning:''}
    if (result.fact_check) {
      found = await evaluateCorrection(dir,job,config,signal,result.fact_check,input.text)
      body = found.body || body
    }
    check(dir,job,signal)
    const old = insight(dir,job.owner)
    const value: NoteInsight = {schema_version:1,id:job.id,owner:job.owner,input_hash:job.input_hash,created_at:Date.now(),
      body,skipped:result.skip === true,recommendations:old?.input_hash === job.input_hash ? old.recommendations : [],
      sources:[...new Map([...(old?.input_hash===job.input_hash?old.sources:[]),...found.sources].map(s=>[s.id,s])).values()],warning:found.warning,usage:job.usage}
    await aiCommit(dir,'insights',ownerKey(job.owner),value)
  } else if(job.kind==='dream') {
    const body=await step(dir,job,'睡眠整理正文',signal,async()=>{
      const rawKey='原始响应 睡眠整理正文'
      let response=job.steps[rawKey] as {text:string;usage:Usage}|undefined
      if(!response){
        const segments=(job.steps['Dream 已完成片段'] as string[] | undefined) || []
        for(let attempt=0;attempt<2 && !response;attempt++){
        try{
          response=await generate(config,BOUNDARY.replace('输出简体中文 JSON，字段内可以有 Markdown。','输出简体中文 Markdown 文章，不使用 JSON。')+
            'Dream 像睡眠中的大脑，重新组织和反思这一时期接收的信息。写一篇连贯反思文章，通常800–1600字，材料少则更短，最多三个主要展开方向。梳理重复关注、观点变化、经历和判断的联系、尚未消化的问题。联系必须有材料依据，不强行统一主题。给出有理由的暂定解释和回答、不同理解及边界，而非只批评提问或行动清单。日常经历与普通判断同样重要，纯提醒可略过。区分用户原话和AI推断。关键判断用 [笔记标题](#note-ID) 引用所给真实ID。资料覆盖多个日期，不称为今天。不引入尚未核实的外部书籍或论文。'+(segments.length?'已有部分正文已保存，只从断点继续完成未写完的部分，不重复已有段落。':''),segments.length?JSON.stringify({notes:input.text,completed_tail:segments.join('\n').slice(-6000)}):input.text,signal,true,'markdown')
          sum(job.usage,response.usage);job.steps[rawKey]=response;record(dir,job)
        }catch(error){
          if(error instanceof GenerationError){
            sum(job.usage,error.usage);job.steps['截断响应 睡眠整理正文']={text:error.rawText,usage:error.usage}
            if(error.reason==='output_limit' && error.rawText.trim()){
              segments.push(error.rawText);job.steps['Dream 已完成片段']=segments;record(dir,job)
              if(attempt===0)continue
            }else record(dir,job)
          }
          throw error
        }
        }
        if(response && segments.length){response={...response,text:segments.join('\n')+'\n'+response.text};job.steps[rawKey]=response;record(dir,job)}
      }
      if(!response)throw new Error('Dream 正文尚未完整，已保留已完成片段')
      if(!response.text.trim())throw new Error('未生成可用反思正文')
      return response.text
    })
    const existing=aiRead<DreamReport>(dir,'reports',job.owner.id)
    const report:DreamReport=existing || {schema_version:1,id:job.owner.id,created_at:Date.now(),body,notes:input.notes,coverage:input.coverage,recommendations:[],sources:[],usage:job.usage,supplement_status:'pending'}
    await step(dir,job,'保存内部整理',signal,async()=>{await aiCommit(dir,'reports',report.id,report);notify();return true})
    const state=readThinkingState(dir)!
    input.notes.forEach(n=>{state.processed[n.id]=n.hash})
    if(job.automatic)state.last_auto=Date.now()
    writeThinkingState(dir,state)
    try {
      const result=await research(dir,job,config,signal,body+'\n\n材料依据：\n'+input.text)
      report.supplement_body=result.body;report.recommendations=result.recommendations;report.sources=result.sources
      report.warning=result.warning;report.supplement_status=result.warning?'failed':'complete'
    }catch(error){
      signal.throwIfAborted();check(dir,job,signal)
      report.supplement_status='failed';report.warning='内部整理已完成；外部补充未完成，可单独重试。'+clean(String(error),300)
    }
    check(dir,job,signal);report.usage=job.usage
    await aiCommit(dir,'reports',report.id,report)
    releaseDreamLock(true,dir);notify('dream:finished',report.id)
  } else {
    const result = await research(dir,job,config,signal,input.text)
    check(dir,job,signal)
    const old = insight(dir,job.owner)
    await aiCommit(dir,'insights',ownerKey(job.owner),{
      schema_version:1,id:job.id,owner:job.owner,input_hash:job.input_hash,created_at:Date.now(),
      ...result,body:result.body,skipped:false,feedback:old?.feedback,usage:job.usage
    } satisfies NoteInsight)
  }
}
export async function tickThinking(): Promise<void> {
  const config = loadConfig(); const dir = config.sync_dir
  if (library !== dir) {
    active.forEach(c=>c.abort());library=dir
    if (dir) initializeThinking(dir)
  }
  if (pumping || !dir) return
  const state = readThinkingState(dir)!
  let changed = false
  for (const note of loadAllNotesFrom(dir)) {
    const current = hash(note)
    if (state.known[note.id] === current) continue
    // Queue before advancing discovery so a failed write is retryable.
    if (config.ai_comments !== false) enqueue({kind:'note',id:note.id},'comment',undefined,true,dir)
    state.known[note.id]=current;changed=true
  }
  if (changed) writeThinkingState(dir,state)
  const pendingNotes = getDreamableNotes(dir).filter(n=>state.processed[n.id] !== hash(n))
  const autoJobs = jobs(dir).filter(j => j.kind==='dream' && j.automatic)
  const recentAuto = autoJobs.some(j => Date.now()-j.created_at < 86400000)
  if (config.ai_auto_dream !== false && !recentAuto && Date.now()-state.last_auto >= 86400000 &&
    pendingNotes.length >= loadDreamState(dir).dream_threshold) {
    enqueue({kind:'dream',id:randomUUID()},'dream',undefined,true,dir)
  }
  if (!config.api_key) return
  const job = jobs(dir).filter(j=>j.status==='queued').sort((a,b) => {
    const priority = (j:AiJob):number => j.kind==='correction' || j.kind==='reply' ? 0 : j.kind==='comment' ? 1 : 2
    return priority(a)-priority(b) || a.created_at-b.created_at
  })[0]
  if (!job) return
  pumping=true
  const controller = new AbortController(); active.set(job.id,controller)
  try {
    job.status='running';record(dir,job)
    if (job.kind === 'dream') saveDreamState({...loadDreamState(dir),dream_in_progress:true},dir)
    await execute(dir,job,config,controller.signal)
    check(dir,job,controller.signal)
    job.status='done';job.phase='完成'
  } catch (error) {
    job.status = controller.signal.aborted ? 'cancelled' : 'failed'
    job.error = clean(String(error),500);job.phase='未完成'
    if (job.kind==='dream') notify('dream:error',job.error)
  } finally {
    try {
      try { if (job.kind==='dream') releaseDreamLock(false,dir) }
      finally { record(dir,job) }
    } finally { active.delete(job.id);pumping=false }
  }
}
export function startThinkingService(): void {
  library=getSyncDir()
  if (library) initializeThinking(library)
  timer=setInterval(()=>{ void tickThinking().catch(e=>log.error('Thinking queue: '+String(e))) },3000)
}
export function stopThinkingService(): void {
  if (timer) clearInterval(timer)
  active.forEach(c=>c.abort())
}
