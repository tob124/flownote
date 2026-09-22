import { useConfig } from '../context/ConfigContext'

export default function SyncDirSelector(): JSX.Element {
  const { config, save } = useConfig()

  async function handleBrowse(): Promise<void> {
    const dir = await window.api.config.selectDirectory()
    if (dir) {
      await save({ ...config, sync_dir: dir })
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">数据同步目录</div>
      <div className="settings-row">
        <input
          className="settings-input"
          type="text"
          readOnly
          value={config.sync_dir || '(未设置)'}
          placeholder="选择数据存储目录..."
        />
        <button className="settings-btn" onClick={() => void handleBrowse()}>
          浏览...
        </button>
      </div>
    </div>
  )
}
