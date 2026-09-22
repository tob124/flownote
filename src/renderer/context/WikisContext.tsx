import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface WikisCtx {
  files: string[]
  sealedFiles: string[]
  currentFile: string | null
  currentContent: string | null
  currentIsSealed: boolean
  isLoading: boolean
  wikiStatus: 'idle' | 'updating' | 'updated'
  selectFile: (filename: string) => Promise<void>
  selectSealed: (filename: string) => Promise<void>
  loadList: () => Promise<void>
}

const WikisContext = createContext<WikisCtx>({
  files: [],
  sealedFiles: [],
  currentFile: null,
  currentContent: null,
  currentIsSealed: false,
  isLoading: false,
  wikiStatus: 'idle',
  selectFile: async () => {},
  selectSealed: async () => {},
  loadList: async () => {}
})

export function WikisProvider({ children }: { children: ReactNode }): JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [sealedFiles, setSealedFiles] = useState<string[]>([])
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [currentContent, setCurrentContent] = useState<string | null>(null)
  const [currentIsSealed, setCurrentIsSealed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [wikiStatus, setWikiStatus] = useState<'idle' | 'updating' | 'updated'>('idle')

  // 同时加载活跃与已封存的 wiki，封存项并入各自月份分组展示
  const loadList = useCallback(async () => {
    try {
      const [list, sealed] = await Promise.all([
        window.api.wikis.list(),
        window.api.wikis.listSealed()
      ])
      setFiles(list)
      setSealedFiles(sealed)
    } catch {
      // ignore
    }
  }, [])

  const selectFile = useCallback(async (filename: string) => {
    setIsLoading(true)
    setCurrentFile(filename)
    setCurrentIsSealed(false)
    try {
      const content = await window.api.wikis.load(filename)
      setCurrentContent(content)
    } catch {
      setCurrentContent(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const selectSealed = useCallback(async (filename: string) => {
    setIsLoading(true)
    setCurrentFile(filename)
    setCurrentIsSealed(true)
    try {
      const content = await window.api.wikis.loadSealed(filename)
      setCurrentContent(content)
    } catch {
      setCurrentContent(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Listen for wiki generation events
  useEffect(() => {
    const unsubUpdating = window.api.on('wikis:updating', () => {
      setWikiStatus('updating')
    })
    const unsubUpdated = window.api.on('wikis:updated', () => {
      void loadList().finally(() => {
        setWikiStatus('updated')
        setTimeout(() => setWikiStatus('idle'), 2500)
      })
    })
    return () => {
      unsubUpdating()
      unsubUpdated()
    }
  }, [loadList])

  useEffect(() => {
    void loadList()
  }, [loadList])

  return (
    <WikisContext.Provider
      value={{
        files,
        sealedFiles,
        currentFile,
        currentContent,
        currentIsSealed,
        isLoading,
        wikiStatus,
        selectFile,
        selectSealed,
        loadList
      }}
    >
      {children}
    </WikisContext.Provider>
  )
}

export function useWikis(): WikisCtx {
  return useContext(WikisContext)
}