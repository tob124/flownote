export type GoalStatus = 'active' | 'paused' | 'completed'
export type CommitmentStatus = 'open' | 'done' | 'dropped'
export type CheckInOutcome = 'progress' | 'blocked' | 'changed' | 'unknown'

export interface GoalCommitment {
  id: string
  text: string
  due_on?: string
  status: CommitmentStatus
  created_at_ms: number
  updated_at_ms: number
}

export interface GoalDecision {
  id: string
  choice: string
  reason: string
  concern?: string
  evidence_note_ids: string[]
  review_on?: string
  created_at_ms: number
}

export interface GoalCheckIn {
  id: string
  observation: string
  outcome: CheckInOutcome
  next_step?: string
  created_at_ms: number
}

/** One readable JSON file per goal. Decisions and check-ins are append-only history. */
export interface GoalRecord {
  schema_version: 1
  id: string
  revision: number
  title: string
  motivation?: string
  success_signal?: string
  review_on?: string
  status: GoalStatus
  collection_ids?: string[]
  evidence_note_ids: string[]
  commitments: GoalCommitment[]
  decisions: GoalDecision[]
  check_ins: GoalCheckIn[]
  created_at_ms: number
  updated_at_ms: number
}

export interface GoalInput {
  title: string
  motivation?: string
  success_signal?: string
  review_on?: string
}
export interface GoalPatch extends Partial<GoalInput> {
  status?: GoalStatus
}
export interface CommitmentInput {
  text: string
  due_on?: string
}
export interface DecisionInput {
  choice: string
  reason: string
  concern?: string
  evidence_note_ids?: string[]
  review_on?: string
}
export interface CheckInInput {
  observation: string
  outcome: CheckInOutcome
  next_step?: string
}
export type GoalErrorCode = 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'IO'
export type GoalResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: GoalErrorCode; message: string } }
