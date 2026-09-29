import type { Recommendation, SourceEvidence } from '../../shared/insights'
const normalized = (s: string): string => s.replace(/\s+/g, ' ').trim()
const primaryHosts = ['penguinrandomhouse.com','penguinrandomhouse.ca','penguinrandomhouse.co.za','macmillan.com','oup.com','cambridge.org','hup.harvard.edu','press.princeton.edu','mitpress.mit.edu','yalebooks.yale.edu','nhs.uk','who.int','medlineplus.gov','nih.gov','cdc.gov','nhc.gov.cn','fda.gov','sec.gov','nasa.gov','simonandschuster.com','hachettebookgroup.com']
export function sourceKind(url: string): SourceEvidence['kind'] {
  const host = new URL(url).hostname
  return primaryHosts.some(d => host === d || host.endsWith('.'+d)) ? 'primary' : 'unknown'
}
export function validateRecommendations(raw: unknown, sources: SourceEvidence[]): Recommendation[] {
  if (!Array.isArray(raw)) return []
  const byId = new Map(sources.map(s => [s.id,s]))
  return raw.slice(0,3).flatMap((item,index) => {
    if (!item || typeof item !== 'object') return []
    const text = (key: string): string => typeof item[key] === 'string' ? item[key].trim().slice(0,3000) : ''
    if (!text('title') || !text('idea') || !text('relevance') || !text('question')) return []
    const claims = Array.isArray(item.support) ? item.support : []
    const supported = claims.filter((c:any) => {
      const source = byId.get(c.source_id)
      return source && typeof c.excerpt === 'string' && normalized(c.excerpt).length >= 20 &&
        normalized(source.text).includes(normalized(c.excerpt)) && c.supports_claim === true
    })
    for (const c of supported) byId.get(c.source_id)!.excerpt = c.excerpt
    const ids: string[] = [...new Set<string>(supported.map((c:any) => c.source_id))]
    const evidence = ids.some(id => byId.get(id)?.kind === 'primary') ? 'primary' : ids.some(id=>byId.get(id)?.kind==='secondary') ? 'secondary' : 'unverified'
    const quote = text('quote')
    const exactQuote = quote && ids.some(id => normalized(byId.get(id)!.text).includes(normalized(quote))) ? quote : undefined
    const identity = Array.isArray(item.identity_source_ids) ? item.identity_source_ids.filter((id:unknown) => {
      if(typeof id!=='string')return false
      const body=normalized(byId.get(id)?.text || '').toLowerCase()
      const titles=[text('title'),text('original_title')].filter(Boolean).map(t=>normalized(t).toLowerCase())
      return !!text('author') && titles.some(t=>body.includes(t)) && body.includes(normalized(text('author')).toLowerCase())
    }) : []
    const reading=text('reading')
    const readingSupport=Array.isArray(item.reading_support)?item.reading_support:[]
    const hasReadingEvidence=readingSupport.some((c:any)=>{
      const source=byId.get(c.source_id)
      return source && typeof c.excerpt==='string' && normalized(c.excerpt).length>=20 && normalized(source.text).includes(normalized(c.excerpt))
        && /chapter|page|章节|目录|第.{1,12}[章页节]/i.test(c.excerpt)
    })
    let quality:Recommendation['quality']
    const q=item.quality, qs=q && byId.get(q.source_id)
    if(q && qs && typeof q.excerpt==='string' && q.excerpt.length>=20 && normalized(qs.text).includes(normalized(q.excerpt)) && typeof q.edition==='string' && q.edition.trim()){
      const host=qs.url?new URL(qs.url).hostname:''
      const douban=/(^|\.)douban\.com$/.test(host),goodreads=/(^|\.)goodreads\.com$/.test(host)
      const rating=q.kind==='rating' && typeof q.score==='number' && Number.isInteger(q.count) &&
        ((douban && q.score>=8 && q.score<=10 && q.count>=100) || (goodreads && q.score>=4 && q.score<=5 && q.count>=200)) &&
        q.excerpt.includes(String(q.score)) && q.excerpt.replace(/,/g,'').includes(String(q.count))
      const review=q.kind==='professional_review' && qs.document_type==='review' && typeof q.reason==='string' && q.reason.length>=20
      if(rating || review)quality={kind:rating?'rating':'professional_review',source_id:qs.id,excerpt:q.excerpt,
        platform:rating?(douban?'豆瓣':'Goodreads'):undefined,score:rating?q.score:undefined,count:rating?q.count:undefined,
        edition:normalized(qs.text).includes(normalized(q.edition))?q.edition:'来源未注明可核实版本',checked_at:qs.fetched_at,reason:typeof q.reason==='string'?q.reason:''}
    }
    // New-format books need a verifiable quality basis, independent of attribution.
    if(item.material_type==='book' && !quality)return []
    return [{
      material_type:item.material_type,quality,
      id: String(index), title:text('title'), author:text('author'), original_title:text('original_title'),
      translation: text('translation') || '中译本尚未核实', question:text('question'), idea:text('idea'),
      relevance:text('relevance'), limits:text('limits'), reading: evidence === 'unverified' || (/chapter|page|第.{1,12}[章页节]|[0-9]+\s*[-–]\s*[0-9]+/i.test(reading) && !hasReadingEvidence) ? '尚未核实具体章节；可先了解全书主旨。' : reading,
      attribution: item.attribution === 'author' ? 'author' as const : 'extension' as const,
      identity_source_ids: identity, source_ids:ids, evidence, quote:exactQuote
    }]
  })
}
