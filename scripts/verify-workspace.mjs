import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const run = resolve('.e2e/workspace-' + Date.now())
const library = join(run, 'library'), configPath = join(run, 'config.json')
mkdirSync(join(library, 'notes'), { recursive: true })
writeFileSync(configPath, JSON.stringify({sync_dir:library,api_provider:'DeepSeek',api_key:'',categories:['个人','学习'],theme:'paper',ai_comments:false,ai_auto_dream:false}))
const body = '## 让日常的记录，成为更清楚的思考\n\n' + ('骑车经过河边的时候，我开始思考：一项习惯的价值，是否只能用效率来衡量？有些事情并不会带来更多产出，却能帮助我留意生活里的变化。\n\n').repeat(12) + '\n## 阅读与验证\n\nA useful workspace gives the text enough room, while keeping the surrounding context within reach.\n\n```typescript\n' + 'const explanation = "' + 'a long line '.repeat(30) + '"\n```\n\n| 条件 | 理解 | 下一步 |\n|---|---|---|\n| 长期坚持 | 观察变化 | 保留记录 |\n'
const id = String(Date.now())
for (let i=0;i<85;i++) {
 const noteId=String(Number(id)-i*86400000)
 writeFileSync(join(library,'notes',noteId+'.json'),JSON.stringify({id:noteId,created_at:new Date(Number(noteId)).toISOString().slice(0,10),created_at_ms:Number(noteId),raw_content:i?`第 ${i} 条记录：为阅读、写作和新的想法留出空间。`:body,title:i?['周末的阅读清单','关于通勤的一点观察','记录与记忆之间','练习保持好奇'][i%4]:'慢下来之后，才能看清的事情',category:'个人',tags:['自行车','思考'],ai_status:'done',retry_count:0,revision:1}))
}
const app=await electron.launch({executablePath:require('electron'),args:[resolve('.')],env:{...process.env,FLOWNOTE_CONFIG_PATH:configPath,FLOWNOTE_API_KEY:''}})
const errors=[]
try {
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(String(e)))
 await page.locator('.note-detail-content').waitFor()
 const bounds=async(width,height)=>{await app.evaluate(({BrowserWindow},b)=>BrowserWindow.getAllWindows()[0].setBounds(b),{width,height});await page.waitForTimeout(350)}
 await bounds(1440,900)
 await page.screenshot({path:join(run,'workspace-1440.png')})
 assert.equal(await page.locator('.note-editor').isVisible(),true)
 const originalWidth=(await page.locator('.workspace-reader').boundingBox()).width
 assert(originalWidth>=600)
 const splitter=page.getByRole('separator',{name:'笔记列表宽度'})
 await splitter.focus();await page.keyboard.press('ArrowRight')
 assert.equal(await splitter.getAttribute('aria-valuenow'),'296')
 await page.keyboard.press('Home')
 // Background updates retain the browsing snapshot, page and scroll.
 await page.getByRole('button',{name:'下一页',exact:true}).click()
 await page.locator('.workspace-note-list').evaluate(el=>el.scrollTop=230)
 const page2=await page.locator('.workspace-note').first().getAttribute('id')
 await page.evaluate(()=>window.api.notes.createRecord('后台新增的测试笔记'))
 await page.waitForTimeout(700)
 assert.equal(await page.getByRole('spinbutton',{name:'页码',exact:true}).inputValue(),'2')
 assert.equal(await page.locator('.workspace-note').first().getAttribute('id'),page2)
 assert(Math.abs(await page.locator('.workspace-note-list').evaluate(el=>el.scrollTop)-230)<1)
 await page.getByRole('button',{name:'定位到当前',exact:true}).click()
 assert.equal(await page.getByRole('spinbutton',{name:'页码',exact:true}).inputValue(),'1')
 // Open and sample the actual browser animation at defined times.
 await page.getByRole('button',{name:'AI 思考',exact:true}).click()
 const count=await page.evaluate(async()=>(await window.api.thinking.jobs()).length)
 await page.evaluate(()=>{const p=document.querySelector('.workspace-ai');for(const a of p.getAnimations()){a.pause();a.currentTime=0}})
 for(const t of [0,80,160,240]){
   await page.evaluate(t=>{for(const a of document.querySelector('.workspace-ai').getAnimations())a.currentTime=t},t)
   assert.equal(await page.locator('.notes-workspace').evaluate(el=>el.scrollLeft),0)
   await page.screenshot({path:join(run,'motion-'+t+'.png')})
 }
 await page.evaluate(()=>{for(const a of document.querySelector('.workspace-ai').getAnimations())a.finish()})
 await page.waitForTimeout(300)
 assert.equal(await page.locator('.workspace-library').isVisible(),false)
 assert((await page.locator('.workspace-reader').boundingBox()).width>=600)
 await page.getByRole('tab',{name:'继续讨论',exact:true}).click()
 await page.getByRole('textbox',{name:'继续追问'}).fill('这条观察还有哪些解释？')
 await page.getByRole('button',{name:'关闭思考面板'}).click()
 await page.waitForTimeout(260)
 await page.getByRole('button',{name:'AI 思考',exact:true}).click()
 assert.equal(await page.getByRole('textbox',{name:'继续追问'}).inputValue(),'这条观察还有哪些解释？')
 await page.getByRole('button',{name:'关闭思考面板'}).click();await page.waitForTimeout(260)
 // Draft isolation, no implicit disk save.
 await page.getByRole('button',{name:'编辑笔记',exact:true}).click()
 await page.getByRole('textbox',{name:'笔记正文',exact:true}).fill('尚未正式保存的草稿')
 await page.locator('.workspace-note').nth(1).click()
 await page.locator('#note-'+id).click()
 assert.equal(await page.getByRole('textbox',{name:'笔记正文',exact:true}).inputValue(),'尚未正式保存的草稿')
 assert.equal(await page.evaluate(async id=>(await window.api.notes.loadAll()).find(n=>n.id===id).raw_content,id),body)
 await page.getByRole('button',{name:'丢弃草稿'}).click()
 // Scroll survives focus mode; resizing affects usable CSS pixels.
 await page.locator('.note-editor').evaluate(el=>el.scrollTop=350)
 await page.getByRole('button',{name:'专注阅读',exact:true}).click();await page.waitForTimeout(300)
 assert.equal(await page.locator('.app-navigation').isVisible(),false)
 assert(Math.abs(await page.locator('.note-editor').evaluate(el=>el.scrollTop)-350)<2)
 await page.screenshot({path:join(run,'focus.png')})
 await page.getByRole('button',{name:'退出专注',exact:true}).click();await page.waitForTimeout(300)
 for(const [w,h] of [[800,500],[1280,800],[1920,1080]]){
   await bounds(w,h)
   await page.screenshot({path:join(run,`workspace-${w}.png`)})
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   await page.getByRole('button',{name:'AI 思考',exact:true}).click()
   const frames=await page.evaluate(()=>new Promise(resolve=>{const samples=[];const start=performance.now();const sample=()=>{const shell=document.querySelector('.notes-workspace');const reader=document.querySelector('.workspace-reader');samples.push({scroll:shell.scrollLeft,x:reader.getBoundingClientRect().x});if(performance.now()-start<300)requestAnimationFrame(sample);else resolve(samples)};requestAnimationFrame(sample)}))
   assert(frames.every(frame=>frame.scroll===0),'workspace scrolled during transition')
   assert(Math.max(...frames.map(f=>f.x))-Math.min(...frames.map(f=>f.x))<1,'reader bounced during transition')
   writeFileSync(join(run,'frames-'+w+'.json'),JSON.stringify(frames,null,2))
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   if(w===800)assert.equal(await page.locator('.workspace-reader').getAttribute('aria-hidden'),'true')
   else assert((await page.locator('.workspace-reader').boundingBox()).width>=600)
   if(w===1920)assert.equal(await page.locator('.workspace-library').isVisible(),true)
   await page.screenshot({path:join(run,`workspace-ai-${w}.png`)})
   await page.getByRole('button',{name:'关闭思考面板'}).click();await page.waitForTimeout(260)
 }
 await bounds(1440,900)
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.getByRole('button',{name:'AI 思考',exact:true}).click()
 assert.equal(await page.evaluate(()=>document.querySelector('.workspace-ai').getAnimations().every(a=>a.effect.getKeyframes().every(k=>!k.transform||k.transform==='none'||new DOMMatrix(k.transform).isIdentity))),true)
 await page.getByRole('button',{name:'关闭思考面板'}).click();await page.waitForTimeout(100)
 await page.emulateMedia({reducedMotion:'no-preference'})
 // Rapid reversible transitions must not strand an inert visible pane.
 await page.evaluate(async()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='AI 思考');for(let i=0;i<6;i++){button.click();await new Promise(r=>setTimeout(r,35))}})
 await page.waitForTimeout(300)
 assert.equal(await page.locator('.workspace-ai').isVisible(),false)
 assert.equal(await page.evaluate(async()=>(await window.api.thinking.jobs()).length),count)
 await page.reload();await page.locator('.note-editor').waitFor()
 assert(Math.abs(await page.locator('.note-editor').evaluate(el=>el.scrollTop)-350)<2)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({ok:true,run,checks:['responsive layouts','splitter keyboard','draft isolation','focus scroll','AI question persistence','motion frames','reduced motion','rapid reversal','no implicit AI requests','reload']}))
}finally{await app.close()}
