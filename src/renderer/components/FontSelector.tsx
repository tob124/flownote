import { useCallback, useEffect, useState } from 'react'
import { useConfig } from '../context/ConfigContext'
import { useTheme } from '../context/ThemeContext'

interface FontInfo {
  file: string
  family: string
}

export default function FontSelector(): JSX.Element {
  const { config, save } = useConfig()
  const { applyFont, clearFont } = useTheme()
  const [fonts, setFonts] = useState<FontInfo[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setFonts(await window.api.fonts.list())
    } catch {
      setFonts([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleImport(): Promise<void> {
    const picked = await window.api.fonts.select()
    if (!picked) return
    const ok = await applyFont(picked.family, picked.file)
    await save({ ...config, font_file: picked.file, font_family: picked.family })
    setMsg(ok ? `已应用字体「${picked.family}」` : '字体导入成功，但加载失败，将使用默认字体')
    void refresh()
  }

  async function handleUse(f: FontInfo): Promise<void> {
    const ok = await applyFont(f.family, f.file)
    await save({ ...config, font_file: f.file, font_family: f.family })
    setMsg(ok ? `已应用字体「${f.family}」` : '字体加载失败')
  }

  async function handleDelete(f: FontInfo): Promise<void> {
    await window.api.fonts.delete(f.file)
    if (config.font_file === f.file) {
      clearFont()
      await save({ ...config, font_file: undefined, font_family: undefined })
      setMsg('已删除该字体并恢复默认')
    }
    void refresh()
  }

  async function handleReset(): Promise<void> {
    clearFont()
    await save({ ...config, font_file: undefined, font_family: undefined })
    setMsg('已恢复系统默认字体')
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">外观字体</div>
      <div className="settings-row">
        <div className="settings-row-label">自定义正文字体（可导入鸿蒙体、原神体等 .ttf/.otf）</div>
        <div className="settings-row-control">
          {config.font_file ? (
            <span style={{ fontSize: 12, color: 'var(--accent)' }}>
              当前：{config.font_file}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>当前：系统默认</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
        <button className="settings-btn primary" onClick={() => void handleImport()}>
          导入字体
        </button>
        <button className="settings-btn" onClick={() => void handleReset()}>
          恢复默认
        </button>
      </div>

      {fonts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fonts.map((f) => (
            <div
              key={f.file}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px'
              }}
            >
              <span style={{ fontSize: 12, fontFamily: `'${f.family}', var(--font-sans)` }}>
                {f.family}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="settings-btn" onClick={() => void handleUse(f)}>
                  使用
                </button>
                <button
                  className="settings-btn danger"
                  onClick={() => void handleDelete(f)}
                >
                  删除
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 8 }}>{msg}</div>
      )}
    </div>
  )
}