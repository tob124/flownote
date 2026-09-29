import { useApp, type PageId } from '../context/AppContext'
import {Icon,type IconName} from './ui/Controls'
import '../styles/sidebar.css'

const PRIMARY: { id: PageId; label: string; mark: IconName }[] = [
  { id: 'notes', label: '记录与笔记', mark: 'note' },
  { id: 'wikis', label: 'Wiki', mark: 'book' },
  { id: 'dream', label: 'Dream', mark: 'moon' }
]
const LIBRARY: typeof PRIMARY = [
  { id: 'stats', label: '记录概览', mark: 'chart' }
]
const TOOLS: typeof PRIMARY = [
  { id: 'notifications', label: '通知', mark: 'bell' },
  { id: 'settings', label: '设置', mark: 'settings' }
]

export default function Sidebar({onCollapse}:{onCollapse?:()=>void}): JSX.Element {
  const { pageId, setPageId } = useApp()
  const renderItems = (items: typeof PRIMARY): JSX.Element[] => items.map((item) => (
    <li key={item.id}>
      <button
        type="button"
        className={`sidebar-nav-item${pageId === item.id ? ' active' : ''}`}
        onClick={() => setPageId(item.id)}
        title={item.label}
        aria-label={item.label}
        aria-current={pageId === item.id ? 'page' : undefined}
      >
        <span className="sidebar-nav-mark" aria-hidden="true"><Icon name={item.mark}/></span>
        <span className="sidebar-nav-label">{item.label}</span>
      </button>
    </li>
  ))
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="sidebar-header">
        <div className="sidebar-title">FlowNote</div>
        <button className="navigation-collapse" aria-label="收起导航" title="收起导航" onClick={onCollapse}>‹</button>
        <div className="sidebar-subtitle">个人笔记与思考</div>
      </div>
      <nav className="sidebar-nav-wrap">
        <ul className="sidebar-nav">{renderItems(PRIMARY)}</ul>
        <div className="sidebar-group-label">回顾</div>
        <ul className="sidebar-nav">{renderItems(LIBRARY)}</ul>
        <div className="sidebar-nav-spacer" />
        <ul className="sidebar-nav sidebar-nav-tools">{renderItems(TOOLS)}</ul>
      </nav>
    </aside>
  )
}
