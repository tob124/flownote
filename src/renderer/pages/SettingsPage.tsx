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
import '../styles/thinking.css'

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
        <section className="thinking-settings">
          <h3>评论与思考</h3>
          <label><input type="checkbox" checked={config.ai_comments !== false}
            onChange={e=>void save({...config,ai_comments:e.target.checked})}/> 新建或修改笔记后自动评价（包括日常观点）</label>
          <label><input type="checkbox" checked={config.ai_auto_dream !== false}
            onChange={e=>void save({...config,ai_auto_dream:e.target.checked})}/> 达到阈值后自动 Dream，每天最多一次</label>
          <p>评论一般不联网；需要核查事实或纠正观点时会调用 DeepSeek 搜索。搜索和深入分析产生 API 用量；结果会显示 token 与搜索次数。</p>
          <p>纠正建议只有在你接纳后才会融入 Wiki，原始笔记保留。</p>
        </section>
        <section className="thinking-settings">
          <h3>旧模块数据</h3>
          <p>目标、成果与主题知识库已停用。已有文件仍保存在原目录，导出会逐字节保留文件及校验值。</p>
          <button className="settings-btn" onClick={()=>void window.api.thinking.exportLegacy().then(ok=>setMessage(ok?'旧数据已导出':'已取消导出')).catch(e=>setMessage(String(e)))}>导出旧模块数据</button>
        </section>

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
