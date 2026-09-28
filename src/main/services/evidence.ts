import type { Recommendation, SourceEvidence } from '../../shared/insights'
const normalized = (s: string): string => s.replace(/\s+/g, ' ').trim()
const primaryHosts = ['penguinrandomhouse.com','penguinrandomhouse.ca','penguinrandomhouse.co.za','macmillan.com','oup.com','cambridge.org','hup.harvard.edu','press.princeton.edu','mitpress.mit.edu','yalebooks.yale.edu','nhs.uk','who.int','medlineplus.gov','nih.gov','cdc.gov','nhc.gov.cn','fda.gov','sec.gov','nasa.gov','simonandschuster.com','hachettebookgroup.com']
export function sourceKind(url: string): SourceEvidence['kind'] {
  const host = new URL(url).hostname
  return primaryHosts.some(d => host === d || host.endsWith('.'+d)) ? 'primary' : 'secondary'
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
    const evidence = ids.some(id => byId.get(id)?.kind === 'primary') ? 'primary' : ids.length ? 'secondary' : 'unverified'
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
    return [{
      id: String(index), title:text('title'), author:text('author'), original_title:text('original_title'),
      translation: text('translation') || '中译本尚未核实', question:text('question'), idea:text('idea'),
      relevance:text('relevance'), limits:text('limits'), reading: evidence === 'unverified' || (/chapter|page|第.{1,12}[章页节]|[0-9]+\s*[-–]\s*[0-9]+/i.test(reading) && !hasReadingEvidence) ? '尚未核实具体章节；可先了解全书主旨。' : reading,
      attribution: item.attribution === 'author' ? 'author' as const : 'extension' as const,
      identity_source_ids: identity, source_ids:ids, evidence, quote:exactQuote
    }]
  })
}
