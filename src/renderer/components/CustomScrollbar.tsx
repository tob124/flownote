import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const TRACK_WIDTH = 10
const MIN_THUMB = 34

interface Props {
  /** 返回真正的纵向可滚动容器（例如 .markdown-body） */
  getContainer: () => HTMLElement | null
}

/**
 * 自定义纵向滚动条：拖动把手时通过指针捕获（Pointer Capture），
 * 鼠标移动到屏幕任意位置都能持续生效，而不必始终停留在滚动条长方形区域内。
 * 使用方式：在一个 position:relative 的包裹层内，把本组件放在可滚动容器之上。
 */
export default function CustomScrollbar({ getContainer }: Props): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    offsetY: number
    container: HTMLElement
  } | null>(null)

  const [state, setState] = useState({ thumbH: 0, thumbTop: 0, visible: false })

  const update = (): void => {
    const container = getContainer()
    if (!container) {
      setState({ thumbH: 0, thumbTop: 0, visible: false })
      return
    }
    if (dragRef.current) return // 拖动中由 pointermove 直接驱动，避免抖动
    const { scrollTop, scrollHeight, clientHeight } = container
    const ratio = clientHeight >= scrollHeight ? 0 : scrollTop / (scrollHeight - clientHeight)
    const thumbH = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight)
    const thumbTop = (clientHeight - thumbH) * ratio
    setState({ thumbH, thumbTop, visible: scrollHeight > clientHeight })
  }

  useEffect(() => {
    let disposed = false
    let container: HTMLElement | null = null
    let schedule: (() => void) | null = null
    let ro: ResizeObserver | null = null
    let mo: MutationObserver | null = null

    const subscribe = (el: HTMLElement): void => {
      container = el
      schedule = (): void => update()
      el.addEventListener('scroll', schedule, { passive: true })
      ro = new ResizeObserver(schedule)
      ro.observe(el)
      mo = new MutationObserver(schedule)
      // 内容切换（加载别的 wiki / 封存切换）会替换正文 DOM，借此重新计算把手
      mo.observe(el, { childList: true, subtree: true })
      window.addEventListener('resize', schedule)
      update()
    }

    // 容器（.markdown-body）可能在初始渲染时还不存在（尚未选择 wiki），
    // 这里轮询等待其出现后一次性完成订阅。
    const found = getContainer()
    if (found) {
      subscribe(found)
    } else {
      const timer = window.setInterval(() => {
        if (disposed) {
          clearInterval(timer)
          return
        }
        const el = getContainer()
        if (el && !container) {
          subscribe(el)
          clearInterval(timer)
        }
      }, 200)
    }

    return () => {
      disposed = true
      if (container && schedule) container.removeEventListener('scroll', schedule)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', schedule as () => void)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const container = getContainer()
    const thumb = thumbRef.current
    // 必须在处理函数内同步取回 DOM 元素引用：React 合成事件在处理器返回后
    // 会把 currentTarget 置空，若在 move/up 闭包里再读它必然抛错。
    const track = e.currentTarget
    if (!container || !thumb || !track) return
    const containerTop = container.getBoundingClientRect().top
    const containerH = container.clientHeight
    const thumbH = Math.max(MIN_THUMB, (containerH / container.scrollHeight) * containerH)
    // 点到把手内部则保持不变；点到轨道则让把手中心跟随鼠标
    const thumbRect = thumb.getBoundingClientRect()
    const onThumb = e.clientY >= thumbRect.top && e.clientY <= thumbRect.bottom
    const offsetY = onThumb ? e.clientY - thumbRect.top : thumbH / 2

    dragRef.current = { offsetY, container }
    // 指针捕获：捕获后 pointermove 不再依赖把手的热区，
    // 鼠标移到屏幕任意位置都能持续驱动滚动，直到抬手为止。
    track.setPointerCapture(e.pointerId)

    const move = (moveEvt: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const c = drag.container
      const scrollable = c.scrollHeight - c.clientHeight
      const trackH = c.clientHeight
      const maxThumbY = trackH - thumbH
      let thumbY = moveEvt.clientY - containerTop - drag.offsetY
      thumbY = Math.max(0, Math.min(maxThumbY, thumbY))
      const ratio = maxThumbY > 0 ? thumbY / maxThumbY : 0
      c.scrollTop = scrollable * ratio
      // 拖动中直接移动把手 DOM，避免依赖 scroll 事件（会被 dragRef 屏蔽）
      thumb.style.top = `${thumbY}px`
    }

    const end = (): void => {
      dragRef.current = null
      track.removeEventListener('pointermove', move)
      track.removeEventListener('pointerup', end)
      track.removeEventListener('pointercancel', end)
      track.removeEventListener('lostpointercapture', end)
      update()
    }

    track.addEventListener('pointermove', move, { passive: true })
    track.addEventListener('pointerup', end)
    // 兜底：指针被系统取消 / 捕获被意外释放时也能干净收尾
    track.addEventListener('pointercancel', end)
    track.addEventListener('lostpointercapture', end)
  }

  if (!state.visible) return <div ref={trackRef} className="vscrollbar" style={{ width: 0 }} />

  return (
    <div
      ref={trackRef}
      className="vscrollbar"
      style={{ width: TRACK_WIDTH }}
      onPointerDown={handlePointerDown}
    >
      <div
        ref={thumbRef}
        className="vscrollbar-thumb"
        style={{ height: state.thumbH, top: state.thumbTop }}
      />
    </div>
  )
}