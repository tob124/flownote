import { closeSync, fsyncSync, linkSync, openSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { basename, dirname, join } from 'path'

export interface AtomicWriteOptions {
  /** Create without replacing an existing file. */
  createOnly?: boolean
  /** Fault-injection point for storage tests. */
  beforeCommit?: () => void
}

/** Commit in the destination directory so a failure preserves the old file. */
export function atomicWrite(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {}
): void {
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`)
  const fd = openSync(tempPath, 'wx')
  try {
    try {
      writeFileSync(fd, content, 'utf-8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    options.beforeCommit?.()
    if (options.createOnly) {
      // Hard-link creation is exclusive and atomic on the same filesystem.
      // A rename here could replace a note created by another process.
      linkSync(tempPath, filePath)
    } else {
      renameSync(tempPath, filePath)
    }
  } finally {
    try {
      unlinkSync(tempPath)
    } catch {
      // A successful rename has already consumed the temporary path.
    }
  }
}
