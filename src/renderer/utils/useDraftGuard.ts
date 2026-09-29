import { useEffect, useRef } from 'react'
export function useDraftGuard(flush: () => boolean): void {
  const latest = useRef(flush)
  latest.current = flush
  useEffect(() => {
    const guard = (event: Event): void => { if (!latest.current()) event.preventDefault() }
    const unload = (event: BeforeUnloadEvent): void => {
      if (!latest.current()) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('flownote:before-leave', guard)
    window.addEventListener('beforeunload', unload)
    return () => { window.removeEventListener('flownote:before-leave', guard); window.removeEventListener('beforeunload', unload) }
  }, [])
}
