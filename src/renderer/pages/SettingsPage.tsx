import { useState } from 'react'
import SyncDirSelector from '../components/SyncDirSelector'
import ApiSettings from '../components/ApiSettings'
import ThemeSelector from '../components/ThemeSelector'
import DreamSettings from '../components/DreamSettings'
import CategoryManager from '../components/CategoryManager'
import FontSelector from '../components/FontSelector'
import { useConfig } from '../context/ConfigContext'
import { useTheme } from '../context/ThemeContext'
import '../styles/settings.css'

export default function SettingsPage(): JSX.Element {
  const { config, save, load } = useConfig()
  const { setTheme } = useTheme()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSave(): Promise<void> {
    if (!config.sync_dir) {
      setMessage('请先设置数据同步目录')
      return
    }
    if (!config.api_key) {
      setMessage('请先设置 API Key')
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      await save(config)
      setTheme(config.theme)
      setMessage('配置已保存')
      await window.api.classifier.start()
    } catch (e) {
      setMessage(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-inner">
        <SyncDirSelector />
        <ApiSettings />
        <ThemeSelector />
        <FontSelector />
        <DreamSettings />
        <CategoryManager />

        <div className="settings-bottom-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="settings-btn primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
            {message && (
              <span
                style={{
                  fontSize: 12,
                  color: message.includes('失败') || message.includes('请先')
                    ? 'var(--danger)'
                    : 'var(--accent)'
                }}
              >
                {message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
