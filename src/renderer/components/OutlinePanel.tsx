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

  if (headings.length === 0) {
    return (
      <div
        style={{
          width: 200,
          minWidth: 200,
          borderLeft: '1px solid var(--border-light)',
          background: 'var(--bg-primary)',
          padding: 12
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>无标题</div>
      </div>
    )
  }

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
          title="隐藏大纲"
        >
          ×
        </button>
      </div>
      <div style={{ padding: '6px 0' }}>
        {headings.map((h) => (
          <div
            key={h.id}
            onClick={() => onNavigate(h.id)}
            style={{
              padding: '4px 12px 4px ' + (12 + (h.level - 1) * 12) + 'px',
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
          </div>
        ))}
      </div>
    </div>
  )
}