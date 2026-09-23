import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomic-file'
import { loadNote } from './note-store'
import type { ArtifactInput, ArtifactRecord, ArtifactSource } from '../../shared/artifacts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOTE_ID = /^\d{13,}$/
export class ArtifactStoreError extends Error {
  constructor(public readonly code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'IO', message: string) { super(message) }
}
function dirFor(syncDir: string): string {
  if (!syncDir) throw new ArtifactStoreError('INVALID', '请先设置同步目录')
  const dir = join(syncDir, 'artifacts')
  mkdirSync(dir, { recursive: true })
  return dir
}
function pathFor(syncDir: string, id: string): string {
  if (!UUID.test(id)) throw new ArtifactStoreError('INVALID', '成果 ID 无效')
  return join(dirFor(syncDir), `${id}.json`)
}
function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) {
    throw new ArtifactStoreError('INVALID', '成果标题需为 1–160 字')
  }
  return value.trim()
}
function read(syncDir: string, id: string): ArtifactRecord {
  const path = pathFor(syncDir, id)
  if (!existsSync(path)) throw new ArtifactStoreError('NOT_FOUND', '成果已不存在')
  try {
    const result = JSON.parse(readFileSync(path, 'utf-8')) as ArtifactRecord
    if (result.id !== id || result.schema_version !== 1 ||
        !Number.isSafeInteger(result.revision) || !Array.isArray(result.versions)) throw new Error('Invalid')
    return result
  } catch { throw new ArtifactStoreError('IO', '成果文件无法读取，请检查同步冲突') }
}
export function listArtifacts(syncDir: string): ArtifactRecord[] {
  const result: ArtifactRecord[] = []
  for (const name of readdirSync(dirFor(syncDir))) {
    if (name.endsWith('.json') && UUID.test(name.slice(0, -5))) result.push(read(syncDir, name.slice(0, -5)))
  }
  return result.sort((a, b) => b.updated_at_ms - a.updated_at_ms)
}
export function createArtifact(syncDir: string, input: ArtifactInput): ArtifactRecord {
  if (!input || typeof input !== 'object') throw new ArtifactStoreError('INVALID', '请输入成果信息')
  if (input.goal_id && (!UUID.test(input.goal_id) || !existsSync(join(syncDir, 'goals', `${input.goal_id}.json`)))) {
    throw new ArtifactStoreError('NOT_FOUND', '关联目标已不存在')
  }
  const now = Date.now()
  const record: ArtifactRecord = {
    schema_version: 1, id: randomUUID(), revision: 1, title: title(input.title),
    goal_id: input.goal_id || undefined, versions: [], created_at_ms: now, updated_at_ms: now
  }
  atomicWrite(pathFor(syncDir, record.id), JSON.stringify(record, null, 2), { createOnly: true })
  return record
}
export function renameArtifact(syncDir: string, id: string, revision: number, newTitle: string): ArtifactRecord {
  const current = read(syncDir, id)
  if (current.revision !== revision) throw new ArtifactStoreError('CONFLICT', '成果已有更新，请刷新后重试')
  current.title = title(newTitle)
  current.revision++
  current.updated_at_ms = Date.now()
  atomicWrite(pathFor(syncDir, id), JSON.stringify(current, null, 2))
  return current
}
export function saveArtifactVersion(
  syncDir: string, id: string, revision: number, body: string, noteIds: string[]
): ArtifactRecord {
  const current = read(syncDir, id)
  if (current.revision !== revision) throw new ArtifactStoreError('CONFLICT', '成果已有更新，草稿仍保留在本机')
  if (typeof body !== 'string' || !body.trim() || body.length > 100_000) {
    throw new ArtifactStoreError('INVALID', '正文需为 1–100000 字')
  }
  if (!Array.isArray(noteIds) || noteIds.length > 12 || noteIds.some((value) => typeof value !== 'string' || !NOTE_ID.test(value))) {
    throw new ArtifactStoreError('INVALID', '最多选择 12 条有效资料')
  }
  const sources: ArtifactSource[] = [...new Set(noteIds)].map((noteId) => {
    const note = loadNote(noteId, syncDir)
    if (!note) throw new ArtifactStoreError('NOT_FOUND', `来源笔记 ${noteId} 已不存在`)
    return { note_id: noteId, title: note.title || '无标题笔记',
      created_at: note.created_at, excerpt: note.raw_content.slice(0, 300) }
  })
  current.versions.push({
    id: randomUUID(), number: current.versions.length + 1,
    body, sources, created_at_ms: Date.now(), author: 'user'
  })
  current.revision++
  current.updated_at_ms = Date.now()
  atomicWrite(pathFor(syncDir, id), JSON.stringify(current, null, 2))
  return current
}
export function artifactMarkdown(record: ArtifactRecord, versionId: string): string {
  const version = record.versions.find((item) => item.id === versionId)
  if (!version) throw new ArtifactStoreError('NOT_FOUND', '版本已不存在')
  const appendix = version.sources.length
    ? '\n\n---\n\n## 来源\n\n' +
      version.sources.map((source, index) =>
        `${index + 1}. ${source.title}（${source.created_at}，笔记 ID：${source.note_id}）\n   > ${source.excerpt.replace(/\n/g, '\n   > ')}`).join('\n\n')
    : ''
  return `# ${record.title}\n\n${version.body.trim()}${appendix}\n`
}
