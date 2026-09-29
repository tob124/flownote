import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { ConfigProvider, useConfig } from './context/ConfigContext'
import { NotesProvider } from './context/NotesContext'
import { WikisProvider } from './context/WikisContext'
import { DreamProvider } from './context/DreamContext'
import { NotificationProvider } from './context/NotificationContext'
import { SpatialPanel } from './components/ui/SpatialPanel'
import { Button } from './components/ui/Controls'
import Sidebar from './components/Sidebar'
import NotesPage from './pages/NotesPage'
import StatsPage from './pages/StatsPage'
import WikisPage from './pages/WikisPage'
import DreamPage from './pages/DreamPage'
import SettingsPage from './pages/SettingsPage'
import NotificationsPage from './pages/NotificationsPage'
import './styles/themes/dark.css'
import './styles/themes/solar.css'
import './styles/themes/draft.css'
import './styles/themes/paper.css'

function AppShell(): JSX.Element {
  const [focusMode,setFocusMode]=useState(false)
  const [navigationOpen,setNavigationOpen]=useState(()=>{try{return localStorage.getItem('flownote:navigation')!=='closed'}catch{return true}})
  const toggleNavigation=():void=>{setNavigationOpen(v=>{try{localStorage.setItem('flownote:navigation',v?'closed':'open')}catch{}return !v})}
  useEffect(()=>{const change=(e:Event):void=>setFocusMode((e as CustomEvent<boolean>).detail);window.addEventListener('flownote:focus-mode',change);return()=>window.removeEventListener('flownote:focus-mode',change)},[])
  const { pageId, setPageId } = useApp()
  const { config, isLoaded } = useConfig()
  const { setTheme, applyFont, clearFont } = useTheme()

  // Sync theme from config on load
  useEffect(() => {
    setTheme(config.theme)
  }, [config.theme, setTheme])

  // Apply custom font if configured (imported via Settings)
  useEffect(() => {
    if (!isLoaded) return
    if (config.font_file && config.font_family) {
      void applyFont(config.font_family, config.font_file)
    } else {
      clearFont()
    }
  }, [isLoaded, config.font_file, config.font_family, applyFont, clearFont])

  // Navigate to settings if no sync_dir (only after config is loaded)
  useEffect(() => {
    if (!isLoaded) return
    if (config.sync_dir) return
    setPageId('settings')
  }, [isLoaded, config.sync_dir, setPageId])

  function renderPage(): JSX.Element {
    switch (pageId) {
      case 'notes': return <NotesPage />
      case 'wikis': return <WikisPage />
      case 'dream': return <DreamPage />
      case 'stats': return <StatsPage />
      case 'settings': return <SettingsPage />
      case 'notifications': return <NotificationsPage />
      default: return <NotesPage />
    }
  }

  return (
    <div className="app-shell"
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}
    >
      <SpatialPanel open={!focusMode && navigationOpen} side="left" className="app-navigation"><Sidebar onCollapse={toggleNavigation}/></SpatialPanel>
      {!focusMode && !navigationOpen && <div className="navigation-rail"><Button variant="quiet" aria-label="展开导航" onClick={toggleNavigation}>☰</Button></div>}
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {renderPage()}
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <AppProvider>
      <ThemeProvider>
        <ConfigProvider>
          <NotificationProvider>
            <NotesProvider>
              <WikisProvider>
                <DreamProvider>
                  <AppShell />
                </DreamProvider>
              </WikisProvider>
            </NotesProvider>
          </NotificationProvider>
        </ConfigProvider>
      </ThemeProvider>
    </AppProvider>
  )
}
