import { useEffect, useMemo, useRef, useState } from 'react'
import WikiList from '../components/WikiList'
import MarkdownViewer from '../components/MarkdownViewer'
import OutlinePanel from '../components/OutlinePanel'
import Minimap, { type MinimapState } from '../components/Minimap'
import CustomScrollbar from '../components/CustomScrollbar'
import type { Heading } from '../utils/markdown'
import { useWikis } from '../context/WikisContext'
import { useConfig } from '../context/ConfigContext'

function getContainer(): HTMLElement | null {
  return document.querySelector('.markdown-body') as HTMLElement | null
}

export default function WikisPage(): JSX.Element {
  const { currentContent, currentFile, currentIsSealed, loadList, selectFile } = useWikis()
  const { config, isLoaded, save } = useConfig()
  const [showOutline, setShowOutline] = useState(config.wiki_outline_open ?? true)
  const [showMinimap, setShowMinimap] = useState(config.wiki_minimap_open ?? true)
  const [diffLines, setDiffLines] = useState<Set<string> | null>(null)
  const [highlightDiff, setHighlightDiff] = useState(false)
  // 大纲标题由 MarkdownViewer 纯函数解析后上报，与正文各标题 id 一一对应
  const [headings, setHeadings] = useState<Heading[]>([])
  // 当前聚焦标题：随滚动实时更新，点击也更新它
  const [activeId, setActiveId] = useState<string | null>(null)
  const [map, setMap] = useState<MinimapState>({ positions: [], viewport: { top: 0, height: 0 } })
  // 封存当前活跃 wiki 前的确认弹窗
  const [sealConfirm, setSealConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string): void {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // 记忆：配置文件载入后同步上次的大纲 / 概览开关
  useEffect(() => {
    if (!isLoaded) return
    setShowOutline(config.wiki_outline_open ?? true)
    setShowMinimap(config.wiki_minimap_open ?? true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded])

  function toggleOutline(): void {
    const v = !showOutline
    setShowOutline(v)
    void save({ ...config, wiki_outline_open: v })
  }

  function toggleMinimap(): void {
    const v = !showMinimap
    setShowMinimap(v)
    void save({ ...config, wiki_minimap_open: v })
  }

  function measure(): void {
    const container = getContainer()
    if (!container) {
      setMap({ positions: [], viewport: { top: 0, height: 0 } })
      setActiveId(null)
      return
    }
    const scrollTop = container.scrollTop
    const clientH = container.clientHeight
    const scrollH = container.scrollHeight
    const scrollable = Math.max(1, scrollH - clientH)
    // 每个标题相对可滚动范围的比例（供 minimap 定位）
    const positions = headings.map((h) => {
      const el = container.querySelector(`[id="${CSS.escape(h.id)}"]`)
      const top = el
        ? el.getBoundingClientRect().top - container.getBoundingClientRect().top + scrollTop
        : 0
      return { id: h.id, topRatio: Math.max(0, Math.min(1, top / scrollable)) }
    })
    // 聚焦点 = 视口顶部附近最后一个标题（比阈值要更靠下一些）
    let cur: string | null = null
    for (const h of headings) {
      const el = container.querySelector(`[id="${CSS.escape(h.id)}"]`)
      if (!el) continue
      if (el.getBoundingClientRect().top - container.getBoundingClientRect().top <= 14) {
        cur = h.id
      }
    }
    setMap({
      positions,
      viewport: {
        top: Math.min(1, Math.max(0, scrollTop / scrollH)),
        height: scrollH > 0 ? Math.min(1, clientH / scrollH) : 0
      }
    })
    setActiveId(cur)
  }

  // 滚动 / 尺寸变化 / 切换文件时都重新测量聚焦点与 minimap 映射
  useEffect(() => {
    let frame = 0
    const schedule = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    measure()
    return () => {
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headings, currentFile, currentIsSealed, showMinimap])

  // Load latest-changes diff sidecar when selecting an active wiki file.
  // 已封存内容为历史快照，不参与 diff 高亮。
  useEffect(() => {
    setDiffLines(null)
    setHighlightDiff(false)
    if (!currentFile || currentIsSealed) return
    window.api.wikis
      .loadDiff(currentFile)
      .then((lines) => {
        if (lines && lines.length) setDiffLines(new Set(lines))
      })
      .catch(() => {})
  }, [currentFile, currentIsSealed])

  function navigate(id: string): void {
    setActiveId(id)
    const container = getContainer()
    if (!container) return
    const el = container.querySelector(`[id="${CSS.escape(id)}"]`)
    if (!el) return
    // 不依赖 scrollIntoView（它会连带滚动祖先容器、定位不稳），
    // 像 minimap 一样直接计算目标 scrollTop，保证精确命中。
    const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top
    const target = Math.max(
      0,
      container.scrollTop + offset - 12 // 留一点顶部间距，不和工具条贴边
    )
    container.scrollTo({ top: target, behavior: 'smooth' })
  }

  // 当前活跃 wiki 的诊断：{category}_{YYYY}_{MM}.md（已封存文件不匹配，视为无活跃项）
  const activeMatch = useMemo(() => {
    if (currentIsSealed || !currentFile) return null
    return currentFile.match(/^(.+)_(\d{4})_(\d{2})\.md$/) ?? null
  }, [currentFile, currentIsSealed])
  const currentCategory = activeMatch ? activeMatch[1] : null
  const currentMonth = activeMatch ? `${activeMatch[2]}_${activeMatch[3]}` : null

  // 真正执行封存
  async function doSeal(): Promise<void> {
    if (!currentCategory || !currentMonth || !currentFile) return
    const res = await window.api.wikis.seal(currentCategory, currentMonth)
    if (res) {
      setSealConfirm(false)
      setShowOutline(false)
      await loadList()
      await selectFile(res.fresh)
      showToast(`已封存「${res.sealed}」，并新建空 Wiki「${res.fresh}」继续累积`)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <WikiList />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {currentContent !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)'
            }}
          >
            <button
              className="quick-input-btn"
              onClick={toggleOutline}
              title="展开/隐藏侧边栏大纲"
            >
              {showOutline ? '◀ 收起大纲' : '☰ 大纲'}
            </button>
            <button
              className={`quick-input-btn${showMinimap ? ' active' : ''}`}
              onClick={toggleMinimap}
              title="展开/隐藏代码概览 (Minimap)"
            >
              {showMinimap ? '⤢ 概览' : '⤡ 概览'}
            </button>
            {!currentIsSealed && diffLines && diffLines.size > 0 && (
              <button
                className={`quick-input-btn${highlightDiff ? ' active' : ''}`}
                onClick={() => setHighlightDiff((h) => !h)}
                title="高亮显示最近一次更新的新增内容"
              >
                {highlightDiff ? '✦ 高亮最近改动' : '☆ 高亮最近改动'}
              </button>
            )}
            <span style={{ flex: 1 }} />
            {!currentIsSealed && currentCategory && (
              <button
                className="quick-input-btn"
                style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                onClick={() => setSealConfirm(true)}
                title="封存当前 Wiki（归档到所属月份并另起新 Wiki 累积）"
              >
                🗄 封存当前
              </button>
            )}
          </div>
        )}
        {currentIsSealed && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 16px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              fontSize: 12
            }}
          >
            📦 正在查看已封存内容——历史快照，点击列表中其它条目可切换
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex' }}>
            <MarkdownViewer
              content={currentContent}
              diffLines={diffLines}
              highlightDiff={highlightDiff}
              onHeadings={setHeadings}
            />
            <CustomScrollbar getContainer={getContainer} />
          </div>
          {showOutline && (
            <OutlinePanel
              headings={headings}
              activeId={activeId}
              onNavigate={navigate}
              onClose={() => setShowOutline(false)}
            />
          )}
          {showMinimap && (
            <Minimap
              headings={headings}
              map={map}
              activeId={activeId}
              onNavigate={navigate}
            />
          )}
        </div>

        {toast && (
          <div
            style={{
              position: 'absolute',
              bottom: 48,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-card)',
              border: '1px solid var(--accent)',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
              fontSize: 13,
              zIndex: 2000,
              maxWidth: '70%',
              animation: 'fadeIn 0.25s ease'
            }}
          >
            {toast}
          </div>
        )}
      </div>

      {sealConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000
          }}
          onClick={() => setSealConfirm(false)}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
              color: 'var(--text-primary)',
              width: 'min(420px, 90vw)',
              padding: 20
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700 }}>🗄 封存当前 Wiki</span>
              <button
                className="quick-input-btn"
                onClick={() => setSealConfirm(false)}
                title="关闭"
              >
                ×
              </button>
            </div>

            <div
              style={{
                fontSize: 13,
                lineHeight: 1.8,
                marginBottom: 12,
                padding: '6px 0'
              }}
            >
              将封存：<strong>{currentCategory}</strong>（{currentMonth?.replace('_', '年')}月）
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                marginBottom: 18,
                background: 'rgba(212,165,116,0.08)',
                border: '1px solid rgba(212,165,116,0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: 10
              }}
            >
              封存后，当前内容将归档到本月份的「📦 已封存」列表（随时可点击查看），
              并新建一个同名空 Wiki 重新累积。用于控制 AI 成本、保持可读。
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="quick-input-btn" onClick={() => setSealConfirm(false)}>
                取消
              </button>
              <button
                className="quick-input-btn"
                style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                onClick={() => void doSeal()}
              >
                确认封存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}