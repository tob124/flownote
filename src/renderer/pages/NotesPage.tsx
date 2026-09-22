import QuickInput from '../components/QuickInput'
import SearchBar from '../components/SearchBar'
import NoteList from '../components/NoteList'

export default function NotesPage(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <QuickInput />
      <SearchBar />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        <NoteList />
      </div>
    </div>
  )
}
