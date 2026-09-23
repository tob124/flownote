export interface ArtifactSource {
  note_id: string
  title: string
  created_at: string
  excerpt: string
}
export interface ArtifactVersion {
  id: string
  number: number
  body: string
  sources: ArtifactSource[]
  created_at_ms: number
  author: 'user'
}
export interface ArtifactRecord {
  schema_version: 1
  id: string
  revision: number
  title: string
  goal_id?: string
  versions: ArtifactVersion[]
  created_at_ms: number
  updated_at_ms: number
}
export interface ArtifactInput { title: string; goal_id?: string }
export type ArtifactResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'IO'; message: string } }
