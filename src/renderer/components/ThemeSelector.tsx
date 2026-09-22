import { useConfig } from '../context/ConfigContext'
import { useTheme } from '../context/ThemeContext'

export default function ThemeSelector(): JSX.Element {
  const { config, save } = useConfig()
  const { setTheme } = useTheme()

  async function handleChange(theme: 'dark' | 'solar' | 'draft'): Promise<void> {
    setTheme(theme)
    await save({ ...config, theme })
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">界面主题</div>
      <div className="settings-row">
        <select
          className="settings-select"
          value={config.theme}
          onChange={(e) => void handleChange(e.target.value as 'dark' | 'solar' | 'draft')}
        >
          <option value="dark">Dark</option>
          <option value="solar">Solar</option>
          <option value="draft">Draft</option>
        </select>
      </div>
    </div>
  )
}
