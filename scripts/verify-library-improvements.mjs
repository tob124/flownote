import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
mkdirSync(resolve('.e2e'), {recursive:true})
const run = mkdtempSync(resolve('.e2e/library-improvements-'))
const library = join(run, 'library')
const config = join(run, 'config.json')
for (const sub of ['notes', 'wikis/sealed', 'thinking/insights']) mkdirSync(join(library, sub), {recursive:true})
writeFileSync(config, JSON.stringify({sync_dir:library, api_key:'', categories:['学习'], ai_comments:false, ai_auto_dream:false}))
const id = '1780000000000', shortId = '1780000000001', fallbackId = '1780000000002'
const note = {id, title:'长篇资料', raw_content:'原始正文。'.repeat(80), summary:'模型整理出的摘要。', category:'学习', created_at:'2026-05-01', ai_status:'done', retry_count:0, tags:[], revision:1}
const short = {...note, id:shortId, title:'短篇资料', raw_content:'短篇的原始正文。'}
const fallback = {...note, id:fallbackId, title:'无摘要资料', summary:'', raw_content:'仍可阅读这段原文。'.repeat(80)}
for (const current of [note, short, fallback]) writeFileSync(join(library,'notes',current.id+'.json'), JSON.stringify(current))
writeFileSync(join(library,'wikis','学习_2026_05.md'), '# 当前 Wiki\n\n'+'前文内容。\n\n'.repeat(48)+'## 定位这一节\n\n可搜索的独特短语。')
writeFileSync(join(library,'wikis','sealed','归档_2026_05_sealed_2026-05-31T08-00-00.md'), '# 归档 Wiki\n\n历史搜索词。')
const insightFile = join(library,'thinking','insights','note_'+id+'.json')
const recommendation = {id:'0',title:'可固定的推荐',original_title:'Original',author:'示例作者',translation:'',question:'',idea:'阅读建议',relevance:'',limits:'',reading:'',attribution:'author',source_ids:['old'],identity_source_ids:[],evidence:'unverified'}
const evidence = {id:'old',title:'原始来源',url:'https://example.org/old',fetched_at:1,text:'来源正文',kind:'primary'}
const insight = {schema_version:1,id:'test-insight',owner:{kind:'note',id},input_hash:'fixture',created_at:1,body:'回应',skipped:false,recommendations:[recommendation],sources:[evidence],usage:{input:0,output:0,searches:0}}
writeFileSync(insightFile, JSON.stringify(insight))

async function launch() {
  const app = await electron.launch({executablePath:require('electron'),args:[resolve('.')],env:{...process.env,FLOWNOTE_CONFIG_PATH:config,FLOWNOTE_LOCAL_DATA:join(run,'local'),FLOWNOTE_API_KEY:''}})
  const page = await app.firstWindow()
  page.setDefaultTimeout(12000)
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(1440,850))
  return { app, page }
}
let {app,page} = await launch()
const errors = []
page.on('pageerror', error => errors.push(String(error)))
try {
  const row = id => page.locator('#note-'+id)
  await row(id).waitFor()
  assert.match(await row(id).textContent(), /AI 摘要.*模型整理出的摘要/)
  assert.match(await row(shortId).textContent(), /短篇的原始正文/)
  assert.doesNotMatch(await row(shortId).textContent(), /AI 摘要/)
  assert.match(await row(fallbackId).textContent(), /仍可阅读这段原文/)
  for (const theme of ['paper','dark','draft','solar']) {
    const { summary, body, contrast } = await page.evaluate(theme => {
      document.documentElement.setAttribute('data-theme', theme)
      const preview = getComputedStyle(document.querySelector('.workspace-ai-preview'))
      const body = getComputedStyle(document.querySelector('.workspace-note p:not(.workspace-ai-preview)')).color
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')
      const luminance = value => {
        context.fillStyle = value
        context.fillRect(0,0,1,1)
        const [r,g,b] = Array.from(context.getImageData(0,0,1,1).data, channel => {
          const srgb = channel / 255
          return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055)**2.4
        })
        return 0.2126*r + 0.7152*g + 0.0722*b
      }
      const ink = luminance(preview.color)
      const contrast = Math.min(...['--bg-primary','--bg-card','--bg-hover'].map(token => {
        const background = luminance(preview.getPropertyValue(token).trim())
        return (Math.max(ink, background)+0.05)/(Math.min(ink, background)+0.05)
      }))
      return { summary:preview.color, body, contrast }
    },theme)
    assert.notEqual(summary,body)
    assert(contrast >= 4.5, `${theme} summary contrast was ${contrast}`)
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme','paper'))

  await page.getByRole('button',{name:'多选',exact:true}).click()
  await page.getByRole('checkbox',{name:note.title,exact:true}).press('Space')
  await page.getByRole('checkbox',{name:short.title,exact:true}).click()
  await page.getByText('已选 2 篇',{exact:true}).waitFor()
  await page.getByRole('button',{name:'批量收藏'}).click()
  await page.getByText('已收藏 2 篇。',{exact:true}).waitFor()
  const latest = await page.evaluate(() => window.api.notes.loadAll())
  assert(latest.find(n=>n.id===id).favorite && latest.find(n=>n.id===shortId).favorite)

  await page.getByRole('checkbox',{name:note.title,exact:true}).click()
  await page.getByRole('searchbox',{name:'搜索笔记'}).fill('短篇')
  await page.getByText('已选 0 篇',{exact:true}).waitFor()
  await page.getByRole('checkbox',{name:short.title,exact:true}).click()
  await page.getByRole('button',{name:'取消收藏',exact:true}).click()
  await page.getByText('已取消收藏 1 篇。',{exact:true}).waitFor()
  await page.getByRole('searchbox',{name:'搜索笔记'}).fill('')
  await page.getByRole('checkbox',{name:short.title,exact:true}).click()
  await page.getByRole('button',{name:'移至回收站',exact:true}).click()
  await page.getByRole('button',{name:'取消',exact:true}).click()
  assert.equal((await page.evaluate(() => window.api.notes.trashList())).length,0)
  await page.getByRole('button',{name:'移至回收站',exact:true}).click()
  await page.getByRole('button',{name:'确认批量移除'}).click()
  await page.getByText('已移入回收站 1 篇。',{exact:true}).waitFor()
  assert.equal((await page.evaluate(() => window.api.notes.trashList()))[0].id,shortId)
  assert(await page.evaluate(id => window.api.notes.restore(id),shortId))
  const partial = await page.evaluate(async ({id,shortId}) => {
    const notes = await window.api.notes.loadAll()
    return window.api.notes.bulk('favorite', [
      {id, revision:1}, {id:shortId,revision:notes.find(n=>n.id===shortId).revision}
    ])
  },{id,shortId})
  assert.deepEqual(partial.completed,[shortId])
  assert.match(partial.failed[0].reason,/已有更新/)
  await page.getByRole('button',{name:'退出多选'}).click()

  await row(id).click()
  await page.getByRole('button',{name:'编辑笔记',exact:true}).click()
  const body = page.getByRole('textbox',{name:'笔记正文',exact:true})
  await body.fill('中文重点\n列表项')
  await body.evaluate(target => target.setSelectionRange(0,4))
  await page.getByRole('button',{name:'加粗',exact:true}).click()
  assert.equal(await body.inputValue(),'**中文重点**\n列表项')
  await body.press('Control+s')
  await page.locator('.note-detail-content strong').getByText('中文重点').waitFor()
  await page.getByRole('button',{name:'AI 思考',exact:true}).click()
  await page.getByRole('tab',{name:/延伸阅读/}).click()
  await page.getByRole('button',{name:'固定推荐',exact:true}).click()
  await page.getByRole('button',{name:'取消固定',exact:true}).waitFor()
  await app.close()
  writeFileSync(insightFile, JSON.stringify({...insight,id:'different-result',recommendations:[{...recommendation,title:'新一轮推荐',original_title:'Other',source_ids:[]}], sources:[]}))
  ;({app,page} = await launch())
  page.on('pageerror', error => errors.push(String(error)))
  await row(id).click()
  await page.getByRole('button',{name:'AI 思考',exact:true}).click()
  await page.getByRole('tab',{name:/延伸阅读/}).click()
  const pin = page.locator('.thought-recommendation[data-pinned=true]')
  await pin.getByText('可固定的推荐',{exact:false}).first().waitFor()
  await pin.getByText('阅读建议与观点依据',{exact:true}).click()
  await pin.getByText(/研究过程/).click()
  assert.equal(await pin.getByRole('link',{name:'原始来源'}).getAttribute('href'), 'https://example.org/old')
  await pin.getByRole('button',{name:'取消固定',exact:true}).click()
  await page.getByText('新一轮推荐',{exact:false}).first().waitFor()
  await pin.waitFor({state:'detached'})

  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(800,760))
  await page.getByRole('button',{name:'Wiki',exact:true}).click()
  await page.locator('.wiki-layout[data-narrow=true]').waitFor()
  const files = page.getByRole('button',{name:'Wiki 文件',exact:true})
  await files.press('Enter')
  const book = page.getByRole('navigation',{name:'Wiki 文件',exact:true}).getByRole('button',{name:'学习',exact:true})
  await book.press('Enter')
  await page.getByRole('heading',{name:'当前 Wiki',exact:true}).waitFor()
  assert.equal(await files.getAttribute('aria-expanded'),'false')
  assert((await page.locator('.wiki-document').boundingBox()).width >= 620)
  await page.screenshot({path:join(run,'wiki-800.png')})
  const outline = page.getByRole('button',{name:'大纲',exact:true})
  await outline.press('Enter')
  await page.getByRole('navigation',{name:'Wiki 大纲'}).getByRole('button',{name:'定位这一节',exact:true}).press('Enter')
  assert.equal(await outline.getAttribute('aria-expanded'),'false')
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox',{name:'Wiki 搜索词'}).fill('独特短语')
  await page.getByText('1 / 1',{exact:true}).waitFor()
  await page.keyboard.press('Escape')
  await files.press('Enter')
  await page.keyboard.press('Escape')
  assert.equal(await files.getAttribute('aria-expanded'),'false')
  await files.press('Enter')
  await page.getByRole('navigation',{name:'Wiki 文件',exact:true}).getByRole('button',{name:/归档/}).press('Enter')
  await page.getByRole('heading',{name:'归档 Wiki',exact:true}).waitFor()
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox',{name:'Wiki 搜索词'}).fill('历史搜索词')
  await page.getByText('1 / 1',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({ok:true,run,verified:['summary and fallback','bulk favorite and trash with recovery','Markdown formatting and save shortcut','pins and sources after refresh/restart','narrow Wiki keyboard and search']}))
} finally { await app.close() }
