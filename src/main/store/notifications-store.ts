import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import type { NotificationItem } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

const NOTIF_PATH = join(homedir(), '.flownote_notifications.json')

// 主进程持有当前窗口，pushNotification 时同步推送事件给渲染进程，使通知中心实时刷新，
// 而不只是等待下一次挂载时加载。
let sinkWindow: BrowserWindow | null = null

export function setNotificationWindow(win: BrowserWindow | null): void {
  sinkWindow = win
}

const MAX_ITEMS = 100

export function loadNotifications(): NotificationItem[] {
  try {
    if (!existsSync(NOTIF_PATH)) return []
    const raw = readFileSync(NOTIF_PATH, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function persist(items: NotificationItem[]): void {
  try {
    writeFileSync(NOTIF_PATH, JSON.stringify(items, null, 2), 'utf-8')
  } catch {
    // ignore write errors
  }
}

export function saveNotifications(items: NotificationItem[]): void {
  const trimmed = items.slice(0, MAX_ITEMS)
  persist(trimmed)
}

export function pushNotification(input: { type: string; message: string }): NotificationItem {
  const items = loadNotifications()
  const item: NotificationItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    message: input.message,
    time: new Date().toISOString(),
    read: false
  }
  persist([item, ...items].slice(0, MAX_ITEMS))
  if (sinkWindow && !sinkWindow.isDestroyed()) {
    sinkWindow.webContents.send(IPC_CHANNELS.NOTIFICATIONS_PUSHED, item)
  }
  return item
}