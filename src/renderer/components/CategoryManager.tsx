import { useState } from 'react'
import { useConfig } from '../context/ConfigContext'

export default function CategoryManager(): JSX.Element {
  const { config, save } = useConfig()
  const [newCat, setNewCat] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  async function addCategory(): Promise<void> {
    const name = newCat.trim()
    if (!name || config.categories.includes(name)) return
    await save({ ...config, categories: [...config.categories, name] })
    setNewCat('')
  }

  async function deleteCategory(): Promise<void> {
    if (!selected || selected === 'Inbox') return
    await save({
      ...config,
      categories: config.categories.filter((c) => c !== selected)
    })
    setSelected(null)
  }

  async function mergeCategory(target: string): Promise<void> {
    if (!selected || selected === target) return
    // Note re-categorization will be handled by the backend classifier on next cycle
    await save({
      ...config,
      categories: config.categories.filter((c) => c !== selected)
    })
    setSelected(null)
  }

  const mergeTargets = config.categories.filter((c) => c !== selected && c !== 'Inbox')

  return (
    <div className="settings-section">
      <div className="settings-section-title">分类管理</div>

      <div className="settings-category-list">
        {config.categories.map((c) => (
          <div
            key={c}
            className={`settings-category-item${c === selected ? ' selected' : ''}`}
            onClick={() => setSelected(c === selected ? null : c)}
          >
            {c}
          </div>
        ))}
      </div>

      <div className="settings-row">
        <input
          className="settings-input"
          type="text"
          placeholder="新分类名称..."
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addCategory()
          }}
        />
        <button className="settings-btn" onClick={() => void addCategory()}>
          添加
        </button>
      </div>

      {selected && selected !== 'Inbox' && (
        <div className="settings-row">
          <select
            className="settings-select"
            onChange={(e) => {
              if (e.target.value) void mergeCategory(e.target.value)
            }}
            defaultValue=""
          >
            <option value="" disabled>
              合并到...
            </option>
            {mergeTargets.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="settings-btn danger" onClick={() => void deleteCategory()}>
            删除选中
          </button>
        </div>
      )}
    </div>
  )
}
