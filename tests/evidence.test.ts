import { describe, expect, it } from 'vitest'
import { parseSearch } from '../src/main/services/deepseek-search'
import { extractText, publicAddress, sourceUrl } from '../src/main/services/source-reader'
import { validateRecommendations } from '../src/main/services/evidence'
import { newestFirst, readEffectiveTime } from '../src/shared/note-time'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { commitWiki } from '../src/main/store/wiki-revision'
import type { SourceEvidence } from '../src/shared/insights'
describe('evidence boundaries',()=>{
  it('does not mistake generated links for native search results',()=>{
    expect(()=>parseSearch({content:[{type:'text',text:'https://example.org'}]})).toThrow()
    const parsed=parseSearch({content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'Book',url:'https://example.org/book'}]}]})
    expect(parsed.sources[0].text).toBe('')
    expect(parsed.sources[0].excerpt).toBeUndefined()
  })
  it('rejects local and non-web sources and strips scripts',()=>{
    for(const address of ['127.0.0.1','10.0.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1'])expect(publicAddress(address)).toBe(false)
    expect(()=>sourceUrl('file:///C:/secret')).toThrow()
    expect(()=>sourceUrl('https://user:password@example.org')).toThrow()
    expect(extractText('<main><p>正文</p><script>bad()</script></main><nav>导航</nav>')).toBe('正文')
  })
  it('downgrades unsupported attributions, invented quotations and page numbers',()=>{
    const source:SourceEvidence={id:'s',url:'https://example.org',title:'source',text:'实际原文只是与主题相关，不足以证明另一个主张。',kind:'secondary',fetched_at:1}
    const base={title:'书',idea:'观点',relevance:'具体帮助',question:'问题',reading:'第999页',quote:'编造的句子',
      support:[{source_id:'s',excerpt:'来源不存在的引文',supports_claim:true}]}
    const rec=validateRecommendations([base],[source])[0]
    expect(rec.evidence).toBe('unverified');expect(rec.quote).toBeUndefined()
    expect(rec.reading).not.toContain('999')
  })
  it('sorts a real new timestamp ahead of legacy long identifiers without migrating IDs',()=>{
    const old={id:'1778215309498000',created_at:'2026-05-08'}
    const recent={id:'1778215309498001',created_at:'2026-09-23',created_at_ms:1790137215327}
    const normal={id:'1790000000000',created_at:'2026-09-21'}
    expect([old,recent,normal].sort(newestFirst)[0]).toBe(recent)
    expect(readEffectiveTime(old)).toBe(Date.parse('2026-05-08'))
  })
  it('refuses to overwrite a concurrently changed Wiki',()=>{
    const dir=mkdtempSync(join(tmpdir(),'flownote-wiki-'))
    try{
      mkdirSync(join(dir,'wikis'))
      writeFileSync(join(dir,'wikis','学习_2026_09.md'),'already changed')
      expect(()=>commitWiki(dir,'学习_2026_09.md','old snapshot','new')).toThrow('已被其他操作更新')
      expect(readFileSync(join(dir,'wikis','学习_2026_09.md'),'utf8')).toBe('already changed')
    }finally{rmSync(dir,{recursive:true,force:true})}
  })
})
