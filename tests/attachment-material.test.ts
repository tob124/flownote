import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ATTACHMENT_SUMMARY_LIMIT, extractAttachmentSummary } from '../src/shared/attachment-summary'
import { noteOrganizationText, notePrimaryText } from '../src/shared/note-material'
import { attachmentPath, saveFiles, saveWebClip } from '../src/main/store/file-store'
import { applyAiPatch, hashNoteInput, loadNote, patchNote, saveNote } from '../src/main/store/note-store'
import { summarizeSelectedFile } from '../src/main/services/attachment-summary'
import { readAttachmentPreview, serveAttachmentMedia } from '../src/main/services/attachment-preview'
import { attachmentMediaUrl } from '../src/shared/attachment-preview'

const library = vi.hoisted(() => ({ dir: '' }))
vi.mock('../src/main/store/config-store', () => ({ loadConfig: () => ({ sync_dir: library.dir }) }))
vi.mock('../src/main/services/pdf-reader', () => ({ readPdf: vi.fn(async () => 'PDF 的文字层中包含了可在本机提取的完整描述。') }))

it('reads attached text and serves only note-owned media with byte-range support', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-preview-'))
  library.dir = dir
  try {
    const page = join(dir, '素材.html')
    const audio = join(dir, '课件.mp3')
    writeFileSync(page, '<article>代码按原文查看</article>')
    writeFileSync(audio, '0123456789')
    const [html, mp3] = saveFiles(dir, [page, audio])
    const id = saveNote(dir, '', 'Inbox', [], 'done', undefined, [html, mp3])
    const other = saveNote(dir, '另一条笔记')

    expect(await readAttachmentPreview(id, html.storedName)).toEqual({
      kind: 'text', text: '<article>代码按原文查看</article>', truncated: false
    })
    expect(await readAttachmentPreview(other, html.storedName)).toMatchObject({ kind: 'unavailable' })
    const request = new Request(attachmentMediaUrl(id, mp3.storedName), { headers: { Range: 'bytes=2-4' } })
    const range = await serveAttachmentMedia(id, mp3.storedName, request)
    expect(range.status).toBe(206)
    expect(range.headers.get('Content-Range')).toBe('bytes 2-4/10')
    expect(range.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(await range.text()).toBe('234')
    expect((await serveAttachmentMedia(other, mp3.storedName, request)).status).toBe(404)
    expect((await serveAttachmentMedia(id, html.storedName, request)).status).toBe(404)
  } finally {
    library.dir = ''
    rmSync(dir, { recursive: true, force: true })
  }
})

it('stores webpage body and source in Markdown while the note stores only attachment metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-clip-material-'))
  try {
    const content = '这是一句可以作为摘要的材料，介绍全文的主要研究方向。\n\n' + '详细原文'.repeat(150) + '\n\nARTICLE_TAIL_MARKER_NOT_A_SENTENCE'
    const markdown = `# 研究原文\n\n[来源网页](https://example.org/a)\n\n${content}`
    const file = saveWebClip(dir, { title: '研究原文', sourceUrl: 'https://example.org/a', markdown, content })
    const id = saveNote(dir, '', 'Inbox', [], 'pending', undefined, [file])
    const note = loadNote(id, dir)!
    expect(note.raw_content).toBe('')
    expect(note.attachments).toEqual([file])
    expect(file.summary?.length).toBeLessThanOrEqual(ATTACHMENT_SUMMARY_LIMIT)
    expect(readFileSync(attachmentPath(dir, file.storedName)!, 'utf8')).toBe(markdown)
    expect(noteOrganizationText(note, 220)).toContain('主要研究方向')
    expect(noteOrganizationText(note)).not.toContain('ARTICLE_TAIL_MARKER')
    expect(readFileSync(join(dir, 'notes', `${id}.json`), 'utf8')).not.toContain('ARTICLE_TAIL_MARKER')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('keeps plain-text and PDF summaries local and accepts an editable summary for other formats', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flownote-file-material-'))
  try {
    const text = join(dir, '我的资料.txt'), pdf = join(dir, '案例.pdf'), audio = join(dir, '会议.ogg')
    writeFileSync(text, '```sh\nHIDDEN_CODE_MARKER\nExtra text inside the block.\n```\n这里描述了图书馆本月开放时间安排以及借阅规则。')
    writeFileSync(pdf, 'PDF fixture')
    writeFileSync(audio, 'AUDIO_ORIGINAL')
    const files = await Promise.all(saveFiles(dir, [text, pdf, audio]).map(file => summarizeSelectedFile(dir, file)))
    expect(files[0].summary).toContain('图书馆')
    expect(files[0].summary).not.toContain('HIDDEN_CODE_MARKER')
    expect(files[1].summary).toContain('PDF 的文字层')
    expect(files[2].summary).toBeUndefined()
    const id = saveNote(dir, '我的观察', 'Inbox', [], 'processing', undefined, files)
    const before = loadNote(id, dir)!
    expect(noteOrganizationText(before)).not.toContain('会议.ogg')
    const edited = patchNote(dir, id, before.revision!, { attachments: [...files.slice(0, 2), { ...files[2], summary: '补写的会议摘要' }] })
    expect(noteOrganizationText(edited)).toContain('会议.ogg：补写的会议摘要')
    expect(noteOrganizationText(edited)).not.toContain('AUDIO_ORIGINAL')
    expect(applyAiPatch(dir, id, hashNoteInput(noteOrganizationText(before)), { title: '旧结果' })).toBe('stale')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('recognizes the old inline clip format without editing what the user saved', () => {
  const raw = '我自己的想法\n\n## 网页标题\n\n[来源网页](<https://example.org/a>)\n\n文章介绍了经过长时间维护的读书记录方法和适用边界。\n' + '原文'.repeat(500) + 'LEGACY_ARTICLE_TAIL'
  const dir = mkdtempSync(join(tmpdir(), 'flownote-legacy-clip-'))
  try {
    const id = saveNote(dir, raw)
    const note = loadNote(id, dir)!
    expect(notePrimaryText(note)).toBe('我自己的想法')
    expect(noteOrganizationText(note)).toContain('网页标题：文章介绍')
    expect(noteOrganizationText(note)).not.toContain('LEGACY_ARTICLE_TAIL')
    expect(loadNote(id, dir)?.raw_content).toBe(raw)
    expect(extractAttachmentSummary('## 标题\n![](https://example.org/tracker.png)')).toBe('')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
