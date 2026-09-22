import { useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { ConfigProvider, useConfig } from './context/ConfigContext'
import { NotesProvider } from './context/NotesContext'
import { WikisProvider } from './context/WikisContext'
import { DreamProvider } from './context/DreamContext'
import { NotificationProvider } from './context/NotificationContext'
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

function AppShell(): JSX.Element {
  const { pageIndex, setPageIndex } = useApp()
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
    setPageIndex(4)
  }, [isLoaded, config.sync_dir, setPageIndex])

  function renderPage(): JSX.Element {
    switch (pageIndex) {
      case 0:
        return <NotesPage />
      case 1:
        return <WikisPage />
      case 2:
        return <DreamPage />
      case 3:
        return <StatsPage />
      case 4:
        return <SettingsPage />
      case 5:
        return <NotificationsPage />
      default:
        return <NotesPage />
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}
    >
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
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
