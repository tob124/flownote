import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomic-file'
import type { CollectionInput, CollectionRecord } from '../../shared/collections'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOTE_ID = /^\d{13,}$/
export class CollectionStoreError extends Error {
  constructor(public readonly code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'IO', message: string) { super(message) }
}
function directory(syncDir: string): string {
  if (!syncDir) throw new CollectionStoreError('INVALID', '请先设置同步目录')
  const dir = join(syncDir, 'collections')
  mkdirSync(dir, { recursive: true })
  return dir
}
function pathFor(syncDir: string, id: string): string {
  if (!UUID.test(id)) throw new CollectionStoreError('INVALID', '知识库 ID 无效')
  return join(directory(syncDir), `${id}.json`)
}
function field(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new CollectionStoreError('INVALID', `${label}必须是文字`)
  const result = value.trim()
  if (result.length > max || (required && !result)) throw new CollectionStoreError('INVALID', `${label}长度不符合要求`)
  return result
}
function read(syncDir: string, id: string): CollectionRecord {
  const file = pathFor(syncDir, id)
  if (!existsSync(file)) throw new CollectionStoreError('NOT_FOUND', '知识库已不存在')
  try {
    const value = JSON.parse(readFileSync(file, 'utf-8')) as CollectionRecord
    if (value.id !== id || value.schema_version !== 1 ||
        !Number.isSafeInteger(value.revision) || !Array.isArray(value.note_ids)) throw new Error('Invalid')
    return value
  } catch { throw new CollectionStoreError('IO', '知识库文件无法读取，请检查同步冲突') }
}
function revise(syncDir: string, id: string, revision: number, mutate: (value: CollectionRecord) => void): CollectionRecord {
  const current = read(syncDir, id)
  if (current.revision !== revision) throw new CollectionStoreError('CONFLICT', '知识库已更新，请刷新后重试')
  mutate(current)
  current.revision++
  current.updated_at_ms = Date.now()
  atomicWrite(pathFor(syncDir, id), JSON.stringify(current, null, 2))
  return current
}
export function listCollections(syncDir: string): CollectionRecord[] {
  const result: CollectionRecord[] = []
  for (const name of readdirSync(directory(syncDir))) {
    if (!name.endsWith('.json') || !UUID.test(name.slice(0, -5))) continue
    result.push(read(syncDir, name.slice(0, -5)))
  }
  return result.sort((a, b) => b.updated_at_ms - a.updated_at_ms)
}
export function createCollection(syncDir: string, input: CollectionInput): CollectionRecord {
  if (!input || typeof input !== 'object') throw new CollectionStoreError('INVALID', '请输入知识库')
  const now = Date.now()
  const value: CollectionRecord = {
    schema_version: 1, id: randomUUID(), revision: 1,
    name: field(input.name, '名称', 60, true),
    description: field(input.description ?? '', '说明', 1000),
    note_ids: [], created_at_ms: now, updated_at_ms: now
  }
  atomicWrite(pathFor(syncDir, value.id), JSON.stringify(value, null, 2), { createOnly: true })
  return value
}
export function updateCollection(syncDir: string, id: string, revision: number, input: CollectionInput): CollectionRecord {
  if (!input || typeof input !== 'object') throw new CollectionStoreError('INVALID', '修改内容无效')
  return revise(syncDir, id, revision, (value) => {
    value.name = field(input.name, '名称', 60, true)
    value.description = field(input.description ?? '', '说明', 1000)
  })
}
export function linkCollectionNote(syncDir: string, id: string, revision: number, noteId: string, linked: boolean): CollectionRecord {
  if (!NOTE_ID.test(noteId) || typeof linked !== 'boolean') throw new CollectionStoreError('INVALID', '笔记关联参数无效')
  return revise(syncDir, id, revision, (value) => {
    if (linked) {
      if (!existsSync(join(syncDir, 'notes', `${noteId}.json`))) throw new CollectionStoreError('NOT_FOUND', '笔记已不存在')
      if (!value.note_ids.includes(noteId)) value.note_ids.push(noteId)
    } else value.note_ids = value.note_ids.filter((item) => item !== noteId)
  })
}
export function deleteCollection(syncDir: string, id: string, revision: number): boolean {
  const current = read(syncDir, id)
  if (current.revision !== revision) throw new CollectionStoreError('CONFLICT', '知识库已更新，请刷新后重试')
  unlinkSync(pathFor(syncDir, id))
  return true
}
