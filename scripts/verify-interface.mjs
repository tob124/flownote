import {_electron as electron} from 'playwright-core'
import {createRequire} from 'node:module'
import {resolve,join,relative,isAbsolute} from 'node:path'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const run=resolve(process.argv[2]||'.e2e/live-1790600513092')
const testPath=relative(resolve('.e2e'),run)
if(!testPath||testPath.startsWith('..')||isAbsolute(testPath))throw new Error('Only an isolated .e2e profile may be used')
const configPath=join(run,'config.json')
const config=JSON.parse(readFileSync(configPath,'utf8'))
writeFileSync(configPath,JSON.stringify({...config,api_key:'',ai_comments:false,ai_auto_dream:false}))
const app=await electron.launch({executablePath:require('electron'),args:[resolve('.')],env:{...process.env,FLOWNOTE_CONFIG_PATH:configPath,FLOWNOTE_API_KEY:''}})
try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(String(e)))
 await page.locator('.note-card').first().getByRole('button',{name:'展开',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'笔记的回应与延伸阅读'})
 await dialog.getByRole('tab',{name:/延伸阅读/}).click()
 await page.screenshot({path:join(run,'reading-redesign.png')})
 await dialog.getByRole('tab',{name:'继续讨论',exact:true}).click()
 await page.screenshot({path:join(run,'discussion-redesign.png')})
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({ok:true,run,checks:['reading tab','discussion tab','Escape closes dialog','no page errors']}))
}finally{await app.close()}
