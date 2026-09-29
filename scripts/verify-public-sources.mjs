import {_electron as electron} from 'playwright-core'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=resolve('.e2e/public-sources-'+Date.now())
mkdirSync(join(run,'library'),{recursive:true})
const config=join(run,'config.json'),reader=join(run,'reader.cjs')
writeFileSync(config,JSON.stringify({sync_dir:join(run,'library'),api_key:'',ai_comments:false,ai_auto_dream:false}))
await build({entryPoints:['src/main/services/source-reader.ts'],outfile:reader,bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'})
copyFileSync('out/main/pdf-worker.js',join(run,'pdf-worker.js'))
const harness=join(run,'harness.cjs')
writeFileSync(harness,"const {app,BrowserWindow}=require('electron');global.readFixture=(url)=>require('./reader.cjs').readPublicPage(url,AbortSignal.timeout(45000));app.whenReady().then(()=>{const win=new BrowserWindow({show:false});win.loadURL('data:text/html,verification')});")
const app=await electron.launch({executablePath:require('electron'),args:[harness],env:{...process.env,FLOWNOTE_CONFIG_PATH:config,FLOWNOTE_LOCAL_DATA:join(run,'local')}})
const results=[]
try{
 console.log('Public source reader ready')
 for(const url of ['https://arxiv.org/abs/1706.03762','https://arxiv.org/pdf/1706.03762']){
  console.log('Reading '+url)
  const result=await app.evaluate(async(_,{reader,url})=>{
   try{const text=await globalThis.readFixture(url);return {url,ok:true,characters:text.length,coverage:text.split('\n')[0],hasTransformer:text.toLowerCase().includes('transformer')}}catch(error){return {url,ok:false,error:String(error)}}
  },{reader,url})
  results.push(result)
 }
 writeFileSync(join(run,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({run,results}))
 assert(results[1].ok && results[1].hasTransformer,'public paper PDF must be read')
}finally{await app.close()}
