import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AppConfig } from '../../shared/types'
import { DEFAULT_CATEGORIES } from '../../shared/types'

const CONFIG_PATH = join(homedir(), '.flownote_config.json')

function defaultConfig(): AppConfig {
  return {
    sync_dir: '',
    api_provider: 'DeepSeek',
    api_key: '',
    categories: [...DEFAULT_CATEGORIES],
    theme: 'paper',
    notes_view: 'list',
    wiki_outline_open: true,
    wiki_minimap_open: true
  }
}

export function loadConfig(): AppConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const data = JSON.parse(raw)
    const defaults = defaultConfig()
    return { ...defaults, ...data }
  } catch {
    return defaultConfig()
  }
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}
