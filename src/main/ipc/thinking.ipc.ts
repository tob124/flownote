import { ipcMain, dialog } from 'electron'
import { readFileSync, readdirSync, lstatSync } from 'fs'
import { join, basename } from 'path'
import { readPdf } from '../services/pdf-reader'
import { createHash } from 'crypto'
import type { Owner, Feedback } from '../../shared/insights'
import { enqueue, getInsightView, jobAction, saveFeedback, decideCorrection, requestDream } from '../services/thinking-service'
import { getSyncDir } from '../store/note-store'
import { aiList, aiRead, aiCommit, ownerKey, reports } from '../store/insight-store'
import { atomicWrite } from '../store/atomic-file'
import type { AiJob } from '../../shared/insights'

export function collectLegacy(dir: string): { path:string; base64:string; sha256:string }[] {
  const files: { path:string; base64:string; sha256:string }[]=[]
  function visit(relative:string):void {
    const path=join(dir,relative)
    let stat;try {stat=lstatSync(path)} catch {return}
    if (stat.isSymbolicLink()) return
    if (stat.isDirectory()) { for (const name of readdirSync(path)) visit(join(relative,name)); return }
    if (!stat.isFile()) return
    const data=readFileSync(path)
    files.push({path:relative.replace(/\\/g,'/'),base64:data.toString('base64'),sha256:createHash('sha256').update(data).digest('hex')})
  }
  for (const bucket of ['goals','collections','artifacts']) visit(bucket)
  return files
}
export function registerThinkingIpc():void {
  ipcMain.handle('thinking:import-pdf',async(_e,owner:Owner)=>{
    const dir=getSyncDir();ownerKey(owner);getInsightView(owner)
    const selection=await dialog.showOpenDialog({title:'补充文字版 PDF',properties:['openFile'],filters:[{name:'PDF',extensions:['pdf']}]})
    if(selection.canceled || !selection.filePaths[0])return false
    const file=selection.filePaths[0],stat=lstatSync(file)
    if(!stat.isFile() || stat.size>20_000_000)throw new Error('请选择 20 MB 以内的普通 PDF 文件')
    const bytes=readFileSync(file),text=await readPdf(bytes,AbortSignal.timeout(25000))
    if(getSyncDir()!==dir)throw new Error('目录已切换，未导入旧目录的资料')
    getInsightView(owner)
    const id=createHash('sha256').update(bytes).digest('hex').slice(0,20)
    const source={id,url:'',title:basename(file),fetched_at:Date.now(),text,kind:'unknown' as const,format:'pdf' as const,coverage:text.split('\n')[0],read_status:'read' as const}
    const previous=aiRead<import('../../shared/insights').SourceEvidence[]>(dir,'provided-sources',ownerKey(owner)) || []
    await aiCommit(dir,'provided-sources',ownerKey(owner),[source,...previous.filter(s=>s.id!==id)].slice(0,12))
    if(owner.kind==='dream'){const report=aiRead<import('../../shared/insights').DreamReport>(dir,'reports',owner.id);if(report){report.supplement_status='failed';report.warning='已补充本地资料，可重新核查外部补充。';await aiCommit(dir,'reports',owner.id,report)}}
    return true
  })
  ipcMain.handle('thinking:view',(_e,owner:Owner)=>getInsightView(owner))
  ipcMain.handle('thinking:run',(_e,id:string,kind:'comment'|'research')=>{
    if (!['comment','research'].includes(kind)) throw new Error('不支持的任务')
    return enqueue({kind:'note',id},kind)
  })
  ipcMain.handle('thinking:reply',(_e,owner:Owner,text:string)=>enqueue(owner,'reply',text))
  ipcMain.handle('thinking:action',(_e,id:string,action:'cancel'|'retry')=>{
    if (!['cancel','retry'].includes(action)) throw new Error('无效任务操作')
    return jobAction(id,action)
  })
  ipcMain.handle('thinking:feedback',(_e,owner:Owner,feedback:Feedback,id?:string)=>saveFeedback(owner,feedback,id))
  ipcMain.handle('thinking:correction',(_e,id:string,decision:'accept'|'deny')=>{
    if (!['accept','deny'].includes(decision)) throw new Error('无效选择')
    return decideCorrection(id,decision)
  })
  ipcMain.handle('thinking:reports',()=>reports(getSyncDir()))
  ipcMain.handle('thinking:jobs',()=>aiList<AiJob>(getSyncDir(),'jobs').sort((a,b)=>b.created_at-a.created_at).slice(0,100))
  ipcMain.handle('thinking:dream',()=>requestDream())
  ipcMain.handle('thinking:legacy-export',async ()=>{
    const dir=getSyncDir();if(!dir) throw new Error('请先设置数据目录')
    const result=await dialog.showSaveDialog({defaultPath:'FlowNote-旧模块数据.json',filters:[{name:'JSON',extensions:['json']}]})
    if(result.canceled || !result.filePath)return false
    const files=collectLegacy(dir)
    atomicWrite(result.filePath,JSON.stringify({schema_version:1,created_at:new Date().toISOString(),
      encoding:'base64',description:'原文件逐字节保留，path 为相对路径；sha256 可用于校验。',files},null,2))
    return true
  })
}
