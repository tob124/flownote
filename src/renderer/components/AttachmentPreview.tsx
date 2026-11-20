import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { AttachmentPreviewData } from '../../shared/attachment-preview'
import type { NoteFile } from '../../shared/types'
import MarkdownViewer from './MarkdownViewer'
import { ActionMenu, Button } from './ui/Controls'
import '../styles/attachment-preview.css'

const PdfPreview = lazy(() => import('./PdfPreview'))

export default function AttachmentPreview({ noteId, file, onClose }: {
  noteId: string; file: NoteFile; onClose: () => void
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [preview, setPreview] = useState<AttachmentPreviewData | null>(null)
  const [error, setError] = useState('')
  const [openMessage, setOpenMessage] = useState('')
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    closeButton.current?.focus({ preventScroll: true })
    let stale = false
    void window.api.files.preview(noteId, file.storedName).then(result => {
      if (!stale) setPreview(result)
    }).catch(() => {
      if (!stale) setError('无法读取附件。请检查文件是否已同步，或用系统应用打开。')
    })
    return () => { stale = true; node.close() }
  }, [noteId, file.storedName])

  async function openFile(action: boolean | 'choose' = false): Promise<void> {
    setOpening(true)
    setOpenMessage('')
    try {
      const result = await window.api.files.open(noteId, file.storedName, action)
      if (result.cancelled) setOpenMessage('已取消选择应用。')
      else if (result.pickerClosed) setOpenMessage('若附件未打开，可以重新选择应用。')
      else if (!result.ok) setOpenMessage(result.error || '系统无法打开附件。')
    } catch { setOpenMessage('系统无法打开附件。') }
    finally { setOpening(false) }
  }
  const mediaError = (): void => setError('此文件无法在 FlowNote 中显示，可以用系统应用打开。')
  return <dialog ref={dialog} className="attachment-preview" aria-label={file.name}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="attachment-preview-header">
      <strong title={file.name}>{file.name}</strong>
      <div>
        <Button variant="quiet" disabled={opening} onClick={() => void openFile()}>用系统应用打开</Button>
        <ActionMenu label="更多附件操作" items={[
          {label:'在文件夹中显示', disabled:opening, onSelect:() => void openFile(true)},
          ...(window.api.files.canChooseApplication ? [{label:'选择打开方式…', disabled:opening, onSelect:() => void openFile('choose')}] : [])
        ]}/>
        <Button ref={closeButton} variant="quiet" icon="close" iconOnly aria-label="关闭附件预览" onClick={onClose}/>
      </div>
    </header>
    {openMessage && <p className="attachment-preview-status" role="status">{openMessage}</p>}
    {(preview?.kind === 'text' || preview?.kind === 'markdown') && preview.truncated &&
      <p className="attachment-preview-status" role="status">这里只显示文件开头。可用系统应用查看全文。</p>}
    <div className="attachment-preview-content">
      {error ? <p role="alert">{error}</p> : !preview ? <p role="status">正在载入附件…</p> :
        preview.kind === 'unavailable' ? <p>{preview.message}</p> :
        preview.kind === 'markdown' ? (preview.text ? <MarkdownViewer content={preview.text} showImages={false}/> : <p>文件为空。</p>) :
        preview.kind === 'text' ? (preview.text ? <pre>{preview.text}</pre> : <p>文件为空。</p>) :
        preview.kind === 'image' ? <img src={preview.url} alt={file.name} onError={mediaError}/> :
        preview.kind === 'audio' ? <audio controls src={preview.url} aria-label={file.name} onError={mediaError}/> :
        preview.kind === 'video' ? <video controls src={preview.url} aria-label={file.name} onError={mediaError}/> :
        preview.kind === 'pdf' ? <Suspense fallback={<p role="status">正在载入 PDF…</p>}><PdfPreview bytes={preview.bytes}/></Suspense> : null}
    </div>
  </dialog>
}
