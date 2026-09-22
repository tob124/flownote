import { createContext, useContext, useState, type ReactNode } from 'react'

type PageIndex = 0 | 1 | 2 | 3 | 4 | 5

interface AppCtx {
  pageIndex: PageIndex
  setPageIndex: (i: PageIndex) => void
  settingsValidated: boolean
  setSettingsValidated: (v: boolean) => void
}

const AppContext = createContext<AppCtx>({
  pageIndex: 0,
  setPageIndex: () => {},
  settingsValidated: false,
  setSettingsValidated: () => {}
})

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pageIndex, setPageIndex] = useState<PageIndex>(0)
  const [settingsValidated, setSettingsValidated] = useState(false)

  return (
    <AppContext.Provider value={{ pageIndex, setPageIndex, settingsValidated, setSettingsValidated }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppCtx {
  return useContext(AppContext)
}
