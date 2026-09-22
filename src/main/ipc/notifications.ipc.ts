import { ipcMain } from 'electron'
import { loadNotifications, saveNotifications } from '../store/notifications-store'
import { IPC_CHANNELS } from '../../shared/types'
import type { NotificationItem } from '../../shared/types'

export function registerNotificationsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.NOTIFICATIONS_LOAD, (): NotificationItem[] => loadNotifications())

  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_SAVE,
    (_e, items: NotificationItem[]): void => {
      if (Array.isArray(items)) saveNotifications(items)
    }
  )
}