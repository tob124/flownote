import { mayLeave } from '../utils/workspace'
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { AppConfig } from '../../shared/types'
import { DEFAULT_CATEGORIES } from '../../shared/types'

interface ConfigCtx {
  config: AppConfig
  isLoaded: boolean
  save: (cfg: AppConfig) => Promise<void>
  load: () => Promise<void>
}

const defaultConfig: AppConfig = {
  sync_dir: '',
  api_provider: 'DeepSeek',
  api_key: '',
  categories: [...DEFAULT_CATEGORIES],
  theme: 'dark',
  notes_view: 'list',
  wiki_outline_open: true,
  wiki_minimap_open: true
}

const ConfigContext = createContext<ConfigCtx>({
  config: defaultConfig,
  isLoaded: false,
  save: async () => {},
  load: async () => {}
})

export function ConfigProvider({ children }: { children: ReactNode }): JSX.Element {
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [isLoaded, setIsLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const cfg = await window.api.config.load()
      setConfig(cfg)
      setIsLoaded(true)
    } catch {
      setIsLoaded(true)
    }
  }, [])

  const save = useCallback(async (cfg: AppConfig) => {
    if(cfg.sync_dir !== config.sync_dir && !mayLeave()) throw new Error('请先保存当前草稿')
    await window.api.config.save(cfg)
    setConfig(cfg)
  }, [config.sync_dir])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <ConfigContext.Provider value={{ config, isLoaded, save, load }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig(): ConfigCtx {
  return useContext(ConfigContext)
}
