import { open } from 'fs/promises'
import { extractAttachmentSummary } from '../../shared/attachment-summary'
import type { NoteFile } from '../../shared/types'
import { attachmentPath } from '../store/file-store'
import { readPdf } from './pdf-reader'

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'rst', 'csv', 'tsv'])

export async function summarizeSelectedFile(dir: string, file: NoteFile): Promise<NoteFile> {
  if (file.ext !== 'pdf' && !TEXT_EXTENSIONS.has(file.ext)) return file
  try {
    const path = attachmentPath(dir, file.storedName)
    if (!path) return file
    const handle = await open(path, 'r')
    try {
      const limit = file.ext === 'pdf' ? 20_000_000 : 64_000
      const size = (await handle.stat()).size
      if (file.ext === 'pdf' && size > limit) return file
      const buffer = Buffer.alloc(Math.min(size, limit))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const bytes = buffer.subarray(0, bytesRead)
      const content = file.ext === 'pdf' ? await readPdf(bytes, AbortSignal.timeout(8000)) : new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: bytesRead < size })
      const summary = extractAttachmentSummary(content)
      return summary ? { ...file, summary } : file
    } finally {
      await handle.close()
    }
  } catch {
    return file
  }
}
