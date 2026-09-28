import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { atomicWrite } from './atomic-file'
import type { AiJob, DiscussionThread, DreamReport, NoteInsight, Owner } from '../../shared/insights'

export function ownerKey(owner: Owner): string {
  if (!['note', 'dream'].includes(owner.kind) || !/^[a-zA-Z0-9_-]{1,120}$/.test(owner.id)) throw new Error('无效的记录引用')
  return owner.kind + '_' + owner.id
}
export function aiRead<T>(dir: string, bucket: string, id: string): T | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效的数据编号')
  const file = join(dir, 'thinking', bucket, id + '.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}
export function aiWrite(dir: string, bucket: string, id: string, value: unknown): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效的数据编号')
  const path = join(dir, 'thinking', bucket)
  mkdirSync(path, { recursive: true })
  atomicWrite(join(path, id + '.json'), JSON.stringify(value, null, 2))
}
export function aiList<T>(dir: string, bucket: string): T[] {
  const path = join(dir, 'thinking', bucket)
  if (!existsSync(path)) return []
  return readdirSync(path).filter(n => /^[a-zA-Z0-9_-]+\.json$/.test(n)).flatMap(n => {
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
