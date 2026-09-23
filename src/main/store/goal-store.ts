import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { atomicWrite } from './atomic-file'
import type {
  CheckInInput, CommitmentInput, CommitmentStatus, DecisionInput,
  GoalErrorCode, GoalInput, GoalPatch, GoalRecord, GoalStatus
} from '../../shared/goals'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOTE_ID = /^\d{13,}$/
const GOAL_STATUSES: GoalStatus[] = ['active', 'paused', 'completed']
const COMMITMENT_STATUSES: CommitmentStatus[] = ['open', 'done', 'dropped']
const OUTCOMES = ['progress', 'blocked', 'changed', 'unknown']

export class GoalStoreError extends Error {
  constructor(public readonly code: GoalErrorCode, message: string) {
    super(message)
  }
}

function invalid(message: string): never {
  throw new GoalStoreError('INVALID', message)
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string') invalid(`${label}必须是文字`)
  const result = (value as string).trim()
  if (result.length > max || (required && !result)) invalid(`${label}长度不符合要求`)
  return result
}
function date(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = text(value, label, 10)
  const millis = Date.parse(`${parsed}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || !Number.isFinite(millis) ||
      new Date(millis).toISOString().slice(0, 10) !== parsed) {
    invalid(`${label}不是有效日期`)
  }
  return parsed
}
function goalDir(syncDir: string): string {
  if (!syncDir) throw new GoalStoreError('INVALID', '请先设置同步目录')
  const dir = join(syncDir, 'goals')
  mkdirSync(dir, { recursive: true })
  return dir
}
function goalPath(syncDir: string, id: string): string {
  if (!UUID.test(id)) invalid('目标 ID 无效')
  return join(goalDir(syncDir), `${id}.json`)
}
function readGoal(syncDir: string, id: string): GoalRecord {
  const path = goalPath(syncDir, id)
  if (!existsSync(path)) throw new GoalStoreError('NOT_FOUND', '目标已不存在，请刷新')
  try {
    const goal = JSON.parse(readFileSync(path, 'utf-8')) as GoalRecord
    if (goal.id !== id || goal.schema_version !== 1 || !Number.isSafeInteger(goal.revision)) {
      throw new Error('Invalid goal record')
    }
    return goal
  } catch {
    throw new GoalStoreError('IO', '目标文件无法读取，请检查同步冲突或文件内容')
  }
}
function writeGoal(syncDir: string, goal: GoalRecord): GoalRecord {
  atomicWrite(goalPath(syncDir, goal.id), JSON.stringify(goal, null, 2))
  return goal
}
function mutate(
  syncDir: string, id: string, expectedRevision: number,
  change: (goal: GoalRecord) => void
): GoalRecord {
  const goal = readGoal(syncDir, id)
  if (!Number.isSafeInteger(expectedRevision) || goal.revision !== expectedRevision) {
    throw new GoalStoreError('CONFLICT', '目标已有更新，请刷新后重试；你的输入仍保留在页面上')
  }
  change(goal)
  goal.revision++
  goal.updated_at_ms = Date.now()
  return writeGoal(syncDir, goal)
}

export function listGoals(syncDir: string): GoalRecord[] {
  const dir = goalDir(syncDir)
  const goals: GoalRecord[] = []
  for (const filename of readdirSync(dir)) {
    if (!UUID.test(filename.slice(0, -5)) || !filename.endsWith('.json')) continue
    goals.push(readGoal(syncDir, filename.slice(0, -5)))
  }
  return goals.sort((a, b) => b.updated_at_ms - a.updated_at_ms)
}

export function createGoal(syncDir: string, input: GoalInput): GoalRecord {
  if (!input || typeof input !== 'object') invalid('请输入目标')
  const now = Date.now()
  const goal: GoalRecord = {
    schema_version: 1, id: randomUUID(), revision: 1,
    title: text(input.title, '目标名称', 160, true),
    motivation: text(input.motivation ?? '', '动机', 2000) || undefined,
    success_signal: text(input.success_signal ?? '', '进展信号', 1000) || undefined,
    review_on: date(input.review_on, '回看日期'), status: 'active',
    collection_ids: [], evidence_note_ids: [], commitments: [], decisions: [], check_ins: [],
    created_at_ms: now, updated_at_ms: now
  }
  atomicWrite(goalPath(syncDir, goal.id), JSON.stringify(goal, null, 2), { createOnly: true })
  return goal
}

export function updateGoal(
  syncDir: string, id: string, expectedRevision: number, patch: GoalPatch
): GoalRecord {
  if (!patch || typeof patch !== 'object') invalid('修改内容无效')
  return mutate(syncDir, id, expectedRevision, (goal) => {
    if (patch.title !== undefined) goal.title = text(patch.title, '目标名称', 160, true)
    if (patch.motivation !== undefined) goal.motivation = text(patch.motivation, '动机', 2000) || undefined
    if (patch.success_signal !== undefined) goal.success_signal = text(patch.success_signal, '进展信号', 1000) || undefined
    if (patch.review_on !== undefined) goal.review_on = date(patch.review_on, '回看日期')
    if (patch.status !== undefined) {
      if (!GOAL_STATUSES.includes(patch.status)) invalid('目标状态无效')
      goal.status = patch.status
    }
  })
}

export function addCommitment(
  syncDir: string, id: string, expectedRevision: number, input: CommitmentInput
): GoalRecord {
  if (!input || typeof input !== 'object') invalid('请输入下一步')
  return mutate(syncDir, id, expectedRevision, (goal) => {
    const now = Date.now()
    goal.commitments.push({
      id: randomUUID(), text: text(input.text, '下一步', 500, true),
      due_on: date(input.due_on, '预计日期'), status: 'open',
      created_at_ms: now, updated_at_ms: now
    })
  })
}

export function updateCommitment(
  syncDir: string, id: string, expectedRevision: number,
  commitmentId: string, status: CommitmentStatus
): GoalRecord {
  if (!UUID.test(commitmentId) || !COMMITMENT_STATUSES.includes(status)) invalid('下一步状态无效')
  return mutate(syncDir, id, expectedRevision, (goal) => {
    const item = goal.commitments.find((entry) => entry.id === commitmentId)
    if (!item) throw new GoalStoreError('NOT_FOUND', '下一步已不存在')
    item.status = status
    item.updated_at_ms = Date.now()
  })
}

export function linkNote(
  syncDir: string, id: string, expectedRevision: number, noteId: string, linked: boolean
): GoalRecord {
  if (!NOTE_ID.test(noteId) || typeof linked !== 'boolean') invalid('笔记关联参数无效')
  return mutate(syncDir, id, expectedRevision, (goal) => {
    if (linked) {
      if (!existsSync(join(syncDir, 'notes', `${noteId}.json`))) {
        throw new GoalStoreError('NOT_FOUND', '笔记已不存在')
      }
      if (!goal.evidence_note_ids.includes(noteId)) goal.evidence_note_ids.push(noteId)
    } else {
      goal.evidence_note_ids = goal.evidence_note_ids.filter((value) => value !== noteId)
    }
  })
}

export function addDecision(
  syncDir: string, id: string, expectedRevision: number, input: DecisionInput
): GoalRecord {
  if (!input || typeof input !== 'object') invalid('请输入决定')
  return mutate(syncDir, id, expectedRevision, (goal) => {
    const evidence = input.evidence_note_ids ?? []
    if (!Array.isArray(evidence) || evidence.some((noteId) =>
      typeof noteId !== 'string' || !goal.evidence_note_ids.includes(noteId))) {
      invalid('决定只能引用已关联的笔记')
    }
    goal.decisions.push({
      id: randomUUID(), choice: text(input.choice, '决定', 1000, true),
      reason: text(input.reason, '理由', 2000),
      concern: text(input.concern ?? '', '顾虑', 2000) || undefined,
      evidence_note_ids: [...new Set(evidence)], review_on: date(input.review_on, '复查日期'),
      created_at_ms: Date.now()
    })
  })
}

export function addCheckIn(
  syncDir: string, id: string, expectedRevision: number, input: CheckInInput
): GoalRecord {
  if (!input || typeof input !== 'object' || !OUTCOMES.includes(input.outcome)) invalid('回看状态无效')
  return mutate(syncDir, id, expectedRevision, (goal) => {
    goal.check_ins.push({
      id: randomUUID(), observation: text(input.observation, '本次回看', 4000, true),
      outcome: input.outcome,
      next_step: text(input.next_step ?? '', '下一步想法', 1000) || undefined,
      created_at_ms: Date.now()
    })
  })
}

export function linkGoalCollection(
  syncDir: string, id: string, expectedRevision: number, collectionId: string, linked: boolean
): GoalRecord {
  if (!UUID.test(collectionId) || typeof linked !== 'boolean') invalid('知识库关联参数无效')
  return mutate(syncDir, id, expectedRevision, (goal) => {
    const ids = goal.collection_ids ?? []
    if (linked) {
      if (!existsSync(join(syncDir, 'collections', `${collectionId}.json`))) {
        throw new GoalStoreError('NOT_FOUND', '知识库已不存在')
      }
      if (!ids.includes(collectionId)) goal.collection_ids = [...ids, collectionId]
    } else goal.collection_ids = ids.filter((value) => value !== collectionId)
  })
}
