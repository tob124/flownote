import { useDream } from '../context/DreamContext'

export default function DreamReportList(): JSX.Element {
  const { reports, currentReport, selectReport } = useDream()

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        borderRight: '1px solid var(--border-light)',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}
      >
        Dream Reports
      </div>
      {reports.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          暂无报告
        </div>
      ) : (
        reports.map((f) => (
          <div
            key={f}
            onClick={() => void selectReport(f)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              color: f === currentReport ? 'var(--accent)' : 'var(--text-secondary)',
              background: f === currentReport ? 'var(--bg-hover)' : 'transparent',
              fontSize: 12,
              borderBottom: '1px solid var(--border-light)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {f}
          </div>
        ))
      )}
    </div>
  )
}
