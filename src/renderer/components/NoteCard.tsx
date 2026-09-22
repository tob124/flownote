import { memo, useRef, useState } from 'react'
import type { Note } from '../../shared/types'
import AttachmentList from './AttachmentList'
import '../styles/notecard.css'

interface Props {
  note: Note
  grid?: boolean
  onDelete: (id: string) => void
  onRefresh: () => void
  onOpenDetail: (note: Note) => void
}

const STATUS_LABELS: Record<Note['ai_status'], string> = {
  pending: '等待',
  processing: '处理中',
  done: '完成',
  failed: '失败'
}

export default memo(function NoteCard({
  note,
  grid,
  onDelete,
  onRefresh,
  onOpenDetail
}: Props): JSX.Element {
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tip, setTip] = useState<string | null>(null)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function onAttach(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const files = await window.api.files.select()
      if (!files || files.length === 0) return
      const ok = await window.api.files.attach(note.id, files)
      if (ok) {
        notify(`已附加 ${files.length} 个文件`)
        onRefresh()
      }
    } finally {
      setBusy(false)
    }
  }

  function notify(message: string): void {
    if (tipTimer.current) clearTimeout(tipTimer.current)
    setTip(message)
    tipTimer.current = setTimeout(() => setTip(null), 2500)
  }

  return (
    <div className="note-card">
      <div className="note-card-header">
        <span className="note-card-category">{note.category || 'Inbox'}</span>
        <span className="note-card-date">{note.created_at}</span>
        <span className={`note-card-status ${note.ai_status}`}>
          {STATUS_LABELS[note.ai_status] || note.ai_status}
        </span>
        <button className="note-card-attach-btn" onClick={() => void onAttach()} title="附加文件">
          +
        </button>
        {note.ai_status !== 'processing' && (
          <button
            className="note-card-delete-btn"
            onClick={() => setShowConfirm(true)}
            title="删除笔记"
          >
            ×
          </button>
        )}
      </div>

      <div
        className="note-card-body"
        onClick={grid ? () => onOpenDetail(note) : undefined}
        title={grid ? '点击查看全文' : undefined}
      >
        {note.title && <div className="note-card-title">{note.title}</div>}
        {note.summary && <div className="note-card-summary">{note.summary}</div>}
        {note.raw_content}
      </div>

      {grid && (
        <button
          className="note-card-detail-btn"
          onClick={() => onOpenDetail(note)}
          title="查看全文"
        >
          📄 查看全文
        </button>
      )}

      <AttachmentList note={note} onRefresh={onRefresh} onNotify={notify} />

      {tip && <div className="note-card-tip">{tip}</div>}

      {note.tags && note.tags.length > 0 && (
        <div className="note-card-tags">
          {note.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      )}

      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              padding: 24,
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              minWidth: 300
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ marginBottom: 16 }}>确定要删除这条笔记吗？</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="settings-btn"
                onClick={() => setShowConfirm(false)}
              >
                取消
              </button>
              <button
                className="settings-btn danger"
                onClick={() => {
                  onDelete(note.id)
                  setShowConfirm(false)
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
