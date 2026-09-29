import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Keep content mounted for drafts/subscriptions; closed panes leave layout immediately.
 * Only the outgoing surface is temporarily positioned over its former slot. */
export function SpatialPanel({ open, side, className = '', width, children }: {
  open: boolean; side: 'left' | 'right'; className?: string; width?: number; children: ReactNode
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const motion = useRef<Animation | null>(null)
  const previous = useRef(open)
  useLayoutEffect(() => {
    const el = ref.current!
    const changed = previous.current !== open
    previous.current = open
    el.inert = !open
    if (!changed) { el.hidden = !open; return }
    el.hidden = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const distance = side === 'left' ? '-100%' : '100%'
    const from = motion.current ? { transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity }
      : { transform: open && !reduced ? `translateX(${distance})` : 'none', opacity: open ? 0 : 1 }
    motion.current?.cancel()
    const to = { transform: !open && !reduced ? `translateX(${distance})` : 'translateX(0)', opacity: open ? 1 : 0 }
    if (!el.animate) { el.hidden = !open; return }
    const animation = el.animate([from, to], { duration: reduced ? 80 : open ? 240 : 200, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' })
    motion.current = animation
    animation.onfinish = () => { if (motion.current === animation) { el.hidden = !open; motion.current = null } }
  }, [open, side])
  useLayoutEffect(() => () => { motion.current?.cancel() }, [])
  return <div ref={ref} className={'spatial-panel ' + className} data-open={open} data-side={side} aria-hidden={!open} style={{ width }}>{children}</div>
}

export function Splitter({ label, value, min, max, reset, reverse = false, onChange }: {
  label: string; value: number; min: number; max: number; reset: number; reverse?: boolean; onChange: (v: number) => void
}): JSX.Element {
  const drag = useRef<{ x: number; value: number } | null>(null)
  const change = (n: number): void => onChange(Math.max(min, Math.min(max, n)))
  return <div role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0}
    className="workspace-splitter" title="拖动调整；方向键微调；双击或 Home 恢复默认"
    onDoubleClick={() => change(reset)} onKeyDown={e => {
      if (e.key === 'Home') { e.preventDefault(); change(reset) }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); change(value + (e.key === 'ArrowRight' ? 16 : -16) * (reverse ? -1 : 1)) }
    }} onPointerDown={e => { if (e.button !== 0 || drag.current) return; e.preventDefault(); e.currentTarget.focus({ preventScroll: true }); drag.current = { x: e.clientX, value }; e.currentTarget.setPointerCapture(e.pointerId) }}
    onPointerMove={e => { if (drag.current) change(drag.current.value + (e.clientX - drag.current.x) * (reverse ? -1 : 1)) }}
    onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }}
    onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}/>
}
