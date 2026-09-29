import type {SourceEvidence} from '../../shared/insights'
/** Select bounded literal passages; offsets always refer to the acquired source text. */
export function selectPassages(source:SourceEvidence,queries:string[]):string{
 const text=source.text
 const tokens=[...new Set(queries.join(' ').toLowerCase().match(/[a-z]{4,}|[\u4e00-\u9fff]{2,}/g)||[])].flatMap(token=>/^[a-z]/.test(token)?[token]:token.length<=4?[token]:Array.from({length:token.length-1},(_,i)=>token.slice(i,i+2)))
 const chunks:Array<{start:number;end:number;score:number}>=[]
 for(let start=0;start<Math.min(text.length,100000);start+=1800){
  const end=Math.min(text.length,start+1800),body=text.slice(start,end).toLowerCase()
  const score=tokens.reduce((sum,token)=>sum+(body.includes(token)?1:0),0)
  chunks.push({start,end,score})
 }
 const selected=chunks.length<=5?chunks:[chunks[0],...chunks.slice(1).sort((a,b)=>b.score-a.score||a.start-b.start).slice(0,4)].sort((a,b)=>a.start-b.start)
 source.analysis_ranges=selected.map(({start,end})=>({start,end}))
 return selected.map(({start,end})=>{
  const page=[...text.slice(0,start+1).matchAll(/\[第 (\d+) 页\]/g)].at(-1)?.[1]
  return '[取得文本中的第 '+(start+1)+'–'+end+' 字'+(page?'；起始于 PDF 第 '+page+' 页':'')+']\n'+text.slice(start,end)
 }).join('\n\n')
}
