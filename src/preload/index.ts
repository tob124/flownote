import type { AiJob, Owner, Feedback, InsightView, DreamReport } from '../shared/insights'
import { contextBridge, ipcRenderer } from 'electron'
import type { Note, NotePatch, NotePatchResult, AppConfig, DreamMeta, NotificationItem, NoteFile } from '../shared/types'

const api = {
  thinking: {
    importPdf: (owner:Owner):Promise<boolean> => ipcRenderer.invoke('thinking:import-pdf',owner),
    view: (owner:Owner):Promise<InsightView> => ipcRenderer.invoke('thinking:view',owner),
    run: (id:string,kind:'comment'|'research'):Promise<AiJob> => ipcRenderer.invoke('thinking:run',id,kind),
    reply: (owner:Owner,text:string):Promise<AiJob> => ipcRenderer.invoke('thinking:reply',owner,text),
    action: (id:string,action:'cancel'|'retry'):Promise<void> => ipcRenderer.invoke('thinking:action',id,action),
    feedback: (owner:Owner,feedback:Feedback,id?:string):Promise<void> => ipcRenderer.invoke('thinking:feedback',owner,feedback,id),
    correction: (id:string,decision:'accept'|'deny'):Promise<void> => ipcRenderer.invoke('thinking:correction',id,decision),
    reports: ():Promise<DreamReport[]> => ipcRenderer.invoke('thinking:reports'),
    jobs: ():Promise<AiJob[]> => ipcRenderer.invoke('thinking:jobs'),
    dream: ():Promise<AiJob> => ipcRenderer.invoke('thinking:dream'),
    exportLegacy: ():Promise<boolean> => ipcRenderer.invoke('thinking:legacy-export')
  },
  notes: {
    createRecord: (content:string):Promise<Note> => ipcRenderer.invoke('notes:create-record',content),
    loadAll: (): Promise<Note[]> => ipcRenderer.invoke('notes:load-all'),
    search: (keyword: string): Promise<Note[]> => ipcRenderer.invoke('notes:search', keyword),
    create: (content: string): Promise<string> => ipcRenderer.invoke('notes:create', content),
    update: (note: Note): Promise<void> => ipcRenderer.invoke('notes:update', note),
    patch: (id: string, revision: number, patch: NotePatch): Promise<NotePatchResult> =>
      ipcRenderer.invoke('notes:patch', id, revision, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('notes:delete', id),
    trashList: (): Promise<Note[]> => ipcRenderer.invoke('notes:trash-list'),
    restore: (id: string): Promise<boolean> => ipcRenderer.invoke('notes:restore', id),
    deleteForever: (id: string): Promise<boolean> => ipcRenderer.invoke('notes:delete-forever', id)
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
    open: (noteId: string, storedName: string, reveal = false): Promise<{ok:boolean;error?:string}> =>
      ipcRenderer.invoke('files:open', noteId, storedName, reveal),
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
