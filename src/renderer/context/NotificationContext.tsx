import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { NotificationItem } from '../../shared/types'

interface NotifyCtx {
  items: NotificationItem[]
  unread: number
  push: (type: string, message: string) => void
  markAllRead: () => void
  markRead: (id: string) => void
}

const NotifyContext = createContext<NotifyCtx>({
  items: [],
  unread: 0,
  push: () => {},
  markAllRead: () => {},
  markRead: () => {}
})

export function NotificationProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<NotificationItem[]>([])

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await window.api.notifications.load()
      setItems(data)
    } catch {
      // ignore
    }
  }, [])

  const persist = useCallback((next: NotificationItem[]): void => {
    setItems(next)
    void window.api.notifications.save(next)
  }, [])

  // Initial load
  useEffect(() => {
    void load()
  }, [load])

  // 实时接收主进程推送的通知（分类失败、wiki 更新失败、autodream 触发等）
  useEffect(() => {
    const unsub = window.api.on('notifications:pushed', (arg) => {
      const item = arg as NotificationItem
      if (!item || typeof item.id !== 'string') return
      setItems((prev) => [item, ...prev].slice(0, 100))
    })
    return unsub
  }, [])

  const push = useCallback(
    (type: string, message: string): void => {
      persist([
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type,
          message,
          time: new Date().toISOString(),
          read: false
        },
        ...items
      ].slice(0, 100))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, persist]
  )

  const markAllRead = useCallback((): void => {
    persist(items.map((n) => (n.read ? n : { ...n, read: true })))
  }, [items, persist])

  const markRead = useCallback(
    (id: string): void => {
      persist(items.map((n) => (n.id === id ? { ...n, read: true } : n)))
    },
    [items, persist]
  )

  const unread = items.filter((n) => !n.read).length

  return (
    <NotifyContext.Provider
      value={{ items, unread, push, markAllRead, markRead }}
    >
      {children}
    </NotifyContext.Provider>
  )
}

export function useNotifications(): NotifyCtx {
  return useContext(NotifyContext)
}