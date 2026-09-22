import { useDream } from '../context/DreamContext'
import { TIME_RANGE_OPTIONS } from '../../shared/types'

export default function DreamSettings(): JSX.Element {
  const { state, setThreshold, setTimeRange } = useDream()

  return (
    <div className="settings-section">
      <div className="settings-section-title">Auto-Dream</div>
      <div className="settings-row">
        <label
          style={{
            color: 'var(--text-secondary)',
            fontSize: 12,
            minWidth: 80
          }}
        >
          触发阈值
        </label>
        <input
          type="number"
          className="settings-input"
          min={3}
          max={100}
          value={state.dream_threshold}
          onChange={(e) => void setThreshold(Number(e.target.value))}
          style={{ maxWidth: 100 }}
        />
      </div>
      <div className="settings-row">
        <label
          style={{
            color: 'var(--text-secondary)',
            fontSize: 12,
            minWidth: 80
          }}
        >
          笔记时间范围
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <select
            className="settings-select"
            value={state.dream_time_range}
            onChange={(e) => void setTimeRange(e.target.value)}
          >
            {Object.entries(TIME_RANGE_OPTIONS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.3
            }}
          >
            将整理指定时间范围内已分类的笔记
          </span>
        </div>
      </div>
    </div>
  )
}
