import { utilityProcess } from 'electron'
import { join } from 'path'
export function readPdf(data:Buffer,signal:AbortSignal):Promise<string>{
  if(data.length>20_000_000)throw new Error('PDF 超过 20 MB 限制')
  signal.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const child=utilityProcess.fork(join(__dirname,'pdf-worker.js'),[],{stdio:'pipe'})
    let settled=false
    const finish=(error?:Error,text?:string):void=>{
      if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);child.kill()
      if(error)reject(error);else resolve(text || '')
    }
    const abort=():void=>finish(new Error('PDF 读取已取消'))
    const timer=setTimeout(()=>finish(new Error('PDF 解析超过 20 秒限制')),20000)
    signal.addEventListener('abort',abort,{once:true})
    child.on('spawn',()=>child.postMessage(new Uint8Array(data)))
    child.on('message',(message:{text?:string;error?:string})=>finish(message.error?new Error(message.error):undefined,message.text))
    child.on('exit',()=>finish(new Error('PDF 解析进程意外结束')))
  })
}
