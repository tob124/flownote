import { useEffect, useRef } from 'react'
import type { Heading } from '../utils/markdown'
import '../styles/minimap.css'

export interface MinimapState {
  positions: { id: string; topRatio: number }[]
  viewport: { top: number; height: number }
}

interface Props {
  headings: Heading[]
  map: MinimapState
  activeId: string | null
  onNavigate: (id: string) => void
}

/** 仿 VSCode 的代码概览：右侧竖向渲染标题标记 + 当前视口窗口，点按/拖动即可滚动定位。 */
export default function Minimap({ headings, map, activeId, onNavigate }: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const up = (): void => {
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  function jumpTo(clientY: number): void {
    const root = rootRef.current
    const container = document.querySelector('.markdown-body') as HTMLElement | null
    if (!root || !container) return
    const rect = root.getBoundingClientRect()
    if (rect.height <= 0) return
    const scrollable = Math.max(0, container.scrollHeight - container.clientHeight)
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    container.scrollTop = ratio * scrollable
  }

  if (headings.length === 0) {
    return <div className="minimap" ref={rootRef} style={{ opacity: 0.4 }} />
  }

  return (
    <div
      ref={rootRef}
      className="minimap"
      onMouseDown={(e) => {
        dragging.current = true
        jumpTo(e.clientY)
      }}
      onMouseMove={(e) => {
        if (dragging.current) jumpTo(e.clientY)
      }}
      title="点击或拖动跳转到对应位置"
    >
      {map.viewport.height > 0 && (
        <div
          className="minimap-window"
          style={{
            top: `${map.viewport.top * 100}%`,
            height: `${Math.min(1, map.viewport.height) * 100}%`
          }}
        />
      )}
      {map.positions.map((p) => (
        <div
          key={p.id}
          className={'minimap-mark' + (p.id === activeId ? ' active' : '')}
          style={{ top: `${p.topRatio * 100}%` }}
          onMouseDown={(e) => {
            e.stopPropagation()
            dragging.current = true
            onNavigate(p.id)
          }}
          title={headings.find((h) => h.id === p.id)?.text ?? ''}
        />
      ))}
    </div>
  )
}