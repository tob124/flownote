import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { DreamMeta } from '../../shared/types'

interface DreamCtx {
  state: DreamMeta
  phase: string | null
  reports: string[]
  currentReport: string | null
  currentContent: string | null
  error: string | null
  isLoading: boolean
  startDream: () => Promise<void>
  selectReport: (filename: string) => Promise<void>
  loadState: () => Promise<void>
  setThreshold: (value: number) => Promise<void>
  setTimeRange: (value: string) => Promise<void>
}

const defaults: DreamMeta = {
  last_dream_at: null,
  dream_in_progress: false,
  dream_threshold: 10,
  dream_time_range: 'this_month'
}

const DreamContext = createContext<DreamCtx>({
  state: defaults,
  phase: null,
  reports: [],
  currentReport: null,
  currentContent: null,
  error: null,
  isLoading: false,
  startDream: async () => {},
  selectReport: async () => {},
  loadState: async () => {},
  setThreshold: async () => {},
  setTimeRange: async () => {}
})

export function DreamProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<DreamMeta>(defaults)
  const [phase, setPhase] = useState<string | null>(null)
  const [reports, setReports] = useState<string[]>([])
  const [currentReport, setCurrentReport] = useState<string | null>(null)
  const [currentContent, setCurrentContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadState = useCallback(async () => {
    try {
      const st = await window.api.dream.getState()
      setState(st)
      const list = await window.api.dream.getReports()
      setReports(list)
    } catch {
      // ignore
    }
  }, [])

  const startDream = useCallback(async () => {
    setError(null)
    setPhase(null)
    try {
      await window.api.dream.start()
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const setThreshold = useCallback(async (value: number) => {
    setState((prev) => ({ ...prev, dream_threshold: value }))
    await window.api.dream.setThreshold(value)
  }, [])

  const setTimeRange = useCallback(async (value: string) => {
    setState((prev) => ({ ...prev, dream_time_range: value }))
    await window.api.dream.setTimeRange(value)
  }, [])

  const selectReport = useCallback(async (filename: string) => {
    setIsLoading(true)
    setCurrentReport(filename)
    try {
      const content = await window.api.dream.loadReport(filename)
      setCurrentContent(content)
    } catch {
      setCurrentContent(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Listen for dream events
  useEffect(() => {
    const unsubs: (() => void)[] = []

    unsubs.push(
      window.api.on('dream:phase-changed', (phaseStr: unknown) => {
        setPhase(String(phaseStr))
        setError(null)
      })
    )

    unsubs.push(
      window.api.on('dream:finished', () => {
        setPhase(null)
        setError(null)
        void loadState()
      })
    )

    unsubs.push(
      window.api.on('dream:error', (msg: unknown) => {
        setPhase(null)
        setError(String(msg))
        void loadState()
      })
    )

    return () => unsubs.forEach((u) => u())
  }, [loadState])

  useEffect(() => {
    void loadState()
  }, [loadState])

  return (
    <DreamContext.Provider
      value={{
        state,
        phase,
        reports,
        currentReport,
        currentContent,
        error,
        isLoading,
        startDream,
        selectReport,
        loadState,
        setThreshold,
        setTimeRange
      }}
    >
      {children}
    </DreamContext.Provider>
  )
}

export function useDream(): DreamCtx {
  return useContext(DreamContext)
}
