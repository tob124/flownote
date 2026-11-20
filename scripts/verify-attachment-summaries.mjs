import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
mkdirSync(resolve('.e2e'), { recursive: true })
const run = mkdtempSync(resolve('.e2e/attachment-summary-'))
const library = join(run, 'library'), configPath = join(run, 'config.json')
mkdirSync(join(library, 'notes'), { recursive: true })
writeFileSync(configPath, JSON.stringify({ sync_dir: library, api_provider: 'DeepSeek', api_key: 'mock-only', categories: ['学习'], theme: 'paper', ai_comments: false, ai_auto_dream: false }))
const audio = join(run, '会议录音.wav')
const pcmBytes = 32000
const wave = Buffer.alloc(44 + pcmBytes)
wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8)
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22)
wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34)
wave.write('data', 36); wave.writeUInt32LE(pcmBytes, 40); wave.write('UNREAD_AUDIO_BYTES', 44)
writeFileSync(audio, wave)
const text = join(run, 'borrowing.txt')
writeFileSync(text, '图书馆借阅规则在每年开学时更新，读者可以在线查询。')
const image = join(run, '借阅图.png')
writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/t0AAAAASUVORK5CYII=', 'base64'))
const unsupported = join(run, '测试附件.zip')
writeFileSync(unsupported, Buffer.from([0x50,0x4b,0x05,0x06,...new Array(18).fill(0)]))
const video = process.env.FLOWNOTE_TEST_VIDEO
const pdf = join(run, 'borrowing.pdf')
const stream = 'BT /F1 14 Tf 20 80 Td (Public library membership requirements are explained in this guide.) Tj 0 -20 Td (Members can also check scheduled opening hours and renew their loans.) Tj ET'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'
]
const offsets = []
let pdfBody = '%PDF-1.4\n'
for (const [index, object] of objects.entries()) {
  offsets.push(pdfBody.length)
  pdfBody += `${index+1} 0 obj\n${object}\nendobj\n`
}
const xref = pdfBody.length
pdfBody += `xref\n0 ${offsets.length+1}\n0000000000 65535 f \n` + offsets.map(offset => String(offset).padStart(10,'0') + ' 00000 n \n').join('')
pdfBody += `trailer\n<< /Root 1 0 R /Size ${offsets.length+1} >>\nstartxref\n${xref}\n%%EOF\n`
writeFileSync(pdf, pdfBody)
const intro = '这份网页资料介绍了图书馆的借阅流程以及相关的适用条件。'
const body = `${intro}\n\n${'详细信息'.repeat(160)}\n\nWEB_ARTICLE_FULL_TEXT_ONLY\n\n![说明图](https://example.org/private-image.png)`
const existingBody = '这才是我自己的笔记。'

const installed = process.env.FLOWNOTE_TEST_EXECUTABLE
const app = await electron.launch({ executablePath: installed || require('electron'), args: installed ? [] : [resolve('.')], env: { ...process.env, FLOWNOTE_CONFIG_PATH: configPath, FLOWNOTE_LOCAL_DATA: join(run, 'local'), FLOWNOTE_API_KEY: '' } })
const errors = []
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', error => errors.push(String(error)))
  await app.evaluate(({ BrowserWindow, dialog, shell }, fixture) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1200, 760)
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: fixture.files })
    globalThis.calls = []
    globalThis.externalFiles = []
    shell.openPath = async path => { globalThis.externalFiles.push(path); return '' }
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname
      if (path === '/v1/tools/fetch') return Response.json({ title: '示例剪藏', content: fixture.body })
      if (path !== '/v1/chat/completions') throw new Error(`Unexpected HTTP path in fixture: ${path}`)
      const request = JSON.parse(init.body)
      const isWiki = request.messages[0].content.includes('请整理用户提供的资料')
      globalThis.calls.push({ isWiki, text: request.messages[1].content })
      return Response.json({ choices: [{ message: { content: isWiki ? '# 学习\n\n## 测试短笔记\n\n整理并保留自己的记录。' : JSON.stringify({ title: '测试短笔记', category: '学习', tags: ['图书馆'], summary: '测试短笔记' }) } }] })
    }
  }, { files: [audio, text, pdf, image, unsupported, ...(video ? [video] : [])], body })

  const editor = page.locator('.quick-input')
  await editor.waitFor()
  await editor.evaluate(node => node.focus())
  await page.keyboard.insertText(existingBody)
  await page.getByRole('button', { name: '输入工具' }).click()
  await page.getByRole('menuitem', { name: '剪藏网页' }).click()
  await page.getByRole('textbox', { name: '网页链接' }).fill('https://example.org/a')
  await page.getByRole('button', { name: '抓取网页' }).click()
  await page.getByText('网页已作为 Markdown 附件加入草稿。').waitFor()
  assert.equal(await editor.inputValue(), existingBody)
  assert.equal((await page.evaluate(() => window.api.notes.loadAll())).length, 0)

  await page.getByRole('button', { name: '添加附件', exact: true }).click()
  await page.getByRole('button', { name: '编辑附件摘要 会议录音.wav' }).click()
  await page.getByRole('textbox', { name: /附件摘要.*会议录音/ }).fill('会议讨论借阅证办理方式。')
  await page.getByRole('button', { name: '保存摘要', exact: true }).click()
  await editor.press('Alt+Enter')
  await page.getByText('笔记已保存', { exact: true }).waitFor()
  const findOnDisk = () => readdirSync(join(library, 'notes')).filter(file => /^\d+\.json$/.test(file)).map(file => JSON.parse(readFileSync(join(library, 'notes', file), 'utf8')))
  const saved = findOnDisk()[0]
  assert.equal(saved.raw_content, existingBody)
  assert.equal(saved.attachments.length, video ? 7 : 6)
  const clip = saved.attachments.find(file => file.ext === 'md')
  const recording = saved.attachments.find(file => file.ext === 'wav')
  assert.match(readFileSync(join(library, 'files', clip.storedName), 'utf8'), /WEB_ARTICLE_FULL_TEXT_ONLY/)
  assert(clip.summary.includes(intro))
  assert.equal(recording.summary, '会议讨论借阅证办理方式。')
  assert.match(saved.attachments.find(file => file.ext === 'txt').summary ?? '', /图书馆借阅规则/)
  assert.match(saved.attachments.find(file => file.ext === 'pdf').summary ?? '', /Public library membership/)
  assert(!JSON.stringify(saved).includes('WEB_ARTICLE_FULL_TEXT_ONLY'))

  await page.locator('.attachment-open').filter({ hasText: '示例剪藏.md' }).click()
  const dialog = page.getByRole('dialog', { name: '示例剪藏.md' })
  await dialog.getByText('WEB_ARTICLE_FULL_TEXT_ONLY', { exact: true }).waitFor()
  assert.equal(await dialog.locator('img').count(), 0)
  await page.screenshot({ path: join(run, 'web-clip-preview.png') })
  await dialog.getByRole('button', { name: '关闭附件预览' }).click()

  async function preview(name) {
    await page.locator('.attachment-open').filter({ hasText: name }).click()
    return page.getByRole('dialog', { name, exact: true })
  }
  const pdfPreview = await preview('borrowing.pdf')
  const first = pdfPreview.getByRole('img', { name: '第 1 页' })
  await first.waitFor()
  assert(await first.evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((channel, index) => index % 4 !== 3 && channel < 180)))
  await pdfPreview.getByRole('button', { name: '下一页', exact: true }).click()
  await pdfPreview.getByRole('img', { name: '第 2 页' }).waitFor()
  await page.screenshot({ path: join(run, 'pdf-preview.png') })
  await page.keyboard.press('Escape')
  await pdfPreview.waitFor({ state: 'detached' })

  const imagePreview = await preview('借阅图.png')
  await page.waitForFunction(() => document.querySelector('.attachment-preview img')?.naturalWidth > 0)
  await imagePreview.getByRole('button', { name: '关闭附件预览' }).click()
  const textPreview = await preview('borrowing.txt')
  await textPreview.getByText('图书馆借阅规则在每年开学时更新，读者可以在线查询。', { exact: true }).waitFor()
  await textPreview.getByRole('button', { name: '关闭附件预览' }).click()
  const audioPreview = await preview('会议录音.wav')
  await page.waitForFunction(() => document.querySelector('.attachment-preview audio')?.readyState >= 2)
  await audioPreview.locator('audio').evaluate(node => node.play())
  await page.waitForFunction(() => document.querySelector('.attachment-preview audio')?.currentTime > 0)
  await audioPreview.getByRole('button', { name: '关闭附件预览' }).click()
  if (video) {
    const name = video.split(/[\\/]/).at(-1)
    const videoPreview = await preview(name)
    await page.waitForFunction(() => document.querySelector('.attachment-preview video')?.videoWidth > 0)
    await videoPreview.locator('video').evaluate(node => { node.muted = true; return node.play() })
    await page.waitForFunction(() => document.querySelector('.attachment-preview video')?.currentTime > 0)
    await videoPreview.getByRole('button', { name: '关闭附件预览' }).click()
  }
  const fallback = await preview('测试附件.zip')
  await fallback.getByText('这种文件格式需要用系统应用打开。', { exact: true }).waitFor()
  assert.deepEqual(await app.evaluate(() => globalThis.externalFiles), [])
  await fallback.getByRole('button', { name: '用系统应用打开', exact: true }).click()
  assert.equal((await app.evaluate(() => globalThis.externalFiles)).length, 1)
  await fallback.getByRole('button', { name: '关闭附件预览' }).click()
  await page.getByRole('button', { name: '附件操作：会议录音.wav' }).click()
  await page.getByRole('menuitem', { name: '编辑摘要' }).click()
  await page.getByRole('textbox', { name: /附件摘要.*会议录音/ }).fill('已核对的录音摘要。')
  await page.getByRole('button', { name: '保存摘要', exact: true }).click()
  await page.getByText('已核对的录音摘要。', { exact: true }).waitFor()

  let calls = []
  for (let index = 0; index < 80; index++) {
    calls = await app.evaluate(() => globalThis.calls)
    if (calls.some(call => call.isWiki)) break
    await delay(200)
  }
  for (const flag of [false, true]) {
    const invocation = calls.find(call => call.isWiki === flag)
    assert(invocation?.text.includes(existingBody))
    assert(invocation?.text.includes(intro))
    assert(invocation?.text.includes('附件摘要，仅供参考'))
    assert(!invocation?.text.includes('WEB_ARTICLE_FULL_TEXT_ONLY'))
    assert(!invocation?.text.includes('UNREAD_AUDIO_BYTES'))
  }

  await page.locator('.library-heading').getByRole('button', { name: '新建笔记', exact: true }).click()
  await page.getByRole('button', { name: '输入工具' }).click()
  await page.getByRole('menuitem', { name: '剪藏网页' }).click()
  await page.getByRole('textbox', { name: '网页链接' }).fill('https://example.org/only')
  await page.getByRole('button', { name: '抓取网页' }).click()
  await page.getByText('网页已作为 Markdown 附件加入草稿。').waitFor()
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await page.getByText('笔记已保存', { exact: true }).waitFor()
  assert(findOnDisk().some(note => note.raw_content === '' && note.attachments?.[0]?.sourceUrl === 'https://example.org/only'))
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, run, checked: ['Markdown, text and image preview', 'PDF rendering and pagination', 'WAV playback', ...(video ? ['WebM playback'] : []), 'external-open fallback', 'draft and saved attachment summaries', 'classification and Wiki prompts exclude full content', 'attachment-only note'] }))
} finally {
  await app.close()
}
