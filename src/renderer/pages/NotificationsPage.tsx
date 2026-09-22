import { useNotifications } from '../context/NotificationContext'
import '../styles/notifications.css'

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const mon = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${mon}-${day} ${hh}:${mm}`
}

export default function NotificationsPage(): JSX.Element {
  const { items, unread, markAllRead } = useNotifications()

  return (
    <div className="notif-page">
      <div className="notif-page-header">
        <div className="notif-page-title">
          <span>🔔 通知中心</span>
          {unread > 0 && (
            <span className="notif-page-count">{unread} 条未读</span>
          )}
        </div>
        {unread > 0 && (
          <button className="notif-clear-btn" onClick={markAllRead}>
            全部已读
          </button>
        )}
      </div>
      <div className="notif-list">
        {items.length === 0 ? (
          <div className="notif-empty">暂无通知</div>
        ) : (
          items.map((n) => (
            <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`}>
              <div className="notif-item-head">
                <span className="notif-type">{n.type}</span>
                {!n.read && <span className="notif-dot">●</span>}
              </div>
              <div className="notif-msg">{n.message}</div>
              <div className="notif-time">{timeLabel(n.time)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}