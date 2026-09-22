import { contextBridge, ipcRenderer } from 'electron'
import type { Note, AppConfig, DreamMeta, NotificationItem, NoteFile } from '../shared/types'

const api = {
  notes: {
    loadAll: (): Promise<Note[]> => ipcRenderer.invoke('notes:load-all'),
    search: (keyword: string): Promise<Note[]> => ipcRenderer.invoke('notes:search', keyword),
    create: (content: string): Promise<string> => ipcRenderer.invoke('notes:create', content),
    update: (note: Note): Promise<void> => ipcRenderer.invoke('notes:update', note),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('notes:delete', id)
  },
  wikis: {
    list: (): Promise<string[]> => ipcRenderer.invoke('wikis:list'),
    load: (filename: string): Promise<string> => ipcRenderer.invoke('wikis:load', filename),
    loadDiff: (filename: string): Promise<string[]> =>
      ipcRenderer.invoke('wikis:load-diff', filename),
    seal: (
      category: string,
      month: string
    ): Promise<{ sealed: string; fresh: string } | null> =>
      ipcRenderer.invoke('wikis:seal', category, month),
    listSealed: (): Promise<string[]> => ipcRenderer.invoke('wikis:list-sealed'),
    loadSealed: (filename: string): Promise<string> =>
      ipcRenderer.invoke('wikis:load-sealed', filename)
  },
  dream: {
    getState: (): Promise<DreamMeta> => ipcRenderer.invoke('dream:get-state'),
    start: (): Promise<void> => ipcRenderer.invoke('dream:start'),
    getReports: (): Promise<string[]> => ipcRenderer.invoke('dream:get-reports'),
    loadReport: (filename: string): Promise<string | null> =>
      ipcRenderer.invoke('dream:load-report', filename),
    setThreshold: (value: number): Promise<void> =>
      ipcRenderer.invoke('dream:set-threshold', value),
    setTimeRange: (value: string): Promise<void> =>
      ipcRenderer.invoke('dream:set-time-range', value)
  },
  config: {
    load: (): Promise<AppConfig> => ipcRenderer.invoke('config:load'),
    save: (cfg: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', cfg),
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('config:select-directory')
  },
  inbox: {
    process: (): Promise<void> => ipcRenderer.invoke('inbox:process')
  },
  inboxEvents: {
    onProcessingStart: (callback: (count: number) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, count: number): void =>
        callback(count)
      ipcRenderer.on('inbox:processing-start', handler)
      return () => ipcRenderer.removeListener('inbox:processing-start', handler)
    },
    onNoteCreated: (callback: (noteId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, noteId: string): void =>
        callback(noteId)
      ipcRenderer.on('inbox:note-created', handler)
      return () => ipcRenderer.removeListener('inbox:note-created', handler)
    },
    onProcessingEnd: (callback: () => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent): void =>
        callback()
      ipcRenderer.on('inbox:processing-end', handler)
      return () => ipcRenderer.removeListener('inbox:processing-end', handler)
    }
  },
  classifier: {
    start: (): Promise<void> => ipcRenderer.invoke('classifier:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('classifier:stop'),
    poke: (): Promise<void> => ipcRenderer.invoke('classifier:poke')
  },
  app: {
    confirmClose: (): Promise<boolean> => ipcRenderer.invoke('app:confirm-close')
  },
  polish: (text: string): Promise<string | null> =>
    ipcRenderer.invoke('llm:polish', text),
  fonts: {
    select: (): Promise<{ file: string; family: string } | null> =>
      ipcRenderer.invoke('fonts:select-file'),
    list: (): Promise<{ file: string; family: string }[]> => ipcRenderer.invoke('fonts:list'),
    delete: (file: string): Promise<void> => ipcRenderer.invoke('fonts:delete', file),
    getPath: (file: string): Promise<string | null> =>
      ipcRenderer.invoke('fonts:get-path', file)
  },
  files: {
    select: (): Promise<NoteFile[]> => ipcRenderer.invoke('files:select'),
    check: (storedNames: string[]): Promise<Record<string, boolean>> =>
      ipcRenderer.invoke('files:check', storedNames),
    open: (storedName: string): Promise<boolean> =>
      ipcRenderer.invoke('files:open', storedName),
    path: (storedName: string): Promise<string | null> =>
      ipcRenderer.invoke('files:get-path', storedName),
    attach: (noteId: string, files: NoteFile[]): Promise<boolean> =>
      ipcRenderer.invoke('notes:attach', noteId, files)
  },
  notifications: {
    load: (): Promise<NotificationItem[]> => ipcRenderer.invoke('notifications:load'),
    save: (items: NotificationItem[]): Promise<void> =>
      ipcRenderer.invoke('notifications:save', items)
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
