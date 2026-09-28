import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'
import type { DreamMeta, Note } from '../../shared/types'
import { getSyncDir, loadAllNotesFrom } from './note-store'
import { newestFirst, noteDate } from '../../shared/note-time'
import { atomicWrite } from './atomic-file'

const defaults = (): DreamMeta => ({ last_dream_at:null, dream_in_progress:false, dream_threshold:10, dream_time_range:'this_month' })
export function dreamDir(syncDir = getSyncDir()): string | null {
  if (!syncDir) return null
  const dir = join(syncDir,'dreams'); mkdirSync(dir,{recursive:true}); return dir
}
export function loadDreamState(syncDir = getSyncDir()): DreamMeta {
  try { return { ...defaults(), ...JSON.parse(readFileSync(join(syncDir,'dream_state.json'),'utf8')) } }
  catch { return defaults() }
}
export function saveDreamState(state: DreamMeta, syncDir = getSyncDir()): void {
  if (syncDir) atomicWrite(join(syncDir,'dream_state.json'),JSON.stringify(state,null,2))
}
export function isDreamInProgress(): boolean { return loadDreamState().dream_in_progress }
export function acquireDreamLock(syncDir = getSyncDir()): boolean {
  const state = loadDreamState(syncDir)
  if (state.dream_in_progress) return false
  saveDreamState({...state,dream_in_progress:true},syncDir); return true
}
export function releaseDreamLock(success = false, syncDir = getSyncDir()): void {
  const state = loadDreamState(syncDir)
  saveDreamState({...state,dream_in_progress:false,last_dream_at:success ? new Date().toISOString() : state.last_dream_at},syncDir)
}
export function timeRangeStartDate(range: string, now = new Date()): string {
  if (range === 'all') return '0000-00-00'
  const day = new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))
  const days: Record<string,number> = {last_7_days:7,last_30_days:30,last_60_days:60,last_120_days:120}
  if (range in days) day.setUTCDate(day.getUTCDate()-days[range])
  else if (range === 'this_year') day.setUTCMonth(0,1)
  else day.setUTCDate(1)
  return day.toISOString().slice(0,10)
}
export function getDreamableNotes(syncDir = getSyncDir()): Note[] {
  if (!syncDir) return []
  const start = timeRangeStartDate(loadDreamState(syncDir).dream_time_range)
  return loadAllNotesFrom(syncDir).filter(n => n.raw_content.trim() && noteDate(n) >= start).sort(newestFirst)
}
export function getNotesForDream(syncDir = getSyncDir()): Note[] {
  const all = getDreamableNotes(syncDir)
  if (all.length <= 100) return all
  // Uniform sampling across the actual ordered timeline, never a day-of-month week key.
  return Array.from({length:100},(_,i) => all[Math.floor(i*(all.length-1)/99)])
}
export function _lastDreamMs(): number { return Date.parse(loadDreamState().last_dream_at || '') || 0 }
export function getNewNotesCount(): number {
  // New worker tracks exact body versions; retained for old read-only consumers.
  const last = _lastDreamMs()
  return getDreamableNotes().filter(n => (n.created_at_ms ?? Date.parse(n.created_at)) > last).length
}
export function saveDreamReport(content: string, syncDir = getSyncDir(), id = randomUUID()): string | null {
  const dir = dreamDir(syncDir); if (!dir) return null
  const name = 'dream_' + new Date().toISOString().replace(/[:.]/g,'-') + '_' + id + '.md'
  atomicWrite(join(dir,name),content.trim()); return name
}
export function listDreamReports(): string[] {
  const dir = dreamDir()
  return dir ? readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse() : []
}
export function loadDreamReport(filename: string): string | null {
  if (basename(filename) !== filename || !filename.endsWith('.md')) throw new Error('无效报告路径')
  const dir = dreamDir(); if (!dir) return null
  const file = join(dir,filename)
  return existsSync(file) ? readFileSync(file,'utf8') : null
}
export function setDreamThreshold(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error('阈值应为 1–1000')
  saveDreamState({...loadDreamState(),dream_threshold:value})
}
export function setDreamTimeRange(value: string): void {
  if (!['last_7_days','last_30_days','last_60_days','last_120_days','this_month','this_year','all'].includes(value)) throw new Error('无效时间范围')
  saveDreamState({...loadDreamState(),dream_time_range:value})
}
