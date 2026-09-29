import { describe, expect, it } from 'vitest'
import { EMPTY_NOTE_FILTERS, filterNotes, parseNoteQuery, searchNotes } from '../src/shared/note-filters'
import type { Note } from '../src/shared/types'

function note(id: string, category: string, tags: string[], favorite: boolean, date: string, status: Note['ai_status']): Note {
  return { id, title: '', raw_content: '', summary: '', category, tags, favorite,
    created_at: date, ai_status: status, retry_count: 0 }
}
describe('note filters', () => {
  it('combines exact tags and independent keywords without treating body mentions as tags',()=>{
    const a={...note('a','生活',['自行车','通勤'],false,'2026-09-01','done'),raw_content:'周末更换轮胎，检查刹车'}
    const b={...a,id:'b',tags:['电动自行车'],raw_content:'自行车换轮胎'}
    const c={...a,id:'c',tags:['自行车'],raw_content:'今天通勤'}
    expect(searchNotes([a,b,c],'#自行车 轮胎 刹车').map(n=>n.id)).toEqual(['a'])
    expect(searchNotes([a,b,c],'#自行车 #通勤').map(n=>n.id)).toEqual(['a'])
    expect(searchNotes([a,b,c],'轮胎 #不存在')).toEqual([])
    expect(searchNotes([a,b,c],'   ')).toHaveLength(3)
  })
  it('supports fullwidth hashes, quoted tags and literal hashes inside ordinary terms',()=>{
    expect(parseNoteQuery('＃自行车 维修 #"Road Bike"')).toEqual({tags:['自行车','road bike'],terms:['维修']})
    expect(parseNoteQuery('C# https://example.org/#section')).toEqual({tags:[],terms:['c#','https://example.org/#section']})
    expect(parseNoteQuery('#')).toEqual({tags:[],terms:[]})
    const n={...note('a','生活',['#自行车','Road Bike'],false,'2026-09-01','done'),raw_content:'保养'}
    expect(searchNotes([n],'＃自行车 #"road bike" 保养')).toHaveLength(1)
  })
  const notes = [
    note('1700000000001', '学习', ['英文'], true, '2026-09-01', 'done'),
    note('1700000000002', '学习', ['阅读'], true, '2026-09-15', 'done'),
    note('1700000000003', '工作', ['英文'], true, '2026-09-15', 'done'),
    note('1700000000004', '学习', ['英文'], false, '2026-09-30', 'pending')
  ]
  it('ANDs category, favorite, state and inclusive dates while ORing tags', () => {
    const result = filterNotes(notes, { ...EMPTY_NOTE_FILTERS, category: '学习',
      favoriteOnly: true, status: 'done', tags: ['英文', '阅读'],
      from: '2026-09-01', to: '2026-09-15' })
    expect(result.map((item) => item.id)).toEqual(['1700000000002', '1700000000001'])
  })
  it('sorts a copy oldest first without changing input order', () => {
    expect(filterNotes(notes, { ...EMPTY_NOTE_FILTERS, sort: 'oldest' }).map((item) => item.id))
      .toEqual(notes.map((item) => item.id))
    expect(notes[0].id).toBe('1700000000001')
  })
})
