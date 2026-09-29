import { _electron as electron } from 'playwright-core'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { resolve,join } from 'node:path'
import { mkdirSync,writeFileSync,readFileSync,readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const root=resolve('.')
const run=join(root,'.e2e','run-'+Date.now())
mkdirSync(join(run,'library','notes'),{recursive:true})
const dir=join(run,'library'),configPath=join(run,'config.json')
const config={sync_dir:dir,api_provider:'DeepSeek',api_key:'',categories:['学习','个人'],theme:'paper',ai_comments:true,ai_auto_dream:false}
writeFileSync(configPath,JSON.stringify(config))
for(const n of [
 {id:'1778215309498000',created_at:'2026-05-08',raw_content:'历史长编号'},
 {id:'1778215309498001',created_at:'2026-09-23',created_at_ms:1790137215327,raw_content:'此前被埋到列表后面的笔记'}
])writeFileSync(join(dir,'notes',n.id+'.json'),JSON.stringify({...n,category:'学习',title:'',tags:[],ai_status:'done',retry_count:0}))
const server=await createServer({configFile:false,root:resolve('src/renderer'),plugins:[react()],
 resolve:{alias:{'@shared':resolve('src/shared'),'@renderer':resolve('src/renderer')}},
 server:{host:'127.0.0.1',port:5189,strictPort:true}})
await server.listen()
let app
const errors=[]
async function poll(check){
 const end=Date.now()+40000
 while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,200))}
 throw new Error('Timed out waiting for completed application state')
}
async function launch(){
 const instance=await electron.launch({executablePath:require('electron'),args:[root,'--remote-debugging-port=9228'],env:{...process.env,FLOWNOTE_LOCAL_DATA:join(run,'local'),FLOWNOTE_CONFIG_PATH:configPath,ELECTRON_RENDERER_URL:'http://127.0.0.1:5189'}})
 const page=await instance.firstWindow()
 await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}))
 page.on('pageerror',e=>errors.push(String(e)))
 await page.getByRole('button',{name:'记录与笔记',exact:true}).waitFor()
 return {instance,page}
}
async function mockModel(instance){
 await instance.evaluate(()=>{
  globalThis.fetch=async(_url,init)=>{
   const b=JSON.parse(init.body)
   const instruction=b.messages?.[0]?.content||''
   let data
   if(instruction.includes('笔记分类') || instruction.includes('分类助手') || instruction.includes('category')){
    data={title:'测试普通观点',summary:'一般观点也值得评价',category:'学习',tags:['验证']}
   }else if(instruction.includes('请整理用户提供的资料')){
    return new Response(JSON.stringify({choices:[{message:{content:'# 学习\n\n## 测试普通观点\n\n新记录已归入 Wiki。'}}]}),{status:200})
   }else if(instruction.includes('定位需修正')){
    data={before:[]}
   }else if(instruction.includes('Dream 像睡眠')){
    return new Response(JSON.stringify({choices:[{message:{content:'这段时期的记录显示，你在尝试区分直接经验和一般判断。重新组织这些信息时，值得保留经验本身，同时检查结论的适用条件。'}}],usage:{prompt_tokens:50,completion_tokens:60}}),{status:200})
   }else if(instruction.includes('选择最多三个')){
    data={body:'应区分暂定判断和已经确认的事实。',queries:[],candidates:[]}
   }else if(instruction.includes('基于材料筛选')){
    data={body:'这次记录提示了一个值得思考的问题：如何检验自己的日常判断？先提出可检验的条件，再寻找反例。',recommendations:[]}
   }else if(instruction.includes('直接回答追问')){
    data={body:'可以先看这个判断适用于哪些条件，再用资料核对，而不是直接把经验泛化。',queries:[]}
   }else{
    data={body:'这条日常判断值得补充适用条件。先区分个人经验与一般规律，再判断是否有足够证据。',skip:false,fact_check:null}
   }
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}],usage:{prompt_tokens:50,completion_tokens:60}}),{status:200})
  }
 })
}
try{
 let start=await launch();app=start.instance;let page=start.page
 console.log('Loaded development window; checking save and AI flow')
 // Real UI → real IPC → real disk, initially with no API key.
 await page.locator('.note-editor').waitFor()
 await page.locator('.library-heading').getByRole('button',{name:'新建笔记',exact:true}).click()
 const input=page.locator('textarea.quick-input')
 await input.fill('一般观点端到端测试：记录应该立即可见。')
 await input.press('Alt+Enter')
 await page.getByText('笔记已保存',{exact:true}).waitFor()
 const saved=JSON.parse(readFileSync(join(dir,'notes',readdirSync(join(dir,'notes')).filter(x=>!x.startsWith('177821')).at(0)),'utf8'))
 assert.equal(saved.raw_content,'一般观点端到端测试：记录应该立即可见。')
 assert.equal(saved.id.length,13)
 await page.getByRole('button',{name:'有更新',exact:true}).click()
 assert.match(await page.locator('.workspace-note').first().textContent(),/一般观点端到端测试/)
 await page.getByRole('searchbox',{name:'搜索笔记'}).fill('不存在的筛选')
 await page.getByRole('button',{name:'查看笔记',exact:true}).click()
 await page.locator('#note-'+saved.id).waitFor()
 await mockModel(app)
 await page.evaluate(async()=>{const cfg=await window.api.config.load();await window.api.config.save({...cfg,api_key:'test-fixture'});await window.api.classifier.poke()})
 await poll(()=>page.evaluate(async(id)=>(await window.api.notes.loadAll()).find(n=>n.id===id)?.ai_status==='done',saved.id))
 await poll(()=>page.evaluate(async(id)=>(await window.api.thinking.view({kind:'note',id})).insight?.body.length>0,saved.id))
 await page.getByRole('button',{name:'AI 思考',exact:true}).click()
 const panel=page.getByRole('region',{name:'AI 评论与讨论'})
 await panel.getByRole('tab',{name:'继续讨论',exact:true}).click()
 await panel.getByRole('textbox',{name:'继续追问'}).fill('如何核对？')
 await panel.getByRole('button',{name:'发送',exact:true}).click()
 await poll(()=>page.evaluate(async(id)=>(await window.api.thinking.view({kind:'note',id})).thread.messages.length===2,saved.id))
 // Seed a reviewed proposal to test the confirmation boundary without presenting fabricated evidence as real.
 const correction={schema_version:1,id:'e2e-proposal',note_id:saved.id,input_hash:createHash('sha256').update(saved.raw_content.trim()).digest('hex'),created_at:Date.now(),
  claim:saved.raw_content,replacement:'测试用已接纳修正：观点须说明适用条件。',reason:'这是自动化测试的已核查样例，并非真实外部知识。',
  sources:[{id:'fixture',url:'https://example.org/e2e',title:'测试来源（非真实证据）',fetched_at:Date.now(),kind:'secondary',text:'测试专用的来源正文，只用于验证点击接纳后的数据流程。'}],status:'pending'}
 mkdirSync(join(dir,'thinking','corrections'),{recursive:true})
 writeFileSync(join(dir,'thinking','corrections',correction.id+'.json'),JSON.stringify(correction))
 await page.reload()
 await page.getByRole('button',{name:'AI 思考',exact:true}).click()
 await page.getByRole('button',{name:'接纳并融入 Wiki'}).click()
 await poll(()=>page.evaluate(async(id)=>(await window.api.thinking.view({kind:'note',id})).corrections.some(c=>c.status==='applied'),saved.id))
 const applied=JSON.parse(readFileSync(join(dir,'thinking','corrections',correction.id+'.json'),'utf8'))
 assert.match(readFileSync(join(dir,'wikis',applied.wiki_file),'utf8'),/测试用已接纳修正/)
 await page.screenshot({path:join(run,'notes.png'),fullPage:true})
 await page.getByRole('button',{name:'关闭思考面板'}).click()
 await page.getByRole('button',{name:'Dream',exact:true}).click()
 await page.getByRole('button',{name:'开始 Dream',exact:true}).click()
 await poll(()=>page.evaluate(async()=>(await window.api.thinking.reports()).length>0))
 await page.getByRole('region',{name:'Dream 分析与讨论'}).waitFor()
 await page.screenshot({path:join(run,'dream.png'),fullPage:true})
 await app.close();app=undefined
 // Restart with no paid provider and verify the saved note, correction and conversation.
 writeFileSync(configPath,JSON.stringify({...config,api_key:''}))
 start=await launch();app=start.instance;page=start.page
 await page.locator('#note-'+saved.id).waitFor()
 const view=await page.evaluate(id=>window.api.thinking.view({kind:'note',id}),saved.id)
 assert.equal(view.thread.messages.length,2)
 assert.equal(view.corrections[0].status,'applied')
 assert.equal(await page.getByRole('button',{name:/我的目标|我的成果|主题知识库/}).count(),0)
 // Mixed tag + text search runs in the real renderer against saved notes.
 await page.getByRole('searchbox',{name:'搜索笔记'}).fill('#验证 一般观点')
 await page.locator('#note-'+saved.id).waitFor()
 assert.equal(await page.locator('.workspace-note').count(),1)
 await page.getByRole('searchbox',{name:'搜索笔记'}).fill('#不存在 一般观点')
 await poll(async()=>await page.locator('.workspace-note').count()===0)
 await page.getByRole('searchbox',{name:'搜索笔记'}).fill('')
 await page.locator('#note-'+saved.id).waitFor()
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({ok:true,run,note:saved.id,checks:['save visible offline','legacy IDs','clear filter and locate','classification','comment','follow-up','accept updates Wiki','Dream','restart persistence','no renderer errors']}))
 if(process.env.FLOWNOTE_E2E_HOLD==='1'){
  console.log('Holding Electron CDP at 9228 for browser verification')
  await new Promise(resolve=>setTimeout(resolve,55000))
 }
}finally{
 if(app)await app.close()
 await server.close()
}

