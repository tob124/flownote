import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const env=vi.hoisted(()=>({dir:'',generate:vi.fn(),search:vi.fn(),page:vi.fn()}))
vi.mock('electron',()=>({BrowserWindow:{getAllWindows:()=>[]}}))
vi.mock('../src/main/store/config-store',()=>({loadConfig:()=>({sync_dir:env.dir,api_key:'fixture',api_provider:'DeepSeek',ai_auto_dream:false,ai_comments:false,categories:['学习']})}))
vi.mock('../src/main/llm/thinking-client',async(importOriginal)=>{
  const original=await importOriginal<typeof import('../src/main/llm/thinking-client')>()
  return {...original,generate:env.generate}
})
vi.mock('../src/main/services/deepseek-search',async(importOriginal)=>({...await importOriginal<typeof import('../src/main/services/deepseek-search')>(),searchDeepseek:env.search}))
vi.mock('../src/main/services/source-reader',()=>({readPublicPage:env.page}))
import { GenerationError } from '../src/main/llm/thinking-client'
import { saveNote, loadNote, patchNote, hashNoteInput } from '../src/main/store/note-store'
import { enqueue, tickThinking, getInsightView, decideCorrection, initializeThinking, jobAction } from '../src/main/services/thinking-service'
import { aiRead, aiWrite, jobs, reports, readThinkingState } from '../src/main/store/insight-store'
import type { WikiCorrection } from '../src/shared/insights'
const usage={input:10,output:20,searches:0}
const answer=(value:unknown)=>({text:JSON.stringify(value),usage})
beforeEach(()=>{
  process.env.FLOWNOTE_LOCAL_DATA=mkdtempSync(join(tmpdir(),'flownote-local-'))
  env.dir=mkdtempSync(join(tmpdir(),'flownote-thinking-'));mkdirSync(join(env.dir,'notes'))
  env.generate.mockReset().mockResolvedValue(answer({body:'这个普通判断值得区分条件，而不是一概而论。',skip:false,fact_check:null,queries:[]}))
  env.search.mockReset();env.page.mockReset()
  initializeThinking(env.dir)
})
afterEach(()=>{rmSync(env.dir,{recursive:true,force:true});rmSync(process.env.FLOWNOTE_LOCAL_DATA!,{recursive:true,force:true});delete process.env.FLOWNOTE_LOCAL_DATA})
describe('persistent thinking workflow',()=>{
  it('retries failed page reads without paying for completed searches again',async()=>{
    const id=saveNote(env.dir,'检验重要决策中的直觉')
    env.generate.mockResolvedValue(answer({body:'一个有边界的解释',queries:['expert intuition evidence'],candidates:[],recommendations:[]}))
    env.search.mockResolvedValue({sources:[{id:'public-source',title:'Evidence',url:'https://example.org/evidence',fetched_at:1,text:'',kind:'secondary'}],usage:{input:20,output:20,searches:1}})
    env.page.mockRejectedValue(new Error('读取网页超时'))
    const job=enqueue({kind:'note',id},'research');await tickThinking()
    expect(getInsightView({kind:'note',id}).insight?.sources[0].read_error).toBe('读取网页超时')
    expect(jobs(env.dir)[0].status).toBe('done')
    env.page.mockResolvedValue('这里是与所讨论观点直接相关的公开正文资料。')
    const searchesBeforeRetry=env.search.mock.calls.length
    jobAction(job.id,'retry');await tickThinking()
    expect(env.search).toHaveBeenCalledTimes(searchesBeforeRetry)
    expect(getInsightView({kind:'note',id}).insight?.sources[0].read_status).toBe('read')
    expect(getInsightView({kind:'note',id}).insight?.sources[0].read_error).toBeUndefined()
  })
  it('comments on an ordinary statement, stores a reply, and never rewrites the note',async()=>{
    const id=saveNote(env.dir,'普通的日常观点')
    enqueue({kind:'note',id},'comment')
    await tickThinking()
    expect(getInsightView({kind:'note',id}).insight?.body).toContain('普通判断')
    enqueue({kind:'note',id},'reply','为什么？')
    await tickThinking()
    expect(getInsightView({kind:'note',id}).thread.messages.map(m=>m.role)).toEqual(['user','assistant'])
    expect(loadNote(id,env.dir)?.raw_content).toBe('普通的日常观点')
  })
  it('rejects a result if the note was edited during generation',async()=>{
    const id=saveNote(env.dir,'旧判断')
    env.generate.mockImplementation(async()=>{
      patchNote(env.dir,id,loadNote(id,env.dir)!.revision!,{raw_content:'新的判断'})
      return answer({body:'针对旧判断的回应'})
    })
    enqueue({kind:'note',id},'comment');await tickThinking()
    expect(getInsightView({kind:'note',id}).insight).toBeNull()
    expect(jobs(env.dir).some(j=>j.status==='failed')).toBe(true)
  })
  it('does not write a delayed response into either library after directory switching',async()=>{
    const old=env.dir,next=mkdtempSync(join(tmpdir(),'flownote-switch-'))
    try{
      const id=saveNote(old,'旧目录中的笔记')
      env.generate.mockImplementation(async()=>{env.dir=next;return answer({body:'延迟返回'})})
      enqueue({kind:'note',id},'comment');await tickThinking()
      expect(aiRead(old,'insights','note_'+id)).toBeNull()
      expect(aiRead(next,'insights','note_'+id)).toBeNull()
    }finally{env.dir=old;rmSync(next,{recursive:true,force:true})}
  })
  it('does not advance Dream versions on failure and reuses completed preparation on retry',async()=>{
    const id=saveNote(env.dir,'值得讨论的问题')
    env.generate.mockRejectedValue(new Error('network unavailable'))
    const job=enqueue({kind:'dream',id:'report-test'},'dream')
    await tickThinking()
    expect(reports(env.dir)).toEqual([])
    expect(readThinkingState(env.dir)?.processed[id]).toBeUndefined()
    expect(jobs(env.dir).find(j=>j.id===job.id)?.steps['准备材料']).toBeTruthy()
    env.generate.mockResolvedValue(answer({body:'有理由的暂定回答',queries:[],recommendations:[]}))
    jobAction(job.id,'retry');await tickThinking()
    expect(reports(env.dir)).toHaveLength(1)
    expect(readThinkingState(env.dir)?.processed[id]).toBe(hashNoteInput('值得讨论的问题'))
  })
  it('delivers the internal Dream even when external research fails, and retries without rewriting it',async()=>{
    saveNote(env.dir,'这段时期我对效率的看法发生了变化。')
    env.generate.mockImplementation(async(_config,instruction)=>{
      if(instruction.includes('Dream 像睡眠'))return {text:'过去的记录把效率放在首位；新的经历提示，还需要留意恢复与观察的价值。',usage}
      throw new Error('external search preparation unavailable')
    })
    const job=enqueue({kind:'dream',id:'independent-core'},'dream');await tickThinking()
    expect(jobs(env.dir).find(j=>j.id===job.id)?.status).toBe('done')
    const core=reports(env.dir)[0]
    expect(core.body).toContain('新的经历');expect(core.supplement_status).toBe('failed')
    const coreCalls=env.generate.mock.calls.filter(call=>call[1].includes('Dream 像睡眠')).length
    jobAction(job.id,'retry');await tickThinking()
    expect(reports(env.dir)[0].body).toBe(core.body)
    expect(env.generate.mock.calls.filter(call=>call[1].includes('Dream 像睡眠'))).toHaveLength(coreCalls)
  })
  it('continues a truncated Dream without discarding the completed section',async()=>{
    saveNote(env.dir,'关于日常观察的记录。');let coreCalls=0
    env.generate.mockImplementation(async(_config,instruction)=>{
      if(instruction.includes('Dream 像睡眠')){
        coreCalls++
        if(coreCalls===1)throw new GenerationError('输出上限',usage,'第一部分是已完成的观察。','output_limit')
        expect(instruction).toContain('从断点继续')
        return {text:'第二部分补充新的理解。',usage}
      }
      throw new Error('external unavailable')
    })
    enqueue({kind:'dream',id:'continued-core'},'dream');await tickThinking()
    expect(reports(env.dir)[0].body).toContain('第一部分是已完成的观察。')
    expect(reports(env.dir)[0].body).toContain('第二部分补充新的理解。')
    expect(coreCalls).toBe(2)
  })
  it('keeps a denied correction out of Wiki; an accepted one writes history exactly once',async()=>{
    const id=saveNote(env.dir,'待纠正的普通判断','学习')
    const text='权威资料中与当前判断直接有关的一段可核对的完整证据。'
    const correction:WikiCorrection={schema_version:1,id:'proposal',note_id:id,input_hash:hashNoteInput('待纠正的普通判断'),
      created_at:Date.now(),claim:'待纠正的普通判断',replacement:'接纳后的有条件表述',reason:'证据支持',
      sources:[{id:'source',url:'https://example.org/source',title:'资料',fetched_at:Date.now(),text,kind:'secondary'}],status:'pending'}
    aiWrite(env.dir,'corrections',correction.id,correction)
    decideCorrection(correction.id,'deny')
    expect(aiRead<WikiCorrection>(env.dir,'corrections','proposal')?.status).toBe('denied')
    expect(jobs(env.dir).filter(j=>j.kind==='correction')).toEqual([])
    aiWrite(env.dir,'corrections','approved',{...correction,id:'approved',status:'pending'})
    decideCorrection('approved','accept')
    env.generate.mockResolvedValue(answer({before:[]}))
    await tickThinking()
    const applied=aiRead<WikiCorrection>(env.dir,'corrections','approved')!
    expect(applied.status).toBe('applied')
    const wiki=readFileSync(join(env.dir,'wikis',applied.wiki_file!),'utf8')
    expect(wiki).toContain('接纳后的有条件表述')
    expect(wiki).toContain('https://example.org/source')
    decideCorrection('approved','accept')
    expect(jobs(env.dir).filter(j=>j.kind==='correction')).toHaveLength(1)
    expect(loadNote(id,env.dir)?.raw_content).toBe('待纠正的普通判断')
  })
  it('makes interrupted requests explicit instead of automatically charging again',()=>{
    const id=saveNote(env.dir,'a')
    const job=enqueue({kind:'note',id},'comment')
    aiWrite(env.dir,'jobs',job.id,{...job,status:'running',steps:{finished:{body:'saved'}}})
    initializeThinking(env.dir)
    expect(jobs(env.dir)[0].status).toBe('interrupted')
    expect(jobs(env.dir)[0].steps.finished).toBeTruthy()
  })
})
