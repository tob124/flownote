import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import '../styles/sidebar.css'

const ITEMS = [
  { label: 'All Notes', icon: '📝' },
  { label: 'Wikis', icon: '📚' },
  { label: 'Dream', icon: '💭' },
  { label: 'Stats', icon: '🔥' },
  { label: 'Settings', icon: '⚙️' }
]

export default function Sidebar(): JSX.Element {
  const { pageIndex, setPageIndex } = useApp()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // 激活项滑动指示块的位置（相对 .sidebar-nav-wrap）
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)
  // 首次定位完成后再开启过渡动画，避免初次渲染时从顶部滑入
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let frame = 0
    const measure = (): void => {
      const wrap = wrapRef.current
      if (!wrap) return
      const active = wrap.querySelector<HTMLElement>('.sidebar-nav-item.active')
      if (!active) {
        setIndicator(null)
        return
      }
      setIndicator({ top: active.offsetTop, height: active.offsetHeight })
      // 稳定后开启过渡（等浏览器渲染出一次静态布局）
      requestAnimationFrame(() => setReady(true))
    }
    measure()
    const onResize = (): void => {
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frame)
    }
  }, [pageIndex])

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">FlowNote</div>
        <div className="sidebar-subtitle">捕捉灵感，整理思绪</div>
      </div>
      <div className="sidebar-nav-wrap" ref={wrapRef}>
        <div
          className={`sidebar-nav-indicator${ready ? ' is-ready' : ''}`}
          style={indicator ? { top: indicator.top, height: indicator.height } : undefined}
        />
        <ul className="sidebar-nav">
          {ITEMS.map((item, i) => (
            <li
              key={i}
              className={`sidebar-nav-item${pageIndex === i ? ' active' : ''}`}
              onClick={() => setPageIndex(i as 0 | 1 | 2 | 3 | 4)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        <div className="sidebar-divider" />
        <ul className="sidebar-nav">
          <li
            className={`sidebar-nav-item${pageIndex === 5 ? ' active' : ''} sidebar-nav-bottom`}
            onClick={() => setPageIndex(5)}
            title="通知中心"
          >
            <span className="sidebar-nav-icon">🔔</span>
            <span>通知</span>
          </li>
        </ul>
      </div>
      <div className="sidebar-footer">v2.9.0</div>
    </div>
  )
}