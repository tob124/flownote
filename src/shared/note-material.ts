import type { Note } from './types'
import { ATTACHMENT_SUMMARY_LIMIT, compactText, extractAttachmentSummary } from './attachment-summary'

// Earlier versions used this exact heading and source-link pair in the saved body.
const LEGACY_CLIP = /^## ([^\r\n]+)\r?\n\r?\n\[来源网页\]\(<https?:\/\/[^>\r\n]+>\)\r?\n\r?\n/gm

export function notePrimaryText(note: Note): string {
  const start = note.raw_content.search(LEGACY_CLIP)
  return start < 0 ? note.raw_content : note.raw_content.slice(0, start).trimEnd()
}

/** Organization receives metadata only. Attachment paths and contents are never read here. */
export function noteOrganizationText(note: Note, attachmentBudget = 720): string {
  const body = notePrimaryText(note)
  const summaries: string[] = []
  let remaining = attachmentBudget
  function add(name: string, summary: string): void {
    if (!summary.trim() || remaining < 60) return
    const entry = `- ${compactText(name, 64)}：${compactText(summary, ATTACHMENT_SUMMARY_LIMIT)}`
    const line = compactText(entry, remaining)
    summaries.push(line)
    remaining -= line.length + 1
  }
  for (const file of Array.isArray(note.attachments) ? note.attachments : []) {
    if (typeof file?.name === 'string' && typeof file.summary === 'string') add(file.name, file.summary)
  }
  const oldClips = body === note.raw_content ? [] : [...note.raw_content.matchAll(LEGACY_CLIP)]
  for (const [index, match] of oldClips.entries()) {
    if (remaining < 60) break
    const start = match.index + match[0].length
    const end = Math.min(oldClips[index + 1]?.index ?? note.raw_content.length, start + 24_000)
    add(match[1], extractAttachmentSummary(note.raw_content.slice(start, end)))
  }
  if (!summaries.length) return body
  const section = `【附件摘要，仅供参考】\n${summaries.join('\n')}`
  return body.trim() ? `${body}\n\n${section}` : section
}

export function noteDisplayTitle(note: Note): string {
  return note.title || note.raw_content.trim().slice(0, 60) || note.attachments?.[0]?.name || '无标题笔记'
}

export function noteListPreview(note: Note): { text?: string; summarized: boolean } {
  const limit = 160
  const body = note.raw_content.trim()
  if (!body) return { text: note.attachments?.find(file => file.summary)?.summary, summarized: false }
  if (body.length <= limit) return { text: note.raw_content, summarized: false }
  const summary = note.summary?.trim()
  const summarized = !!summary && !note.manual_fields?.includes('summary')
  return { text: compactText(summary || body, limit), summarized }
}
