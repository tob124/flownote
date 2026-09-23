import { useApp, type PageId } from '../context/AppContext'
import '../styles/sidebar.css'

const PRIMARY: { id: PageId; label: string; mark: string }[] = [
  { id: 'notes', label: '记录与笔记', mark: '记' },
  { id: 'goals', label: '我的目标', mark: '标' },
  { id: 'artifacts', label: '我的成果', mark: '果' },
  { id: 'stats', label: '记录概览', mark: '览' }
]
const LIBRARY: { id: PageId; label: string; mark: string }[] = [
  { id: 'collections', label: '主题知识库', mark: '库' },
  { id: 'wikis', label: 'Wiki', mark: '知' },
  { id: 'dream', label: 'Dream', mark: '思' }
]
const TOOLS: { id: PageId; label: string; mark: string }[] = [
  { id: 'notifications', label: '通知', mark: '讯' },
  { id: 'settings', label: '设置', mark: '设' }
]

export default function Sidebar(): JSX.Element {
  const { pageId, setPageId } = useApp()
  const renderItems = (items: typeof PRIMARY): JSX.Element[] => items.map((item) => (
    <li key={item.id}>
      <button
        type="button"
        className={`sidebar-nav-item${pageId === item.id ? ' active' : ''}`}
        onClick={() => setPageId(item.id)}
        title={item.label}
        aria-current={pageId === item.id ? 'page' : undefined}
      >
        <span className="sidebar-nav-mark" aria-hidden="true">{item.mark}</span>
        <span className="sidebar-nav-label">{item.label}</span>
      </button>
    </li>
  ))
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="sidebar-header">
        <div className="sidebar-title">FlowNote</div>
        <div className="sidebar-subtitle">写下所见，推进所想</div>
      </div>
      <nav className="sidebar-nav-wrap">
        <div className="sidebar-group-label">日常</div>
        <ul className="sidebar-nav">{renderItems(PRIMARY)}</ul>
        <div className="sidebar-group-label">资料与回顾</div>
        <ul className="sidebar-nav">{renderItems(LIBRARY)}</ul>
        <div className="sidebar-nav-spacer" />
        <ul className="sidebar-nav sidebar-nav-tools">{renderItems(TOOLS)}</ul>
      </nav>
      <div className="sidebar-footer">PRIVATE WORKSPACE</div>
    </aside>
  )
}
