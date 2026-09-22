import { copyFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { join, basename, extname } from 'path'
import type { NoteFile } from '../../shared/types'

// 附件统一存放在 sync_dir/files/（与 notes/wikis 平行）
export function ensureFilesDir(syncDir: string): string {
  const dir = join(syncDir, 'files')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 将外部文件复制到 files/ 目录并返回元数据。
 * storedName 带时间戳前缀，避免重名覆盖。
 */
export function saveFiles(syncDir: string, srcPaths: string[]): NoteFile[] {
  const dir = ensureFilesDir(syncDir)
  const out: NoteFile[] = []
  for (const src of srcPaths) {
    if (!existsSync(src)) continue
    const st = statSync(src)
    if (!st.isFile()) continue
    const name = basename(src)
    const storedName = `${Date.now()}_${name}`
    copyFileSync(src, join(dir, storedName))
    out.push({
      name,
      storedName,
      ext: extname(name).replace('.', '').toLowerCase(),
      size: st.size
    })
  }
  return out
}

export function attachmentPath(syncDir: string, storedName: string): string | null {
  if (!storedName || storedName.includes('..') || storedName.includes('/') || storedName.includes('\\')) {
    return null
  }
  const p = join(syncDir, 'files', storedName)
  return existsSync(p) ? p : null
}

export function checkFiles(syncDir: string, storedNames: string[]): Record<string, boolean> {
  const res: Record<string, boolean> = {}
  for (const n of storedNames) {
    res[n] = attachmentPath(syncDir, n) !== null
  }
  return res
}