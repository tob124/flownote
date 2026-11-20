import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { attachmentMediaUrl, mediaFormat, type AttachmentPreviewData } from '../../shared/attachment-preview'
import { attachmentPath } from '../store/file-store'
import { getSyncDir, loadNote } from '../store/note-store'

const TEXT_LIMIT = 2_100_000
const PDF_LIMIT = 50_000_000
const TEXT_FORMATS = new Set(['txt', 'md', 'markdown', 'rst', 'csv', 'tsv', 'log', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'ini', 'toml', 'js', 'ts', 'py', 'css', 'sql'])

export function noteAttachmentPath(noteId: string, storedName: string): string | null {
  const dir = getSyncDir()
  const files = dir ? loadNote(noteId, dir)?.attachments : undefined
  return Array.isArray(files) && files.some(file => file?.storedName === storedName) ? attachmentPath(dir, storedName) : null
}

export async function readAttachmentPreview(noteId: string, storedName: string): Promise<AttachmentPreviewData> {
  const path = noteAttachmentPath(noteId, storedName)
  if (!path) return { kind: 'unavailable', message: '附件文件缺失或尚未同步。' }
  const extension = extname(path).slice(1).toLowerCase()
  const media = mediaFormat(extension)
  if (media) return { kind: media.kind, url: attachmentMediaUrl(noteId, storedName) }
  const isPdf = extension === 'pdf'
  if (!isPdf && !TEXT_FORMATS.has(extension)) {
    return { kind: 'unavailable', message: '这种文件格式需要用系统应用打开。' }
  }
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    if (isPdf && size > PDF_LIMIT) return { kind: 'unavailable', message: '这个 PDF 超过 50 MB，请用系统应用打开。' }
    const bytes = Buffer.alloc(Math.min(size, isPdf ? PDF_LIMIT : TEXT_LIMIT))
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    const content = bytes.subarray(0, offset)
    if (isPdf) return { kind: 'pdf', bytes: content }
    const truncated = size > offset
    const encoding = content[0] === 0xff && content[1] === 0xfe ? 'utf-16le'
      : content[0] === 0xfe && content[1] === 0xff ? 'utf-16be' : 'utf-8'
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(content, { stream: truncated })
      return { kind: extension === 'md' || extension === 'markdown' ? 'markdown' : 'text', text, truncated }
    } catch {
      return { kind: 'unavailable', message: '无法识别这个文本文件的编码，请用系统应用打开。' }
    }
  } finally { await handle.close() }
}

export async function serveAttachmentMedia(noteId: string, storedName: string, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  const path = noteAttachmentPath(noteId, storedName)
  const media = path && mediaFormat(extname(path).slice(1))
  if (!path || !media) return new Response(null, { status: 404 })
  const handle = await open(path, 'r')
  let streaming = false
  try {
    const { size } = await handle.stat()
    const range = request.headers.get('Range')
    let start = 0
    let end = size - 1
    const headers = new Headers({
      'Content-Type': media.mime, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes',
      'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff'
    })
    if (range !== null) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (match?.[1]) {
        start = Number(match[1])
        if (match[2]) end = Math.min(Number(match[2]), end)
      } else if (match?.[2]) start = Math.max(0, size - Number(match[2]))
      if (!match || !(match[1] || match[2]) || !Number.isSafeInteger(start) || start > end) {
        headers.set('Content-Range', `bytes */${size}`)
        return new Response(null, { status: 416, headers })
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
    }
    headers.set('Content-Length', String(Math.max(0, end - start + 1)))
    const status = range === null ? 200 : 206
    if (!size || request.method === 'HEAD') return new Response(null, { status, headers })
    const stream = Readable.toWeb(handle.createReadStream({ start, end }))
    const response = new Response(stream, { status, headers })
    streaming = true
    return response
  } finally { if (!streaming) await handle.close() }
}
