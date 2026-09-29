import {_electron as electron} from 'playwright-core'
import {createRequire} from 'node:module'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=resolve('.e2e/pdf-'+Date.now())
mkdirSync(join(run,'library'),{recursive:true});const config=join(run,'config.json')
writeFileSync(config,JSON.stringify({sync_dir:join(run,'library'),api_key:'',ai_comments:false,ai_auto_dream:false}))
function pdf(text){
 const stream='BT /F1 12 Tf 40 700 Td ('+text+') Tj ET'
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream']
 let result='%PDF-1.4\n';const offsets=[0]
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(result));result+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n'}
 const xref=Buffer.byteLength(result);result+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return [...Buffer.from(result)]
}
const app=await electron.launch({executablePath:require('electron'),args:[resolve('.')],env:{...process.env,FLOWNOTE_CONFIG_PATH:config,FLOWNOTE_LOCAL_DATA:join(run,'local')}})
try{
 const read=async(data)=>app.evaluate(({utilityProcess},{worker,data})=>new Promise((resolve,reject)=>{
  const child=utilityProcess.fork(worker,[],{stdio:'pipe'});const timer=setTimeout(()=>{child.kill();reject(new Error('timeout'))},25000)
  child.on('spawn',()=>child.postMessage(new Uint8Array(data)))
  child.on('message',message=>{clearTimeout(timer);child.kill();resolve(message)})
  child.on('exit',code=>{clearTimeout(timer);if(code)reject(new Error('worker exit '+code))})
 }),{worker:resolve('out/main/pdf-worker.js'),data})
 const text=await read(pdf('An open research paper should be read with its methods, population and limitations. This fixture verifies isolated text extraction and retained page positions.'))
 console.log(JSON.stringify(text))
 assert.match(text.text,/research paper/);assert.match(text.text,/第 1 页/)
 const scanned=await read(pdf(''))
 assert.match(scanned.error,/需要文字版/)
 writeFileSync(join(run,'results.json'),JSON.stringify({text,scanned},null,2))
 console.log(JSON.stringify({ok:true,run,checks:['separate process text PDF','page coverage','image-only PDF needs text']}))
}finally{await app.close()}
