import { mayLeave } from '../utils/workspace'
import { createContext, useContext, useState, type ReactNode } from 'react'

export type PageId = 'notes' | 'wikis' | 'dream' | 'stats' | 'settings' | 'notifications'

interface AppCtx {
  pageId: PageId
  setPageId: (id: PageId) => void
  settingsValidated: boolean
  setSettingsValidated: (value: boolean) => void
}

const AppContext = createContext<AppCtx>({
  pageId: 'notes',
  setPageId: () => {},
  settingsValidated: false,
  setSettingsValidated: () => {}
})

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pageId, updatePage] = useState<PageId>('notes')
  const setPageId = (id: PageId): void => { if(id === pageId || mayLeave()) updatePage(id) }
  const [settingsValidated, setSettingsValidated] = useState(false)
  return (
    <AppContext.Provider value={{ pageId, setPageId, settingsValidated, setSettingsValidated }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppCtx {
  return useContext(AppContext)
}
