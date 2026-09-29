export type Owner = { kind: 'note' | 'dream'; id: string }
export type Feedback = 'helpful' | 'unhelpful' | 'less' | 'read' | 'irrelevant'
export interface Usage { input: number; output: number; searches: number }
export interface SourceEvidence {
  id: string; url: string; title: string; fetched_at: number
  text: string; excerpt?: string; kind: 'primary' | 'secondary' | 'unknown'
  read_status?: 'read' | 'abstract' | 'failed' | 'not_attempted'
  read_error?: string
  analysis_ranges?: {start:number;end:number}[]
  document_type?: 'author' | 'publisher' | 'paper' | 'review' | 'repost' | 'unknown'
  format?: 'html' | 'xml' | 'pdf'; coverage?: string; identifier?: string; version?: string
}
export interface Recommendation {
  id: string; title: string; author: string; original_title: string; translation: string
  question: string; idea: string; relevance: string; limits: string; reading: string
  attribution: 'author' | 'extension'; identity_source_ids: string[]; source_ids: string[]
  material_type?: 'book' | 'paper' | 'article'
  quality?: {kind:'rating'|'professional_review';source_id:string;excerpt:string;platform?:string;score?:number;count?:number;edition:string;checked_at:number;reason:string}
  evidence: 'primary' | 'secondary' | 'unverified'; quote?: string; feedback?: Feedback
}
export interface NoteInsight {
  schema_version: 1; id: string; owner: Owner; input_hash: string; created_at: number
  body: string; skipped: boolean; feedback?: Feedback; recommendations: Recommendation[]
  sources: SourceEvidence[]; warning?: string; usage: Usage
}
export interface DreamReport {
  schema_version: 1; id: string; created_at: number; body: string
  notes: { id: string; hash: string; title: string }[]
  supplement_body?: string; supplement_status?: 'pending' | 'complete' | 'failed'
  coverage: string; recommendations: Recommendation[]; sources: SourceEvidence[]
  warning?: string; usage: Usage
}
export interface DiscussionThread {
  schema_version: 1; id: string; owner: Owner
  messages: { id: string; role: 'user' | 'assistant'; text: string; created_at: number; input_hash?: string; sources?: SourceEvidence[]; usage?: Usage }[]
}
export interface AiJob {
  schema_version: 1; id: string; owner: Owner; kind: 'comment' | 'research' | 'dream' | 'reply' | 'correction'
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted'
  created_at: number; input_hash: string; prompt?: string; automatic?: boolean
  phase: string; error?: string; steps: Record<string, unknown>; usage: Usage
}
export interface InsightView {
  insight: NoteInsight | null; report: DreamReport | null; thread: DiscussionThread
  jobs: AiJob[]; stale: boolean; corrections: WikiCorrection[]
}
export const EMPTY_USAGE = (): Usage => ({ input: 0, output: 0, searches: 0 })

export interface WikiCorrection {
  schema_version: 1; id: string; note_id: string; input_hash: string; created_at: number
  claim: string; replacement: string; reason: string; sources: SourceEvidence[]
  status: 'pending' | 'accepted' | 'denied' | 'applied' | 'stale'
  wiki_file?: string; applied_at?: number; before_hash?: string; after_hash?: string
}
