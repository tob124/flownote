import { useEffect, useRef } from 'react'
import type { Note } from '../../shared/types'
import NoteEditor from './NoteEditor'
import { Button } from './ui/Controls'
import { mayLeave } from '../utils/workspace'

export default function NoteDetailDialog({note,onClose,onRefresh}:{note:Note;onClose:()=>void;onRefresh?:()=>void}):JSX.Element {
  const dialog=useRef<HTMLDialogElement>(null)
  const close=():void=>{if(mayLeave())onClose()}
  useEffect(()=>{if(dialog.current?.showModal)dialog.current.showModal();else dialog.current?.setAttribute('open','');return()=>dialog.current?.close?.()},[])
  return <dialog ref={dialog} className="note-detail-modal" aria-label="笔记详情" onCancel={e=>{e.preventDefault();close()}}>
    <Button variant="quiet" icon="close" iconOnly aria-label="关闭" onClick={close}/>
    <NoteEditor key={note.id} note={note} onClose={close} onRefresh={onRefresh}/>
  </dialog>
}
