import { useEffect, useRef, useState } from 'react'
import type { Note } from '../../shared/types'
import AttachmentList from './AttachmentList'
import '../styles/notecard.css'

interface Props {
  note: Note
  onClose: () => void
  onRefresh?: () => void
}

export default function NoteDetailDialog({ note, onClose, onRefresh }: Props): JSX.Element {
  const [tip, setTip] = useState<string | null>(null)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function notify(message: string): void {
    if (tipTimer.current) clearTimeout(tipTimer.current)
    setTip(message)
    tipTimer.current = setTimeout(() => setTip(null), 2500)
  }

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="note-detail-overlay" onClick={onClose}>
      <div className="note-detail-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="note-detail-exit" onClick={onClose} title="关闭（Esc）">
          ×
        </button>
        <div className="note-detail-head">
          <div className="note-detail-title">
            {note.title || '(无标题)'}
            {note.category && <span className="note-detail-cat">{note.category}</span>}
          </div>
        </div>
        <div className="note-detail-meta">
          {note.created_at}
          <span className={`note-card-status ${note.ai_status}`}>
            {note.ai_status === 'done'
              ? '已完成整理'
              : note.ai_status === 'processing'
                ? '处理中'
                : note.ai_status === 'failed'
                  ? '整理失败'
                  : '等待整理'}
          </span>
        </div>
        {note.summary && <div className="note-detail-summary">{note.summary}</div>}
        <div className="note-detail-content">{note.raw_content}</div>
        {note.tags && note.tags.length > 0 && (
          <div className="note-card-tags">
            {note.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
        <AttachmentList note={note} onRefresh={onRefresh} onNotify={notify} />
        {tip && <div className="note-card-tip">{tip}</div>}
      </div>
    </div>
  )
}