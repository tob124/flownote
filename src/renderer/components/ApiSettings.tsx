import { useConfig } from '../context/ConfigContext'

export default function ApiSettings(): JSX.Element {
  const { config, save } = useConfig()

  return (
    <div className="settings-section">
      <div className="settings-section-title">AI 接口</div>
      <div className="settings-row">
        <p>DeepSeek Flash · 官方 Search / Fetch 联网检索</p>
        {config.api_provider !== 'DeepSeek' && <p role="alert">旧配置使用了其他提供商，请切换并填写 DeepSeek API Key。<button onClick={()=>void save({...config,api_provider:'DeepSeek',api_key:''})}>切换至 DeepSeek Flash</button></p>}
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
