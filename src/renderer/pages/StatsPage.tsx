import { useEffect, useMemo, useState } from 'react'
import type { Note } from '../../shared/types'
import '../styles/stats.css'

const WEEKS = 26
const LEVELS = 5 // 0..4

function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

function formatStreak(days: number, hasToday: boolean): string {
  if (days <= 0) return '0 天'
  return `${days} 天${hasToday ? '（含今天）' : ''}`
}

export default function StatsPage(): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.notes
      .loadAll()
      .then(setNotes)
      .catch((e) => setError(String(e)))
  }, [])

  const { countByDate, stats, categories, maxCat } = useMemo(() => {
    const countByDate = new Map<string, number>()
    for (const n of notes) {
      const d = n.created_at
      if (d) countByDate.set(d, (countByDate.get(d) ?? 0) + 1)
    }

    const dates = Array.from(countByDate.keys()).sort()

    const todayKey = localDate(new Date())
    let streak = 0
    for (let i = 0; i < dates.length; i++) {
      const d = dates[dates.length - 1 - i]
      if (streak === 0 && d !== todayKey) {
        // streak already broken before today
        if (d !== addDays(todayKey, -i)) break
      } else if (streak === 0 && d === todayKey) {
        streak++
      } else if (streak > 0) {
        if (d === addDays(todayKey, -i)) streak++
        else break
      }
    }

    let longest = 0
    let cur = 0
    let prev: string | null = null
    for (const d of dates) {
      if (prev !== null && d === addDays(prev, 1)) cur++
      else cur = 1
      if (cur > longest) longest = cur
      prev = d
    }

    const last7 = Array.from({ length: 7 }).reduce((acc, _, i) => {
      return acc + (countByDate.get(addDays(todayKey, -i)) ?? 0)
    }, 0)

    const catMap = new Map<string, number>()
    for (const n of notes) {
      const c = n.category || 'Inbox'
      catMap.set(c, (catMap.get(c) ?? 0) + 1)
    }
    const categories = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])

    const stats = {
      total: notes.length,
      activeDays: dates.length,
      streak,
      hasStreakToday: countByDate.has(todayKey),
      longest,
      last7,
      today: countByDate.get(todayKey) ?? 0
    }

    const maxCat = categories.length > 0 ? categories[0][1] : 0

    return { countByDate, stats, categories, maxCat }
  }, [notes])

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>{error}</div>
    )
  }

  return (
    <div className="stats-page">
      <div className="stats-header">
        <div className="stats-title">统计</div>
        <div className="stats-subtitle">捕捉与整理概览</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">全部笔记</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.activeDays}</div>
          <div className="stat-label">活跃天数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.last7}</div>
          <div className="stat-label">近 7 天</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.streak}</div>
          <div className="stat-label">连续记录</div>
        </div>
      </div>

      <div className="stats-extra">
        <span>最长连续：{formatStreak(stats.longest, false)}</span>
        <span>今日：{stats.today} 条</span>
      </div>

      <div className="stats-section-title">记录热力图</div>
      <div className="heatmap-wrap">
        <div className="heatmap-scroll">
          <ContributionHeatmap countByDate={countByDate} />
        </div>
        <div className="heatmap-legend">
          <span>少</span>
          {Array.from({ length: LEVELS }).map((_, i) => (
            <i key={i} className={`heat-cell lv${i}`} />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="stats-section-title">分类分布</div>
      {categories.length === 0 ? (
        <div className="stats-empty">暂无笔记</div>
      ) : (
        <div className="cat-bars">
          {categories.map(([c, n]) => (
            <div key={c} className="cat-row">
              <span className="cat-name">{c}</span>
              <div className="cat-bar-track">
                <div
                  className="cat-bar-fill"
                  style={{ width: `${maxCat > 0 ? (n / maxCat) * 100 : 0}%` }}
                />
              </div>
              <span className="cat-count">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContributionHeatmap({ countByDate }: { countByDate: Map<string, number> }): JSX.Element {
  // 生成从过去 WEEKS 周到今天的日期网格（7 行 × WEEKS 列）
  const cells = useMemo(() => {
    const today = localDate(new Date())
    // 结束于今天所在周的周日，作为最右侧列，保证今天在最后一列
    let end = today
    const endD = new Date(`${today}T00:00:00`)
    const dow = endD.getDay() // 0=Sun
    end = addDays(localDate(endD), 6 - dow)

    const start = addDays(end, -(WEEKS - 1) * 7)
    const grid: { date: string; count: number }[][] = [] // grid[weekIndex][dayIndex]
    for (let w = 0; w < WEEKS; w++) {
      const col: { date: string; count: number }[] = []
      for (let d = 0; d < 7; d++) {
        const key = addDays(start, w * 7 + d)
        col.push({ date: key, count: countByDate.get(key) ?? 0 })
      }
      grid.push(col)
    }
    return grid
  }, [countByDate])

  const todayKey = localDate(new Date())

  return (
    <div className="heatmap-grid">
      {cells.map((col, w) => (
        <div key={w} className="heat-week">
          {col.map((cell) => {
            const level =
              cell.count === 0
                ? 0
                : cell.count === 1
                  ? 1
                  : cell.count <= 3
                    ? 2
                    : cell.count <= 7
                      ? 3
                      : 4
            const title = `${cell.date}: ${cell.count} 条${cell.date === todayKey ? '（今天）' : ''}`
            return <i key={cell.date} className={`heat-cell lv${level}`} title={title} />
          })}
        </div>
      ))}
    </div>
  )
}