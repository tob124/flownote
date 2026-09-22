import { useNotes } from '../context/NotesContext'

export default function SearchBar(): JSX.Element {
  const { searchKeyword, setSearchKeyword } = useNotes()

  return (
    <div style={{ padding: '0 16px 12px' }}>
      <input
        type="text"
        placeholder="搜索笔记..."
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'inherit',
          fontSize: '13px',
          outline: 'none'
        }}
      />
    </div>
  )
}
