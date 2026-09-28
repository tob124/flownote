import ThoughtPanel from './ThoughtPanel'
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

  async function toggleFavorite(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const result = await window.api.notes.patch(note.id, note.revision ?? 0, {
        favorite: !note.favorite
      })
      if (!result.ok) throw new Error(result.error.message)
      onRefresh()
      notify(result.value.favorite ? '已收藏' : '已取消收藏')
    } catch (reason) { notify(String(reason)) }
    finally { setBusy(false) }
  }

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
    <div className="note-card" id={'note-'+note.id}>
      <div className="note-card-header">
        <span className="note-card-category">{note.category || 'Inbox'}</span>
        <span className="note-card-date">{note.created_at}</span>
        <span className={`note-card-status ${note.ai_status}`}>
          {STATUS_LABELS[note.ai_status] || note.ai_status}
        </span>
        <button className={`note-card-favorite-btn${note.favorite ? ' active' : ''}`}
          onClick={() => void toggleFavorite()} title={note.favorite ? '取消收藏' : '收藏笔记'}
          aria-label={note.favorite ? '取消收藏' : '收藏笔记'} disabled={busy}>
          {note.favorite ? '★' : '☆'}
        </button>
        <button className="note-card-attach-btn" onClick={() => void onAttach()} title="附加文件">
          +
        </button>
        {
          <button
            className="note-card-delete-btn"
            onClick={() => setShowConfirm(true)}
            title="移至回收站"
          >
            ×
          </button>
        }
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

      <button
        className="note-card-detail-btn"
        onClick={() => onOpenDetail(note)}
        title="阅读或编辑这条笔记"
      >
        阅读 / 编辑
      </button>

      <ThoughtPanel owner={{kind:'note',id:note.id}} noteLabel={note.title||note.raw_content} compact />
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
            <p style={{ marginBottom: 16 }}>将这条笔记移至回收站？之后可恢复。</p>
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
                移至回收站
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
