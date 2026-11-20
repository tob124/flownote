import { copyFileSync, constants, existsSync, mkdirSync, statSync, realpathSync, lstatSync } from 'fs'
import { randomUUID } from 'crypto'
import { join, basename, extname, relative, isAbsolute } from 'path'
import type { NoteFile } from '../../shared/types'
import { ATTACHMENT_SUMMARY_LIMIT, compactText, extractAttachmentSummary } from '../../shared/attachment-summary'
import { atomicWrite } from './atomic-file'

// 附件统一存放在 sync_dir/files/（与 notes/wikis 平行）
export function ensureFilesDir(syncDir: string): string {
  const dir = join(syncDir, 'files')
  mkdirSync(dir, { recursive: true })
  if (lstatSync(dir).isSymbolicLink()) throw new Error('附件目录不能是符号链接')
  return dir
}

/**
 * 将外部文件复制到 files/ 目录并返回元数据。
 * storedName 带唯一前缀，避免同名文件覆盖。
 */
export function saveFiles(syncDir: string, srcPaths: string[]): NoteFile[] {
  const dir = ensureFilesDir(syncDir)
  const out: NoteFile[] = []
  for (const src of srcPaths) {
    if (!existsSync(src)) continue
    const st = statSync(src)
    if (!st.isFile()) continue
    const name = basename(src)
    const extension = extname(name)
    const storedName = `${randomUUID()}_${compactText(basename(name, extension), 175)}${extension.slice(0, 30)}`
    copyFileSync(src, join(dir, storedName), constants.COPYFILE_EXCL)
    out.push({
      name,
      storedName,
      ext: extension.replace('.', '').toLowerCase(),
      size: st.size
    })
  }
  return out
}

export function saveWebClip(syncDir: string, clip: { title: string; sourceUrl: string; markdown: string; content: string }): NoteFile {
  const dir = ensureFilesDir(syncDir)
  const storedName = `web-${randomUUID()}.md`
  atomicWrite(join(dir, storedName), clip.markdown, { createOnly: true })
  const name = clip.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim() || '网页剪藏'
  return {
    name: `${compactText(name, 100)}.md`, storedName, ext: 'md', size: Buffer.byteLength(clip.markdown),
    summary: extractAttachmentSummary(clip.content) || compactText(clip.title, ATTACHMENT_SUMMARY_LIMIT),
    sourceUrl: clip.sourceUrl
  }
}

export function validAttachmentName(name: unknown): name is string {
  return typeof name === 'string' && !!name && name !== '.' && name !== '..' && !/[\\/:\0]/.test(name)
}

export function attachmentPath(syncDir: string, storedName: string): string | null {
  if (!syncDir || !validAttachmentName(storedName)) {
    return null
  }
  const p = join(syncDir, 'files', storedName)
  if (!existsSync(p)) return null
  const library = realpathSync(syncDir)
  const attachmentDir=join(library,'files')
  if(lstatSync(attachmentDir).isSymbolicLink() || lstatSync(p).isSymbolicLink())return null
  const root = realpathSync(attachmentDir)
  if(relative(library,root)!=='files')return null
  const resolved = realpathSync(p)
  const rel = relative(root, resolved)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !statSync(resolved).isFile()) return null
  return resolved
}

export function checkFiles(syncDir: string, storedNames: string[]): Record<string, boolean> {
  const res: Record<string, boolean> = {}
  for (const n of storedNames) {
    res[n] = attachmentPath(syncDir, n) !== null
  }
  return res
}
