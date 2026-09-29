import {it,expect} from 'vitest'
import {selectPassages} from '../src/main/services/source-passages'
import type {SourceEvidence} from '../src/shared/insights'
it('selects late relevant passages with literal offsets instead of only reading the introduction',()=>{
 const source:SourceEvidence={id:'test',url:'https://example.org',title:'test',kind:'unknown',fetched_at:1,text:'unrelated introduction '.repeat(1500)+'attention mechanism and population limitations '.repeat(150)}
 const selected=selectPassages(source,['attention mechanism population limitations'])
 expect(selected).toContain('population limitations')
 expect(source.analysis_ranges?.some(r=>r.start>20000)).toBe(true)
 expect(source.analysis_ranges?.reduce((sum,r)=>sum+r.end-r.start,0)).toBeLessThanOrEqual(9000)
})
