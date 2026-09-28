import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'
import { atomicWrite } from './atomic-file'
import { hashNoteInput } from './note-store'
import { aiList } from './insight-store'
import type { WikiCorrection } from '../../shared/insights'
export function wikiPath(dir: string, filename: string): string {
  if (basename(filename) !== filename || /[\\/:*?"<>|]/.test(filename) || !filename.endsWith('.md')) throw new Error('无效 Wiki 文件名')
  return join(dir,'wikis',filename)
}
export function readWikiAt(dir: string, filename: string): string {
  const file = wikiPath(dir,filename)
  return existsSync(file) ? readFileSync(file,'utf8') : ''
}
export function acceptedCorrections(dir: string, filename: string): WikiCorrection[] {
  return aiList<WikiCorrection>(dir,'corrections').filter(c => c.wiki_file === filename && ['accepted','applied'].includes(c.status))
}
export function correctionAppendix(items: WikiCorrection[]): string {
  if (!items.length) return ''
  return '\n\n<!-- flownote-corrections -->\n## 已接纳的观点修正\n\n' + items.map(c =>
    '- ' + c.replacement + '\n  - 原判断：' + c.claim + '\n  - 依据：' +
    c.sources.map(s => '[' + s.title.replace(/[\[\]]/g,'') + '](' + s.url + ')').join('；') +
    '\n  - 笔记：' + c.note_id + ' · 修正记录：' + c.id
  ).join('\n\n')
}
export function commitWiki(dir: string, filename: string, expected: string, content: string): void {
  const path = wikiPath(dir,filename)
  const actual = readWikiAt(dir,filename)
  if (actual !== expected) throw new Error('Wiki 已被其他操作更新，请重试；原内容未覆盖')
  mkdirSync(join(dir,'wikis','.prev'),{recursive:true})
  mkdirSync(join(dir,'wikis','history'),{recursive:true})
  const history = Date.now() + '_' + randomUUID()
  atomicWrite(join(dir,'wikis','history',history+'.json'),JSON.stringify({
    schema_version:1,filename,created_at:Date.now(),before:actual,after:content,
    before_hash:hashNoteInput(actual),after_hash:hashNoteInput(content)
  },null,2))
  atomicWrite(join(dir,'wikis','.prev',filename+'.prev'),actual)
  atomicWrite(path,content)
}
