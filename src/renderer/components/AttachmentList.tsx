import { useEffect, useState } from 'react'
import { ActionMenu, Button } from './ui/Controls'
import type { Note, NoteFile } from '../../shared/types'
import AttachmentSummaryEditor from './AttachmentSummaryEditor'
import AttachmentPreview from './AttachmentPreview'
import { attachmentMediaUrl, mediaFormat } from '../../shared/attachment-preview'

const MAX_PREVIEW = 10

interface Props {
  note: Note
  onRefresh?: () => void
  onSaved?: (note: Note) => void
  onNotify: (message: string) => void
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentList({ note, onRefresh, onSaved, onNotify }: Props): JSX.Element | null {
  const attachments = note.attachments || []
  const [pendingDelete,setPendingDelete]=useState<string | null>(null)
  const [editingSummary, setEditingSummary] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<NoteFile | null>(null)
  async function open(storedName:string,action:boolean | 'choose'=false):Promise<void>{
    try {
      const result = await window.api.files.open(note.id, storedName, action)
      if (result.cancelled) onNotify('已取消选择打开方式')
      else if (result.pickerClosed) onNotify('已返回 FlowNote。若附件未打开，可重新选择应用。')
      else if (!result.ok) onNotify(result.error || '打开失败')
    } catch (error) { onNotify(String(error)) }
  }
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [loadingMissing, setLoadingMissing] = useState(true)

  // 存在性检查（兜底）
  useEffect(() => {
    if (attachments.length === 0) {
      setMissing(new Set())
      setLoadingMissing(false)
      return
    }
    setLoadingMissing(true)
    window.api.files
      .check(attachments.map((a) => a.storedName))
      .then((res) => {
        const miss = new Set<string>()
        for (const a of attachments) {
          if (res[a.storedName] === false) miss.add(a.storedName)
        }
        setMissing(miss)
        if (miss.size > 0) {
          const names = Array.from(miss).join('、')
          // 通知一次即可，避免每次渲染都调
          if (!loadingMissing) onNotify(`笔记附件缺失：${names}`)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMissing(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, attachments.map((a) => a.storedName).join('|')])

  const thumbnails = new Set(attachments.filter(file => mediaFormat(file.ext)?.kind === 'image' && !missing.has(file.storedName))
    .slice(0, MAX_PREVIEW).map(file => file.storedName))

  async function saveAttachments(attachments: NoteFile[], success: string): Promise<boolean> {
    try {
      const result = await window.api.notes.patch(note.id, note.revision ?? 0, { attachments })
      if (!result.ok) { onNotify(result.error.message); onRefresh?.(); return false }
      onSaved?.(result.value)
      onRefresh?.()
      onNotify(success)
      return true
    } catch (error) { onNotify(`附件更新失败：${String(error)}`); return false }
  }

  function removeAttachment(storedName: string): void {
    void saveAttachments((note.attachments || []).filter((a) => a.storedName !== storedName), '附件已移除')
  }

  async function replaceMissing(storedName: string): Promise<void> {
    try {
      const picked = await window.api.files.select()
      if (!picked || picked.length === 0) return
      await saveAttachments([
        ...(note.attachments || []).filter((a) => a.storedName !== storedName), ...picked
      ], '附件已补齐')
    } catch (error) { onNotify(`选择文件失败：${String(error)}`) }
  }

  if (attachments.length === 0) return null

  return <div className="attachment-list">
    {attachments.map(a => <div key={a.storedName} className={'attachment-item' + (a.summary || editingSummary===a.storedName ? ' attachment-with-summary' : '')}>
      <div className="attachment-info"><button className="attachment-open" onClick={() => setPreviewFile(a)} title={'预览 ' + a.name}>
        {thumbnails.has(a.storedName) && <img src={attachmentMediaUrl(note.id, a.storedName)} alt="" loading="lazy"/>}
        <span>{a.name} · {fmtSize(a.size)}{missing.has(a.storedName)?' · 文件缺失':''}</span>
      </button>
      {a.summary && <p className="attachment-summary">{a.summary}</p>}</div>
      <ActionMenu label={'附件操作：'+a.name} items={[
        {label:a.summary?'编辑摘要':'添加摘要',onSelect:()=>setEditingSummary(a.storedName)},
        {label:'用系统应用打开',onSelect:()=>void open(a.storedName)},
        ...(window.api.files.canChooseApplication ? [{label:'选择打开方式…',onSelect:()=>void open(a.storedName,'choose')}] : []),
        {label:'在文件夹中显示',onSelect:()=>void open(a.storedName,true)},
        ...(missing.has(a.storedName)?[{label:'补齐文件',onSelect:()=>void replaceMissing(a.storedName)}]:[]),
        {label:'移除附件',danger:true,separator:true,onSelect:()=>setPendingDelete(a.storedName)}
      ]}/>
      {editingSummary===a.storedName && <AttachmentSummaryEditor name={a.name} summary={a.summary} onClose={()=>setEditingSummary(null)} onSave={summary=>void (async()=>{
        if (await saveAttachments(attachments.map(file=>file.storedName===a.storedName?{...file,summary}:file), '附件摘要已保存')) setEditingSummary(null)
      })()} />}
      {pendingDelete===a.storedName && <div role="group" aria-label="移除附件确认">从笔记中移除此附件？<Button variant="danger" onClick={()=>{removeAttachment(a.storedName);setPendingDelete(null)}}>确认移除</Button><Button onClick={()=>setPendingDelete(null)}>取消</Button></div>}
    </div>)}
    {previewFile && <AttachmentPreview key={`${note.id}:${previewFile.storedName}`} noteId={note.id} file={previewFile} onClose={()=>setPreviewFile(null)}/>}
  </div>
}
