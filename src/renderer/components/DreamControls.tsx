import { useDream } from '../context/DreamContext'

export default function DreamControls(): JSX.Element {
  const { state, phase, error, startDream } = useDream()

  const inProgress = state.dream_in_progress || phase !== null

  let statusText = '就绪'
  if (error) statusText = `错误: ${error}`
  else if (phase) statusText = phase
  else if (state.dream_in_progress) statusText = 'Dream 运行中...'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-light)'
      }}
    >
      <input
        type="text"
        readOnly
        value={statusText}
        style={{
          flex: 1,
          padding: '8px 10px',
          background: 'var(--bg-input)',
          color: error ? 'var(--danger)' : 'var(--text-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'inherit',
          fontSize: 12,
          outline: 'none'
        }}
      />
      <button
        className="settings-btn primary"
        onClick={() => void startDream()}
        disabled={inProgress}
        style={{
          minWidth: 120,
          padding: '8px 16px',
          fontSize: 13,
          opacity: inProgress ? 0.5 : 1,
          cursor: inProgress ? 'not-allowed' : 'pointer'
        }}
      >
        开始 Dream
      </button>
    </div>
  )
}
