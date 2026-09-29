// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {EMPTY_NOTE_FILTERS} from '../src/shared/note-filters'
import SearchBar from '../src/renderer/components/SearchBar'
vi.mock('../src/renderer/context/NotesContext',()=>({useNotes:()=>{
 const [searchKeyword,setSearchKeyword]=useState(''),[filters,setFilters]=useState(EMPTY_NOTE_FILTERS)
 return {notes:[{category:'生活',tags:['自行车','不会被列出来的标签']}],searchKeyword,setSearchKeyword,filters,setFilters,clearFilters:()=>setFilters(EMPTY_NOTE_FILTERS)}
}}))
afterEach(cleanup)
it('accepts a mixed query and never expands the whole tag collection',async()=>{
 const user=userEvent.setup();render(<SearchBar/>)
 await user.type(screen.getByRole('searchbox',{name:'搜索笔记'}),'#自行车 换轮胎')
 expect(screen.getByText('标签 #自行车，同时包含 换轮胎')).toBeTruthy()
 await user.click(screen.getByRole('button',{name:'筛选'}))
 expect(screen.queryByText('不会被列出来的标签')).toBeNull()
 expect(screen.queryByRole('checkbox',{name:'自行车'})).toBeNull()
 expect(screen.getByRole('checkbox',{name:'只看收藏'})).toBeTruthy()
})
