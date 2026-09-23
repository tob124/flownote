import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode
} from 'react'
import type { Note } from '../../shared/types'
import { EMPTY_NOTE_FILTERS, filterNotes, type NoteFilters } from '../../shared/note-filters'

interface NotesCtx {
  notes: Note[]
  filteredNotes: Note[]
  searchKeyword: string
  filters: NoteFilters
  setFilters: (filters: NoteFilters) => void
  clearFilters: () => void
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  setSearchKeyword: (kw: string) => void
  loadNotes: () => Promise<void>
  addNote: (content: string) => Promise<string | null>
  deleteNote: (id: string) => Promise<boolean>
}

const NotesContext = createContext<NotesCtx>({
  notes: [],
  filteredNotes: [],
  searchKeyword: '',
  filters: EMPTY_NOTE_FILTERS,
  setFilters: () => {},
  clearFilters: () => {},
  isLoading: false,
  isRefreshing: false,
  error: null,
  setSearchKeyword: () => {},
  loadNotes: async () => {},
  addNote: async () => null,
  deleteNote: async () => false
})

export function NotesProvider({ children }: { children: ReactNode }): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filters, setFilters] = useState<NoteFilters>(EMPTY_NOTE_FILTERS)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Debounce timer for high-frequency reloads (e.g. inbox creating many notes).
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSequence = useRef(0)

  const loadNotes = useCallback(async () => {
    const sequence = ++loadSequence.current
    setError(null)
    // Only show full loading on initial load (no notes cached)
    if (notes.length === 0) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    try {
      const result = searchKeyword
        ? await window.api.notes.search(searchKeyword)
        : await window.api.notes.loadAll()
      if (loadSequence.current === sequence) setNotes(result)
    } catch (e) {
      if (loadSequence.current === sequence) setError(String(e))
    } finally {
      if (loadSequence.current === sequence) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [searchKeyword, notes.length])

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      void loadNotes()
    }, 300)
  }, [loadNotes])

  const addNote = useCallback(async (content: string): Promise<string | null> => {
    try {
      const id = await window.api.notes.create(content)
      await loadNotes()
      await window.api.classifier.poke()
      return id
    } catch (e) {
      setError(String(e))
      return null
    }
  }, [loadNotes])

  const deleteNote = useCallback(async (id: string): Promise<boolean> => {
    try {
      const ok = await window.api.notes.delete(id)
      if (ok) await loadNotes()
      return ok
    } catch (e) {
      setError(String(e))
      return false
    }
  }, [loadNotes])

  // Listen for classifier updates
  useEffect(() => {
    const unsub = window.api.on('notes:updated', () => {
      void loadNotes()
    })
    return unsub
  }, [loadNotes])

  // Listen for inbox processing events
  useEffect(() => {
    const unsubs = [
      window.api.inboxEvents.onProcessingStart((count) => {
        console.log(`[Inbox] 开始处理 ${count} 条笔记`)
        setIsRefreshing(true)
      }),
      window.api.inboxEvents.onNoteCreated(() => {
        // 每创建一个笔记就触发一次防抖刷新，批量创建只刷新一次
        scheduleReload()
      }),
      window.api.inboxEvents.onProcessingEnd(() => {
        console.log('[Inbox] 处理完成')
        setIsRefreshing(false)
        scheduleReload()
      })
    ]
    return () => {
      unsubs.forEach((unsub) => unsub())
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current)
        reloadTimer.current = null
      }
    }
  }, [loadNotes, scheduleReload])

  // Load on mount
  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  // Keyword search is handled by the main process; explicit filters are local.
  const filteredNotes = useMemo(() => filterNotes(notes, filters), [notes, filters])

  return (
    <NotesContext.Provider
      value={{
        notes,
        filteredNotes,
        searchKeyword,
        filters,
        setFilters,
        clearFilters: () => setFilters(EMPTY_NOTE_FILTERS),
        isLoading,
        isRefreshing,
        error,
        setSearchKeyword,
        loadNotes,
        addNote,
        deleteNote
      }}
    >
      {children}
    </NotesContext.Provider>
  )
}

export function useNotes(): NotesCtx {
  return useContext(NotesContext)
}
