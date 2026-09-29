import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
const port=(process as typeof process & {parentPort:{on:(event:string,fn:(event:{data:Uint8Array})=>void)=>void;postMessage:(value:unknown)=>void}}).parentPort
port.on('message',async({data})=>{
  let document:PDFDocumentProxy|undefined
  try{
    const workerModule='pdfjs-dist/legacy/build/pdf.worker.mjs'
    ;(globalThis as any).pdfjsWorker=await import(workerModule)
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task=getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,isOffscreenCanvasSupported:false})
    document=await task.promise
    const total=document.numPages,limit=Math.min(total,80)
    let text='[PDF：共 '+total+' 页，提取前 '+limit+' 页；仅代表所示页码覆盖范围]\n'
    let characters=0
    for(let n=1;n<=limit;n++){
      const page=await document.getPage(n)
      const content=await page.getTextContent()
      const body=content.items.map(item=>'str' in item ? item.str : '').join(' ')
      characters+=body.trim().length
      text+='\n[第 '+n+' 页]\n'+body
      page.cleanup()
      if(text.length>100000){text=text.slice(0,100000)+'\n[后续内容未读取]';break}
    }
    if(characters<80)throw new Error('需要文字版：此 PDF 未提取到足够文本，可能是扫描件')
    port.postMessage({text})
  }catch(error){port.postMessage({error:String(error)})}
  finally{await document?.destroy()}
})
