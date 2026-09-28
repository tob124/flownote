import {_electron as electron} from 'playwright-core'
import {createRequire} from 'node:module'
import {homedir} from 'node:os'
import {join,resolve} from 'node:path'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
const require=createRequire(import.meta.url)
const original=JSON.parse(readFileSync(join(homedir(),'.flownote_config.json'),'utf8'))
if(original.api_provider!=='DeepSeek'||!original.api_key)throw new Error('DeepSeek is not configured')
const run=process.env.FLOWNOTE_LIVE_RESUME?resolve(process.env.FLOWNOTE_LIVE_RESUME):resolve('.e2e','live-'+Date.now()),dir=join(run,'library')
mkdirSync(dir,{recursive:true})
const configPath=join(run,'config.json')
writeFileSync(configPath,JSON.stringify({sync_dir:dir,api_key:'',api_provider:'DeepSeek',categories:['个人','学习'],theme:'paper',ai_comments:false,ai_auto_dream:false}))
let app
try{
 app=await electron.launch({executablePath:require('electron'),args:[resolve('.')],env:{...process.env,FLOWNOTE_CONFIG_PATH:configPath,FLOWNOTE_API_KEY:original.api_key}})
 const page=await app.firstWindow()
 await page.locator('.quick-input').waitFor()
 await page.evaluate(()=>window.api.classifier.stop())
 const mode=process.env.FLOWNOTE_LIVE_KIND==='research'?'research':'comment'
 const note=process.env.FLOWNOTE_LIVE_RESUME?await page.evaluate(async()=>{
  const notes=await window.api.notes.loadAll();const n=notes[0]
  const v=await window.api.thinking.view({kind:'note',id:n.id})
  await window.api.thinking.action(v.jobs[0].id,'retry');return n.id
 }):await page.evaluate(async(mode)=>{
  const n=await window.api.notes.createRecord(mode==='research'?'做决定时我总相信第一直觉；反复思考只会让我犹豫，所以重要决策也应该越快越好。':'睡前要多喝牛奶。')
  await window.api.notes.patch(n.id,n.revision,{category:'个人',title:'一个日常习惯的判断'})
  await window.api.thinking.run(n.id,mode)
  return n.id
 },mode)
 let view
 for(let i=0;i<240;i++){
  view=await page.evaluate(id=>window.api.thinking.view({kind:'note',id}),note)
  const job=view.jobs[0]
  if(job && ['done','failed','cancelled'].includes(job.status))break
  if(i%15===0)console.log(JSON.stringify({phase:job?.phase,status:job?.status}))
  await new Promise(r=>setTimeout(r,1000))
 }
 writeFileSync(join(run,'public-sample-result.json'),JSON.stringify(view,null,2))
 console.log(JSON.stringify({run,status:view.jobs[0]?.status,error:view.jobs[0]?.error,
   comment:view.insight?.body,warning:view.insight?.warning,
   sources:view.insight?.sources.map(s=>({title:s.title,url:s.url,read:!!s.text})),
   recommendations:view.insight?.recommendations.map(r=>({title:r.title,idea:r.idea,evidence:r.evidence})),
   corrections:view.corrections.map(c=>({claim:c.claim,replacement:c.replacement,status:c.status})),
   usage:view.insight?.usage}))
 if(view.jobs[0]?.status!=='done')process.exitCode=1
 await page.locator('#note-'+note).getByRole('button',{name:'展开',exact:true}).click()
 if(mode==='research')await page.getByRole('dialog').getByRole('tab',{name:/延伸阅读/}).click()
 await page.screenshot({path:join(run,'live-comment.png'),fullPage:true})
}finally{
 if(app)await app.close()
}
