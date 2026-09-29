import { useEffect, useState } from 'react'
import { ActionMenu, Button } from './ui/Controls'
import type { Note, NoteFile } from '../../shared/types'

const PREVIEW_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
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
  async function open(storedName:string,reveal=false):Promise<void>{
    try{const result=await window.api.files.open(note.id,storedName,reveal);if(!result.ok)onNotify(result.error || '打开失败')}catch(error){onNotify(String(error))}
  }
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [imgUrls, setImgUrls] = useState<Record<string, string | null>>({})
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

  // 图片路径分批加载（chunk），避免一次性渲染大量 <img>
  useEffect(() => {
    const imgs = attachments
      .filter((a) => PREVIEW_EXTS.includes(a.ext) && !missing.has(a.storedName))
      .slice(0, MAX_PREVIEW)
    if (imgs.length === 0) return
    let cancelled = false
    let i = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const loadNext = (): void => {
      if (cancelled || i >= imgs.length) return
      const cur = imgs[i].storedName
      window.api.files.path(cur).then((p) => {
        if (!cancelled) setImgUrls((m) => ({ ...m, [cur]: p }))
      })
      i++
      timer = setTimeout(loadNext, 60)
    }
    loadNext()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [attachments, missing])

  async function saveAttachments(attachments: NoteFile[], success: string): Promise<void> {
    try {
      const result = await window.api.notes.patch(note.id, note.revision ?? 0, { attachments })
      if (!result.ok) { onNotify(result.error.message); onRefresh?.(); return }
      onSaved?.(result.value)
      onRefresh?.()
      onNotify(success)
    } catch (error) { onNotify(`附件更新失败：${String(error)}`) }
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
    {attachments.map(a => <div key={a.storedName} className="attachment-item">
      <button className="attachment-open" onClick={()=>void open(a.storedName)} title={'使用默认应用打开 '+a.name}>
        {imgUrls[a.storedName] && !missing.has(a.storedName) && <img src={imgUrls[a.storedName]!} alt=""/>}
        <span>{a.name} · {fmtSize(a.size)}{missing.has(a.storedName)?' · 文件缺失':''}</span>
      </button>
      <ActionMenu label={'附件操作：'+a.name} items={[
        {label:'在文件夹中显示',onSelect:()=>void open(a.storedName,true)},
        ...(missing.has(a.storedName)?[{label:'补齐文件',onSelect:()=>void replaceMissing(a.storedName)}]:[]),
        {label:'移除附件',danger:true,separator:true,onSelect:()=>setPendingDelete(a.storedName)}
      ]}/>
      {pendingDelete===a.storedName && <div role="group" aria-label="移除附件确认">从笔记中移除此附件？<Button variant="danger" onClick={()=>{removeAttachment(a.storedName);setPendingDelete(null)}}>确认移除</Button><Button onClick={()=>setPendingDelete(null)}>取消</Button></div>}
    </div>)}
  </div>
}
