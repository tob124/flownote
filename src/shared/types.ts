export interface NoteFile {
  name: string
  storedName: string
  ext: string
  size: number
}

export interface Note {
  id: string
  raw_content: string
  created_at: string
  created_at_ms?: number
  updated_at_ms?: number
  revision?: number
  manual_fields?: Array<'title' | 'summary' | 'category' | 'tags'>
  favorite?: boolean
  /** Stable import-block identity, retained after a receipt is written. */
  capture_id?: string
  ai_status: 'pending' | 'processing' | 'done' | 'failed'
  retry_count: number
  title: string
  summary?: string
  category: string
  tags: string[]
  attachments?: NoteFile[]
}

export interface NotePatch {
  raw_content?: string
  title?: string
  summary?: string
  category?: string
  tags?: string[]
  attachments?: NoteFile[]
  favorite?: boolean
}
export type NotePatchResult =
  | { ok: true; value: Note }
  | { ok: false; error: { code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'IO'; message: string } }

export interface AppConfig {
  ai_comments?: boolean
  ai_auto_dream?: boolean
  sync_dir: string
  api_provider: 'DeepSeek' | 'Gemini'
  api_key: string
  categories: string[]
  theme: 'paper' | 'dark' | 'solar' | 'draft'
  font_file?: string
  font_family?: string
  /** 界面偏好开关记忆 */
  notes_view?: 'list' | 'grid'
  wiki_outline_open?: boolean
  wiki_minimap_open?: boolean
}

export interface NotificationItem {
  id: string
  type: string
  message: string
  time: string
  read: boolean
}

export interface DreamMeta {
  last_dream_at: string | null
  dream_in_progress: boolean
  dream_threshold: number
  dream_time_range: string
}

export const DEFAULT_CATEGORIES = ['个人', '工作', '想法', '项目', '学习']

export const DEFAULT_THRESHOLD = 10

export const TIME_RANGE_OPTIONS: Record<string, string> = {
  last_7_days: '近 7 天',
  last_30_days: '近 30 天',
  last_60_days: '近 60 天',
  last_120_days: '近 120 天',
  this_month: '本月',
  this_year: '本年',
  all: '全部'
}

export const IPC_CHANNELS = {
  NOTES_LOAD_ALL: 'notes:load-all',
  NOTES_SEARCH: 'notes:search',
  NOTES_CREATE: 'notes:create',
  NOTES_UPDATE: 'notes:update',
  NOTES_PATCH: 'notes:patch',
  NOTES_DELETE: 'notes:delete',
  NOTES_TRASH_LIST: 'notes:trash-list',
  NOTES_RESTORE: 'notes:restore',
  NOTES_DELETE_FOREVER: 'notes:delete-forever',
  NOTES_UPDATED: 'notes:updated',
  ARTIFACTS_LIST: 'artifacts:list',
  ARTIFACTS_CREATE: 'artifacts:create',
  ARTIFACTS_RENAME: 'artifacts:rename',
  ARTIFACTS_SAVE_VERSION: 'artifacts:save-version',
  ARTIFACTS_EXPORT: 'artifacts:export',
  COLLECTIONS_LIST: 'collections:list',
  COLLECTIONS_CREATE: 'collections:create',
  COLLECTIONS_UPDATE: 'collections:update',
  COLLECTIONS_LINK_NOTE: 'collections:link-note',
  COLLECTIONS_DELETE: 'collections:delete',
  GOALS_LIST: 'goals:list',
  GOALS_CREATE: 'goals:create',
  GOALS_UPDATE: 'goals:update',
  GOALS_ADD_COMMITMENT: 'goals:add-commitment',
  GOALS_UPDATE_COMMITMENT: 'goals:update-commitment',
  GOALS_ADD_DECISION: 'goals:add-decision',
  GOALS_ADD_CHECKIN: 'goals:add-checkin',
  GOALS_LINK_NOTE: 'goals:link-note',
  GOALS_LINK_COLLECTION: 'goals:link-collection',
  WIKIS_LIST: 'wikis:list',
  WIKIS_LOAD: 'wikis:load',
  WIKIS_SEAL: 'wikis:seal',
  WIKIS_LIST_SEALED: 'wikis:list-sealed',
  WIKIS_LOAD_SEALED: 'wikis:load-sealed',
  WIKIS_UPDATING: 'wikis:updating',
  WIKIS_UPDATED: 'wikis:updated',
  DREAM_GET_STATE: 'dream:get-state',
  DREAM_START: 'dream:start',
  DREAM_GET_REPORTS: 'dream:get-reports',
  DREAM_LOAD_REPORT: 'dream:load-report',
  DREAM_SET_THRESHOLD: 'dream:set-threshold',
  DREAM_SET_TIME_RANGE: 'dream:set-time-range',
  DREAM_PHASE_CHANGED: 'dream:phase-changed',
  DREAM_FINISHED: 'dream:finished',
  DREAM_ERROR: 'dream:error',
  CONFIG_LOAD: 'config:load',
  CONFIG_SAVE: 'config:save',
  CONFIG_SELECT_DIR: 'config:select-directory',
  INBOX_PROCESS: 'inbox:process',
  INBOX_PROCESSING_START: 'inbox:processing-start',
  INBOX_NOTE_CREATED: 'inbox:note-created',
  INBOX_PROCESSING_END: 'inbox:processing-end',
  CLASSIFIER_START: 'classifier:start',
  CLASSIFIER_STOP: 'classifier:stop',
  CLASSIFIER_POKE: 'classifier:poke',
  APP_CONFIRM_CLOSE: 'app:confirm-close',
  LLM_POLISH: 'llm:polish',
  FONTS_SELECT_FILE: 'fonts:select-file',
  FONTS_LIST: 'fonts:list',
  FONTS_DELETE: 'fonts:delete',
  FONTS_GET_PATH: 'fonts:get-path',
  FILES_SELECT: 'files:select',
  FILES_CHECK: 'files:check',
  FILES_OPEN: 'files:open',
  FILES_GET_PATH: 'files:get-path',
  NOTE_ATTACH: 'notes:attach',
  NOTIFICATIONS_LOAD: 'notifications:load',
  NOTIFICATIONS_SAVE: 'notifications:save',
  NOTIFICATIONS_PUSHED: 'notifications:pushed',
  WIKIS_LOAD_DIFF: 'wikis:load-diff'
} as const
