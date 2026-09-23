import { useEffect, useState } from 'react'
import type { Note } from '../../shared/types'
import { useNotes } from '../context/NotesContext'
import QuickInput from '../components/QuickInput'
import SearchBar from '../components/SearchBar'
import NoteList from '../components/NoteList'
import '../styles/notes-page.css'

function TrashView({ onRestore }: { onRestore: () => Promise<void> }): JSX.Element {
  const [items, setItems] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      setError(null)
      setItems(await window.api.notes.trashList())
    } catch (reason) {
      setError(String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function restore(id: string): Promise<void> {
    setBusyId(id)
    try {
      if (!await window.api.notes.restore(id)) throw new Error('恢复失败，可能已有同名笔记')
      await Promise.all([refresh(), onRestore()])
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusyId(null)
    }
  }

  async function removeForever(id: string): Promise<void> {
    setBusyId(id)
    try {
      if (!await window.api.notes.deleteForever(id)) throw new Error('彻底删除失败')
      setConfirmId(null)
      await refresh()
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="notes-trash" aria-label="回收站">
      <div className="notes-trash-intro">
        <h2>回收站</h2>
        <p>移入回收站的笔记仍保存在同步目录，可逐条恢复。彻底删除无法在应用内撤销。</p>
      </div>
      {error && <p role="alert" className="notes-trash-error">{error}</p>}
      {loading ? <p>正在读取…</p> : items.length === 0 ? <p className="notes-trash-empty">回收站为空</p> : (
        <div className="notes-trash-list">
          {items.map((note) => (
            <article className="notes-trash-item" key={note.id}>
              <div className="notes-trash-copy">
                <strong>{note.title || note.raw_content.slice(0, 70) || '无标题笔记'}</strong>
                <span>{note.created_at} · {note.category || 'Inbox'}</span>
                <p>{note.summary || note.raw_content.slice(0, 140)}</p>
              </div>
              <div className="notes-trash-actions">
                <button disabled={busyId !== null} onClick={() => void restore(note.id)}>恢复</button>
                {confirmId === note.id ? (
                  <div className="notes-trash-confirm" role="group" aria-label="彻底删除确认">
                    <span>彻底删除这条笔记？</span>
                    <button disabled={busyId !== null} className="danger" onClick={() => void removeForever(note.id)}>确认删除</button>
                    <button disabled={busyId !== null} onClick={() => setConfirmId(null)}>取消</button>
                  </div>
                ) : (
                  <button disabled={busyId !== null} onClick={() => setConfirmId(note.id)}>彻底删除</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default function NotesPage(): JSX.Element {
  const [view, setView] = useState<'notes' | 'trash'>('notes')
  const { loadNotes } = useNotes()
  return (
    <div className="notes-page">
      <div className="notes-page-tabs" role="tablist" aria-label="笔记区域">
        <button role="tab" aria-selected={view === 'notes'} className={view === 'notes' ? 'active' : ''} onClick={() => setView('notes')}>笔记</button>
        <button role="tab" aria-selected={view === 'trash'} className={view === 'trash' ? 'active' : ''} onClick={() => setView('trash')}>回收站</button>
      </div>
      {view === 'notes' ? (
        <>
          <QuickInput />
          <SearchBar />
          <div className="notes-page-list"><NoteList /></div>
        </>
      ) : <TrashView onRestore={loadNotes} />}
    </div>
  )
}
