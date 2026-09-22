import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import type { DreamMeta, Note } from '../../shared/types'
import { getSyncDir, loadAllNotes } from './note-store'

export function dreamDir(): string | null {
  const syncDir = getSyncDir()
  if (!syncDir) return null
  const dir = join(syncDir, 'dreams')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function loadDreamState(): DreamMeta {
  const syncDir = getSyncDir()
  if (!syncDir) {
    return { last_dream_at: null, dream_in_progress: false, dream_threshold: 10, dream_time_range: 'this_month' }
  }
  const statePath = join(syncDir, 'dream_state.json')
  const defaults: DreamMeta = {
    last_dream_at: null,
    dream_in_progress: false,
    dream_threshold: 10,
    dream_time_range: 'this_month'
  }
  try {
    if (!existsSync(statePath)) return defaults
    const raw = readFileSync(statePath, 'utf-8')
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

export function saveDreamState(state: DreamMeta): void {
  const syncDir = getSyncDir()
  if (!syncDir) return
  writeFileSync(join(syncDir, 'dream_state.json'), JSON.stringify(state, null, 2), 'utf-8')
}

export function isDreamInProgress(): boolean {
  return loadDreamState().dream_in_progress
}

export function acquireDreamLock(): boolean {
  const state = loadDreamState()
  if (state.dream_in_progress) return false
  state.dream_in_progress = true
  saveDreamState(state)
  return true
}

export function releaseDreamLock(): void {
  const state = loadDreamState()
  state.dream_in_progress = false
  state.last_dream_at = new Date().toISOString()
  saveDreamState(state)
}

export function _lastDreamMs(): number {
  const state = loadDreamState()
  if (!state.last_dream_at) return 0
  try {
    return new Date(state.last_dream_at).getTime()
  } catch {
    return 0
  }
}

function timeRangeStartDate(timeRange: string): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  let result: string

  switch (timeRange) {
    case 'last_7_days': {
      const d7 = new Date(y, m, d - 7)
      result = d7.toISOString().slice(0, 10)
      break
    }
    case 'last_30_days': {
      const d30 = new Date(y, m, d - 30)
      result = d30.toISOString().slice(0, 10)
      break
    }
    case 'last_60_days': {
      const d60 = new Date(y, m, d - 60)
      result = d60.toISOString().slice(0, 10)
      break
    }
    case 'last_120_days': {
      const d120 = new Date(y, m, d - 120)
      result = d120.toISOString().slice(0, 10)
      break
    }
    case 'this_month':
      result = `${y}-${String(m + 1).padStart(2, '0')}-01`
      break
    case 'this_year':
      result = `${y}-01-01`
      break
    case 'all':
      result = '0000-00-00'
      break
    default:
      result = `${y}-${String(m + 1).padStart(2, '0')}-01`
  }

  console.log(`[dream-store] timeRangeStartDate: timeRange=${timeRange}, result=${result}`)
  return result
}

function filterDreamable(notes: Note[], timeRange: string): Note[] {
  const startDate = timeRangeStartDate(timeRange)
  const filtered = notes.filter(
    (n) => n.ai_status === 'done' && n.category !== 'Inbox' && n.created_at >= startDate
  )
  
  console.log(`[dream-store] filterDreamable: totalNotes=${notes.length}, filteredCount=${filtered.length}, startDate=${startDate}, timeRange=${timeRange}`)
  if (filtered.length > 0) {
    const dates = filtered.map(n => n.created_at).sort()
    console.log(`[dream-store] filterDreamable: dateRange=[${dates[0]} .. ${dates[dates.length - 1]}]`)
  }
  
  return filtered
}

export function getNewNotesCount(): number {
  const allNotes = loadAllNotes()
  const state = loadDreamState()
  const lastMs = _lastDreamMs()
  const dreamable = filterDreamable(allNotes, state.dream_time_range)
  return dreamable.filter((n) => parseInt(n.id) > lastMs).length
}

export function getNotesForDream(): Note[] {
  const allNotes = loadAllNotes()
  const state = loadDreamState()
  const dreamable = filterDreamable(allNotes, state.dream_time_range)
  const MAX_DREAM_NOTES = 100
  
  // Group notes by time periods for better representation
  if (dreamable.length <= MAX_DREAM_NOTES) {
    return dreamable
  }
  
  // Group by week for better time distribution
  const groups = new Map<string, Note[]>()
  for (const note of dreamable) {
    const date = new Date(note.created_at)
    const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`
    if (!groups.has(weekKey)) {
      groups.set(weekKey, [])
    }
    groups.get(weekKey)!.push(note)
  }
  
  // Select notes proportionally from each group
  const result: Note[] = []
  const groupCount = groups.size
  const perGroup = Math.max(1, Math.floor(MAX_DREAM_NOTES / groupCount))
  
  for (const [, notes] of groups) {
    const take = Math.min(perGroup, notes.length)
    result.push(...notes.slice(0, take))
  }
  
  // If we still have room, fill with remaining notes
  if (result.length < MAX_DREAM_NOTES) {
    const selected = new Set(result.map(n => n.id))
    for (const note of dreamable) {
      if (result.length >= MAX_DREAM_NOTES) break
      if (!selected.has(note.id)) {
        result.push(note)
        selected.add(note.id)
      }
    }
  }
  
  return result.slice(0, MAX_DREAM_NOTES)
}

export function saveDreamReport(content: string): string | null {
  const dir = dreamDir()
  if (!dir) return null
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const ts = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const filename = `dream_${ts}.md`
  writeFileSync(join(dir, filename), content.trim(), 'utf-8')
  return filename
}

export function listDreamReports(): string[] {
  const dir = dreamDir()
  if (!dir) return []
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

export function loadDreamReport(filename: string): string | null {
  const dir = dreamDir()
  if (!dir) return null
  try {
    return readFileSync(join(dir, filename), 'utf-8')
  } catch {
    return null
  }
}

export function setDreamThreshold(value: number): void {
  const state = loadDreamState()
  state.dream_threshold = value
  saveDreamState(state)
}

export function setDreamTimeRange(value: string): void {
  const state = loadDreamState()
  state.dream_time_range = value
  saveDreamState(state)
}
