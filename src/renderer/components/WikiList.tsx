import { useWikis } from '../context/WikisContext'

interface WikiFileInfo {
  filename: string
  category: string
  yearMonth: string
  year: number
  month: number
  sealed: boolean
}

function parseWikiFilename(filename: string): WikiFileInfo | null {
  // 已封存: {category}_{YYYY_MM}_sealed_{timestamp}.md
  const sealedMatch = filename.match(/^(.+)_(\d{4})_(\d{2})_sealed_(.+)\.md$/)
  if (sealedMatch) {
    const [, category, yearStr, monthStr] = sealedMatch
    return {
      filename,
      category,
      yearMonth: `${yearStr}-${monthStr}`,
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
      sealed: true
    }
  }
  // 活跃: {category}_{YYYY_MM}.md
  const match = filename.match(/^(.+)_(\d{4})_(\d{2})\.md$/)
  if (!match) return null
  const [, category, yearStr, monthStr] = match
  return {
    filename,
    category,
    yearMonth: `${yearStr}-${monthStr}`,
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
    sealed: false
  }
}

function formatMonthLabel(year: number, month: number): string {
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  return `${year}年${monthNames[month - 1]}`
}

function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() + 1 === month
}

export default function WikiList(): JSX.Element {
  const { files, sealedFiles, currentFile, selectFile, selectSealed, wikiStatus } = useWikis()

  // 封存项并入各自原来所属的月份分组，与普通 wiki 一起展示
  const wikiFiles = [...files, ...sealedFiles]
    .map(parseWikiFilename)
    .filter((f): f is WikiFileInfo => f !== null)

  // 按月份分组
  const monthGroups = new Map<string, WikiFileInfo[]>()
  for (const file of wikiFiles) {
    const key = file.yearMonth
    if (!monthGroups.has(key)) {
      monthGroups.set(key, [])
    }
    monthGroups.get(key)!.push(file)
  }

  // 排序月份（当前月在前，其他按时间倒序）
  const sortedMonths = Array.from(monthGroups.keys()).sort((a, b) => {
    const [yearA, monthA] = a.split('-').map(Number)
    const [yearB, monthB] = b.split('-').map(Number)
    const isCurrentA = isCurrentMonth(yearA, monthA)
    const isCurrentB = isCurrentMonth(yearB, monthB)

    if (isCurrentA && !isCurrentB) return -1
    if (!isCurrentA && isCurrentB) return 1

    if (yearA !== yearB) return yearB - yearA
    return monthB - monthA
  })

  // 月份内分组：活跃的在前，已封存的排在后面（弱化展示，不喧宾夺主）
  for (const month of sortedMonths) {
    monthGroups.get(month)!.sort((a, b) => {
      if (a.sealed !== b.sealed) return a.sealed ? 1 : -1
      return a.category.localeCompare(b.category)
    })
  }

  function renderFileRow(file: WikiFileInfo): JSX.Element {
    const isActive = file.filename === currentFile
    const isSealed = file.sealed
    return (
      <div
        key={file.filename}
        onClick={() => void (isSealed ? selectSealed(file.filename) : selectFile(file.filename))}
        style={{
          padding: '8px 16px 8px 24px',
          cursor: 'pointer',
          color: isActive ? 'var(--accent)' : isSealed ? 'var(--text-muted)' : 'var(--text-secondary)',
          background: isActive ? 'var(--bg-hover)' : 'transparent',
          fontSize: 12,
          borderBottom: '1px solid var(--border-light)',
          borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: isSealed && !isActive ? 0.6 : 1,
          fontStyle: isSealed && !isActive ? 'italic' : 'normal',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (file.filename !== currentFile) {
            e.currentTarget.style.background = isSealed ? 'rgba(128,128,128,0.08)' : 'var(--bg-hover)'
            e.currentTarget.style.paddingLeft = '28px'
          }
        }}
        onMouseLeave={(e) => {
          if (file.filename !== currentFile) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.paddingLeft = '24px'
          }
        }}
      >
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 10,
            background: isActive
              ? 'var(--accent)'
              : isSealed
                ? 'transparent'
                : 'var(--bg-hover)',
            color: isActive ? 'white' : isSealed ? 'var(--text-muted)' : 'var(--accent)',
            border: isSealed && !isActive ? '1px dashed var(--border-light)' : 'none',
            fontWeight: 500,
            flexShrink: 0,
            transition: 'all 0.15s ease'
          }}
        >
          {isSealed ? `📦 ${file.category}` : file.category}
        </span>
        {isSealed && !isActive && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>已封存</span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        borderRight: '1px solid var(--border-light)',
        overflowY: 'auto',
        background: 'var(--bg-primary)'
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)'
        }}
      >
        <span>Wiki Files</span>
        {wikiStatus === 'updating' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontWeight: 400,
              textTransform: 'none',
              color: 'var(--accent)'
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ffa726',
                display: 'inline-block',
                animation: 'pulse 0.8s ease-in-out infinite'
              }}
            />
            更新中…
          </span>
        )}
        {wikiStatus === 'updated' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontWeight: 400,
              textTransform: 'none',
              color: '#4caf50'
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#4caf50',
                display: 'inline-block'
              }}
            />
            ✓ 已更新
          </span>
        )}
      </div>
      {wikiFiles.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          暂无 Wiki
        </div>
      ) : (
        sortedMonths.map((monthKey) => {
          const [year, month] = monthKey.split('-').map(Number)
          const isCurrent = isCurrentMonth(year, month)
          const monthFiles = monthGroups.get(monthKey)!

          return (
            <div key={monthKey}>
              <div
                style={{
                  padding: '10px 16px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: isCurrent ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isCurrent ? 'rgba(212, 165, 116, 0.08)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  borderLeft: isCurrent ? '3px solid var(--accent)' : '3px solid transparent'
                }}
              >
                <span>{formatMonthLabel(year, month)}</span>
                {isCurrent && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 10,
                      background: 'var(--accent)',
                      color: 'white',
                      fontWeight: 500,
                      letterSpacing: '0.3px'
                    }}
                  >
                    本月
                  </span>
                )}
              </div>
              {monthFiles.map(renderFileRow)}
            </div>
          )
        })
      )}
    </div>
  )
}