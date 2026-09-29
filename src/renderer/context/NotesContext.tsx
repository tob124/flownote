import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import type { Note } from '../../shared/types'
import { EMPTY_NOTE_FILTERS, filterNotes, searchNotes, type NoteFilters } from '../../shared/note-filters'
import { newestFirst } from '../../shared/note-time'
import { useConfig } from './ConfigContext'
interface NotesCtx {
  notes:Note[]; filteredNotes:Note[]; searchKeyword:string; filters:NoteFilters
  setFilters:(filters:NoteFilters)=>void; clearFilters:()=>void
  isLoading:boolean; isRefreshing:boolean; error:string|null
  setSearchKeyword:(kw:string)=>void; loadNotes:()=>Promise<void>
  addNote:(content:string)=>Promise<string|null>; deleteNote:(id:string)=>Promise<boolean>
  savedId:string|null; focusId:string|null; revealNote:(id:string)=>void
}
const NotesContext=createContext<NotesCtx>({
  notes:[],filteredNotes:[],searchKeyword:'',filters:EMPTY_NOTE_FILTERS,setFilters:()=>{},clearFilters:()=>{},
  isLoading:false,isRefreshing:false,error:null,setSearchKeyword:()=>{},loadNotes:async()=>{},
  addNote:async()=>null,deleteNote:async()=>false,savedId:null,focusId:null,revealNote:()=>{}
})
export function NotesProvider({children}:{children:ReactNode}):JSX.Element {
  const {config,isLoaded}=useConfig()
  const dir=config.sync_dir
  const dirRef=useRef(dir);dirRef.current=dir
  const [notes,setNotes]=useState<Note[]>([])
  const [searchKeyword,setSearchKeyword]=useState('')
  const [filters,setFilters]=useState<NoteFilters>(EMPTY_NOTE_FILTERS)
  const [isLoading,setLoading]=useState(false)
  const [isRefreshing,setRefreshing]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [savedId,setSavedId]=useState<string|null>(null)
  const [focusId,setFocusId]=useState<string|null>(null)
  const sequence=useRef(0)
  const loaded=useRef(false)
  const loadNotes=useCallback(async()=>{
    if(!isLoaded || !dir)return
    const ticket=++sequence.current
    setError(null);setLoading(!loaded.current);setRefreshing(loaded.current)
    try{
      // Load one canonical list. Search and filters never hide a successful save from the cache.
      const result=await window.api.notes.loadAll()
      if(ticket===sequence.current && dirRef.current===dir){setNotes(result);loaded.current=true}
    }catch(e){if(ticket===sequence.current && dirRef.current===dir)setError(String(e))}
    finally{if(ticket===sequence.current && dirRef.current===dir){setLoading(false);setRefreshing(false)}}
  },[dir,isLoaded])
  useEffect(()=>{
    ++sequence.current;loaded.current=false;setNotes([]);setError(null);setSavedId(null);setFocusId(null)
    setSearchKeyword('');setFilters(EMPTY_NOTE_FILTERS);void loadNotes()
  },[loadNotes])
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined
    const reload=():void=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>void loadNotes(),150)}
    const unsubs=[window.api.on('notes:updated',reload),
      window.api.inboxEvents.onNoteCreated(reload),window.api.inboxEvents.onProcessingEnd(reload)]
    const focus=():void=>{void loadNotes()}
    window.addEventListener('focus',focus)
    return()=>{if(timer)clearTimeout(timer);unsubs.forEach(fn=>fn());window.removeEventListener('focus',focus);++sequence.current}
  },[loadNotes])
  const addNote=useCallback(async(content:string):Promise<string|null>=>{
    try{
      const note=await window.api.notes.createRecord(content)
      if(dirRef.current===dir){
        // Invalidate older reads so they cannot erase this just-saved record.
        ++sequence.current
        setNotes(current=>[note,...current.filter(n=>n.id!==note.id)].sort(newestFirst))
        setSavedId(note.id);setError(null);setLoading(false);setRefreshing(false)
        void loadNotes()
      }
      void window.api.classifier.poke().catch(()=>{})
      return note.id
    }catch(e){if(dirRef.current===dir)setError(String(e));return null}
  },[dir,loadNotes])
  const deleteNote=useCallback(async(id:string)=>{
    try{const ok=await window.api.notes.delete(id);if(ok && dirRef.current===dir){setNotes(v=>v.filter(n=>n.id!==id));void loadNotes()}return ok}
    catch(e){setError(String(e));return false}
  },[dir,loadNotes])
  const revealNote=useCallback((id:string)=>{setSearchKeyword('');setFilters(EMPTY_NOTE_FILTERS);setFocusId(id);void loadNotes()},[loadNotes])
  const filteredNotes=useMemo(()=>{
    return filterNotes(searchNotes(notes,searchKeyword),filters)
  },[notes,searchKeyword,filters])
  return <NotesContext.Provider value={{notes,filteredNotes,searchKeyword,filters,setFilters,clearFilters:()=>setFilters(EMPTY_NOTE_FILTERS),
    isLoading,isRefreshing,error,setSearchKeyword,loadNotes,addNote,deleteNote,savedId,focusId,revealNote}}>{children}</NotesContext.Provider>
}
export function useNotes():NotesCtx{return useContext(NotesContext)}
