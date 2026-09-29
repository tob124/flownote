import type { Note } from './types'
import { newestFirst, noteDate } from './note-time'

export interface NoteFilters {
  category: string
  tags: string[]
  favoriteOnly: boolean
  status: '' | Note['ai_status']
  from: string
  to: string
  sort: 'newest' | 'oldest'
}
export const EMPTY_NOTE_FILTERS: NoteFilters = {
  category: '', tags: [], favoriteOnly: false, status: '', from: '', to: '', sort: 'newest'
}
export interface NoteQuery { tags:string[]; terms:string[] }
const normalizeQuery=(value:string):string=>value.normalize('NFKC').toLocaleLowerCase().trim()
/** Whitespace separates conditions. #tag matches a whole tag; plain words all match. */
export function parseNoteQuery(query:string):NoteQuery {
  const result:NoteQuery={tags:[],terms:[]}
  const tokens=query.match(/[#＃](?:"[^"]*"|'[^']*'|[^\s#＃]+)|"[^"]*"|'[^']*'|\S+/gu)||[]
  for(const token of tokens){
    const isTag=/^[#＃]/.test(token)
    const raw=isTag?token.slice(1):token
    const value=normalizeQuery(raw.replace(/^(?:"(.*)"|'(.*)')$/u,(_m,a,b)=>a??b))
    if(value)(isTag?result.tags:result.terms).push(value)
  }
  return {tags:[...new Set(result.tags)],terms:[...new Set(result.terms)]}
}
export function searchNotes(notes:Note[],query:string):Note[]{
  const {tags,terms}=parseNoteQuery(query)
  if(!tags.length&&!terms.length)return notes
  return notes.filter(note=>{
    const noteTags=new Set((note.tags||[]).map(tag=>normalizeQuery(tag).replace(/^#/,'')))
    if(!tags.every(tag=>noteTags.has(tag)))return false
    const body=normalizeQuery([note.title,note.raw_content,note.summary,note.category,...(note.tags||[])].join('\n'))
    return terms.every(term=>body.includes(term))
  })
}
/** Different filters combine with AND; multiple selected tags combine with OR. */
export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  return notes.filter((note) => {
    if (filters.category && note.category !== filters.category) return false
    if (filters.favoriteOnly && !note.favorite) return false
    if (filters.status && note.ai_status !== filters.status) return false
    if (filters.tags.length && !filters.tags.some((tag) => (note.tags || []).includes(tag))) return false
    if (filters.from && noteDate(note) < filters.from) return false
    if (filters.to && noteDate(note) > filters.to) return false
    return true
  }).sort((a, b) => filters.sort === 'newest'
    ? newestFirst(a, b) : newestFirst(b, a))
}
