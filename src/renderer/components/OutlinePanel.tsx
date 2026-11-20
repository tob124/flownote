import type { Heading } from '../utils/markdown'

interface Props {
  headings: Heading[]
  /** 当前聚焦标题，由滚动位置实时驱动，点击也更新它 */
  activeId: string | null
  onNavigate: (id: string) => void
  onClose: () => void
}

export default function OutlinePanel({
  headings,
  activeId,
  onNavigate,
  onClose
}: Props): JSX.Element {

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        borderLeft: '1px solid var(--border-light)',
        overflowY: 'auto',
        background: 'var(--bg-primary)'
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span>大纲</span>
        <button
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 13
          }}
          onClick={onClose}
          aria-label="关闭 Wiki 大纲"
          title="隐藏大纲"
        >
          ×
        </button>
      </div>
      <div style={{ padding: '6px 0' }}>
        {!headings.length && <p className="wiki-outline-empty">正文没有标题</p>}
        {headings.map((h) => (
          <button
            type="button"
            key={h.id}
            onClick={() => onNavigate(h.id)}
            aria-current={activeId === h.id ? 'location' : undefined}
            style={{
              padding: '4px 12px 4px ' + (12 + (h.level - 1) * 12) + 'px',
              display: 'block',
              width: '100%',
              textAlign: 'start',
              border: 0,
              cursor: 'pointer',
              fontSize: 12,
              color: activeId === h.id ? 'var(--accent)' : 'var(--text-secondary)',
              borderLeft:
                activeId === h.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: activeId === h.id ? 'var(--bg-hover)' : 'transparent',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={h.text}
          >
            {h.text}
          </button>
        ))}
      </div>
    </div>
  )
}
