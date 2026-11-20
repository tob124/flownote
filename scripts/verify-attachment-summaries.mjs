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
writeFileSync(audio, 'UNREAD_AUDIO_BYTES')
const text = join(run, 'borrowing.txt')
writeFileSync(text, '图书馆借阅规则在每年开学时更新，读者可以在线查询。')
const pdf = join(run, 'borrowing.pdf')
const stream = 'BT /F1 14 Tf 20 80 Td (Public library membership requirements are explained in this guide.) Tj 0 -20 Td (Members can also check scheduled opening hours and renew their loans.) Tj ET'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
]
const offsets = []
let pdfBody = '%PDF-1.4\n'
for (const [index, object] of objects.entries()) {
  offsets.push(pdfBody.length)
  pdfBody += `${index+1} 0 obj\n${object}\nendobj\n`
}
const xref = pdfBody.length
pdfBody += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(offset => String(offset).padStart(10,'0') + ' 00000 n \n').join('')
pdfBody += `trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF\n`
writeFileSync(pdf, pdfBody)
const intro = '这份网页资料介绍了图书馆的借阅流程以及相关的适用条件。'
const body = `${intro}\n\n${'详细信息'.repeat(160)}\n\nWEB_ARTICLE_FULL_TEXT_ONLY\n\n![说明图](https://example.org/private-image.png)`
const existingBody = '这才是我自己的笔记。'

const installed = process.env.FLOWNOTE_TEST_EXECUTABLE
const app = await electron.launch({ executablePath: installed || require('electron'), args: installed ? [] : [resolve('.')], env: { ...process.env, FLOWNOTE_CONFIG_PATH: configPath, FLOWNOTE_LOCAL_DATA: join(run, 'local'), FLOWNOTE_API_KEY: '' } })
const errors = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(String(error)))
  await app.evaluate(({ BrowserWindow, dialog }, fixture) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1200, 760)
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: fixture.files })
    globalThis.calls = []
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname
      if (path === '/v1/tools/fetch') return Response.json({ title: '示例剪藏', content: fixture.body })
      if (path !== '/v1/chat/completions') throw new Error(`Unexpected HTTP path in fixture: ${path}`)
      const request = JSON.parse(init.body)
      const isWiki = request.messages[0].content.includes('请整理用户提供的资料')
      globalThis.calls.push({ isWiki, text: request.messages[1].content })
      return Response.json({ choices: [{ message: { content: isWiki ? '# 学习\n\n## 测试短笔记\n\n整理并保留自己的记录。' : JSON.stringify({ title: '测试短笔记', category: '学习', tags: ['图书馆'], summary: '测试短笔记' }) } }] })
    }
  }, { files: [audio, text, pdf], body })

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
  assert.equal(saved.attachments.length, 4)
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
  await dialog.getByRole('button', { name: '关闭网页附件' }).click()
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
  console.log(JSON.stringify({ ok: true, run, checked: ['Markdown attachment and viewer', 'draft and saved attachment summaries', 'classification and Wiki prompts exclude full content', 'attachment-only note'] }))
} finally {
  await app.close()
}
