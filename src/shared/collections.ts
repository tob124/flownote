export interface CollectionRecord {
  schema_version: 1
  id: string
  revision: number
  name: string
  description: string
  note_ids: string[]
  created_at_ms: number
  updated_at_ms: number
}
export interface CollectionInput { name: string; description?: string }
export type CollectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'IO'; message: string } }
