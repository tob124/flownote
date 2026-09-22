import { useConfig } from '../context/ConfigContext'

export default function ApiSettings(): JSX.Element {
  const { config, save } = useConfig()

  return (
    <div className="settings-section">
      <div className="settings-section-title">AI 接口</div>
      <div className="settings-row">
        <select
          className="settings-select"
          value={config.api_provider}
          onChange={(e) =>
            void save({ ...config, api_provider: e.target.value as 'DeepSeek' | 'Gemini' })
          }
        >
          <option value="DeepSeek">DeepSeek</option>
          <option value="Gemini">Gemini</option>
        </select>
      </div>
      <div className="settings-row">
        <input
          className="settings-input"
          type="password"
          placeholder="输入你的 API Key..."
          value={config.api_key}
          onChange={(e) => void save({ ...config, api_key: e.target.value })}
        />
      </div>
    </div>
  )
}
