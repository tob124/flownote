import { useEffect, useRef, useState } from 'react'
import type { NoteFile } from '../../shared/types'
import MarkdownViewer from './MarkdownViewer'
import { Button } from './ui/Controls'

export default function WebClipPreview({ noteId, file, onClose }: {
  noteId: string; file: NoteFile; onClose: () => void
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current
    if (node?.showModal) node.showModal()
    else node?.setAttribute('open', '')
    let stale = false
    void window.api.files.readWebClip(noteId, file.storedName).then(result => {
      if (!stale) setMarkdown(result)
    }).catch(() => {
      if (!stale) setError('无法读取网页附件。请检查文件是否已同步。')
    })
    return () => { stale = true; node?.close?.() }
  }, [noteId, file.storedName])
  return <dialog ref={dialog} className="web-clip-preview" aria-label={file.name} onCancel={event => { event.preventDefault(); onClose() }}>
    <header><strong>{file.name}</strong><Button variant="quiet" icon="close" iconOnly aria-label="关闭网页附件" onClick={onClose}/></header>
    {error ? <p role="alert">{error}</p> : markdown === null ? <p role="status">正在读取网页附件…</p> :
      <MarkdownViewer content={markdown} showImages={false}/>}
  </dialog>
}
