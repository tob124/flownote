import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { homedir } from 'os'
import { resolve } from 'path'
import { atomicWrite } from './atomic-file'
import type { AiJob, DiscussionThread, DreamReport, NoteInsight, Owner } from '../../shared/insights'

const localBuckets=new Set(['jobs','search-cache','page-cache','pending','responses'])
function bucketPath(dir:string,bucket:string):string {
  if(!/^[a-zA-Z0-9_-]+$/.test(bucket))throw new Error('无效的数据类型')
  if(!localBuckets.has(bucket))return join(dir,'thinking',bucket)
  const key=createHash('sha256').update(resolve(dir).toLowerCase()).digest('hex')
  return join(process.env.FLOWNOTE_LOCAL_DATA || process.env.LOCALAPPDATA || join(homedir(),'.local','share'),'FlowNote','research',key,bucket)
}
export function ownerKey(owner: Owner): string {
  if (!['note', 'dream'].includes(owner.kind) || !/^[a-zA-Z0-9_-]{1,120}$/.test(owner.id)) throw new Error('无效的记录引用')
  return owner.kind + '_' + owner.id
}
export function aiRead<T>(dir: string, bucket: string, id: string): T | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效的数据编号')
  let file = join(bucketPath(dir,bucket),id+'.json')
  if (!existsSync(file) && localBuckets.has(bucket)) file=join(dir,'thinking',bucket,id+'.json')
  if (!existsSync(file)) return null
  try{return JSON.parse(readFileSync(file, 'utf8'))}catch(error){throw new Error('本地 JSON 数据损坏：'+bucket+'/'+id+'；请从备份恢复。'+String(error))}
}
export function aiWrite(dir: string, bucket: string, id: string, value: unknown): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效的数据编号')
  const path = bucketPath(dir,bucket)
  mkdirSync(path, { recursive: true })
  atomicWrite(join(path, id + '.json'), JSON.stringify(value, null, 2))
}
export function aiList<T>(dir: string, bucket: string): T[] {
  const path = bucketPath(dir,bucket)
  const legacy=join(dir,'thinking',bucket)
  const names=[...new Set([...(existsSync(path)?readdirSync(path):[]),...(localBuckets.has(bucket)&&existsSync(legacy)?readdirSync(legacy):[])])]
  return names.filter(n => /^[a-zA-Z0-9_-]+\.json$/.test(n)).flatMap(n => {
    try { const item = aiRead<T>(dir, bucket, n.slice(0, -5)); return item ? [item] : [] } catch { return [] }
  })
}
export const jobs = (dir: string): AiJob[] => aiList<AiJob>(dir, 'jobs')
export const reports = (dir: string): DreamReport[] => aiList<DreamReport>(dir, 'reports').sort((a,b) => b.created_at - a.created_at)
export const insight = (dir: string, owner: Owner): NoteInsight | null => aiRead(dir, 'insights', ownerKey(owner))
export function thread(dir: string, owner: Owner): DiscussionThread {
  return aiRead<DiscussionThread>(dir, 'threads', ownerKey(owner)) ??
    { schema_version: 1, id: randomUUID(), owner, messages: [] }
}
export interface ThinkingState {
  schema_version: 1; known: Record<string,string>; processed: Record<string,string>; last_auto: number
}
export function readThinkingState(dir: string): ThinkingState | null { return aiRead(dir, 'state', 'current') }
export function writeThinkingState(dir: string, state: ThinkingState): void { aiWrite(dir, 'state', 'current', state) }

/** Save a journal before touching the sync directory. Retrying never calls a model. */
export async function aiCommit(dir:string,bucket:string,id:string,value:unknown):Promise<void>{
  const key=bucket+'_'+id
  aiWrite(dir,'pending',key,{bucket,id,value,pending:true})
  for(let attempt=0;;attempt++){
    try{aiWrite(dir,bucket,id,value);break}catch(error){
      const code=(error as NodeJS.ErrnoException).code
      if(!['EPERM','EBUSY'].includes(code || '') || attempt>=4)throw new Error(
        code==='ENOSPC'?'存储空间不足；结果已保留，请腾出空间后重试保存':
        code==='EACCES'?'没有写入权限；结果已保留，请修复目录权限后重试保存':
        '结果尚未保存；文件可能被占用。已保留待提交结果，可重试保存。'+String(error))
      await new Promise(resolve=>setTimeout(resolve,150*2**attempt))
    }
  }
  aiWrite(dir,'pending',key,{bucket,id,pending:false})
}
