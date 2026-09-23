import { useEffect, useState } from 'react'
import { useNotes } from '../context/NotesContext'
import { useConfig } from '../context/ConfigContext'
import NoteCard from './NoteCard'
import NoteDetailDialog from './NoteDetailDialog'
import type { Note } from '../../shared/types'

const PAGE_SIZE = 15

export default function NoteList(): JSX.Element {
  const { filteredNotes, isLoading, isRefreshing, error, deleteNote, loadNotes } = useNotes()
  const { config, isLoaded, save } = useConfig()
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [grid, setGrid] = useState(config.notes_view === 'grid')
  const [detailNote, setDetailNote] = useState<Note | null>(null)

  // 记忆：配置文件载入后同步上次的单列/网格选择
  useEffect(() => {
    if (isLoaded) setGrid(config.notes_view === 'grid')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded])

  function toggleGrid(v: boolean): void {
    setGrid(v)
    void save({ ...config, notes_view: v ? 'grid' : 'list' })
  }

  // When the search keyword or note set changes, reset pagination to the top.
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [filteredNotes])

  // Full loading only on first load when no notes exist yet
  if (isLoading && filteredNotes.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>
        {error}
      </div>
    )
  }

  if (filteredNotes.length === 0 && !isLoading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
        没有符合当前搜索或筛选条件的笔记
      </div>
    )
  }

  const shown = filteredNotes.slice(0, visible)
  const hasMore = visible < filteredNotes.length

  return (
    <div>
      {isRefreshing && (
        <div
          style={{
            height: 2,
            background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
            animation: 'pulse 1.2s ease-in-out infinite'
          }}
        />
      )}
      <div className="note-list-viewbar">
        <span className="note-list-count">{filteredNotes.length} 篇</span>
        <div className="note-list-views">
          <button
            className={`note-list-view-btn${!grid ? ' active' : ''}`}
            onClick={() => toggleGrid(false)}
            title="单列列表"
          >
            ☰ 列表
          </button>
          <button
            className={`note-list-view-btn${grid ? ' active' : ''}`}
            onClick={() => toggleGrid(true)}
            title="双列网格"
          >
            ▦ 网格
          </button>
        </div>
      </div>
      <div className={grid ? 'note-list-grid' : 'note-list-column'}>
        {shown.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            grid={grid}
            onDelete={deleteNote}
            onRefresh={loadNotes}
            onOpenDetail={setDetailNote}
          />
        ))}
      </div>
      {hasMore && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <button className="settings-btn" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            加载更多（{filteredNotes.length - visible} 条剩余）
          </button>
        </div>
      )}
      {detailNote && (
        <NoteDetailDialog note={detailNote} onClose={() => setDetailNote(null)} onRefresh={loadNotes} />
      )}
    </div>
  )
}