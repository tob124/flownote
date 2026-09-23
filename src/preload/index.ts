import { contextBridge, ipcRenderer } from 'electron'
import type { Note, NotePatch, NotePatchResult, AppConfig, DreamMeta, NotificationItem, NoteFile } from '../shared/types'
import type { ArtifactInput, ArtifactRecord, ArtifactResult } from '../shared/artifacts'
import type { CollectionInput, CollectionRecord, CollectionResult } from '../shared/collections'
import type { CheckInInput, CommitmentInput, CommitmentStatus, DecisionInput, GoalInput, GoalPatch, GoalRecord, GoalResult } from '../shared/goals'

const api = {
  notes: {
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
  artifacts: {
    list: (): Promise<ArtifactResult<ArtifactRecord[]>> => ipcRenderer.invoke('artifacts:list'),
    create: (input: ArtifactInput): Promise<ArtifactResult<ArtifactRecord>> => ipcRenderer.invoke('artifacts:create', input),
    rename: (id: string, revision: number, title: string): Promise<ArtifactResult<ArtifactRecord>> => ipcRenderer.invoke('artifacts:rename', id, revision, title),
    saveVersion: (id: string, revision: number, body: string, noteIds: string[]): Promise<ArtifactResult<ArtifactRecord>> => ipcRenderer.invoke('artifacts:save-version', id, revision, body, noteIds),
    export: (id: string, versionId: string): Promise<ArtifactResult<boolean>> => ipcRenderer.invoke('artifacts:export', id, versionId)
  },
  collections: {
    list: (): Promise<CollectionResult<CollectionRecord[]>> => ipcRenderer.invoke('collections:list'),
    create: (input: CollectionInput): Promise<CollectionResult<CollectionRecord>> => ipcRenderer.invoke('collections:create', input),
    update: (id: string, revision: number, input: CollectionInput): Promise<CollectionResult<CollectionRecord>> => ipcRenderer.invoke('collections:update', id, revision, input),
    linkNote: (id: string, revision: number, noteId: string, linked: boolean): Promise<CollectionResult<CollectionRecord>> => ipcRenderer.invoke('collections:link-note', id, revision, noteId, linked),
    delete: (id: string, revision: number): Promise<CollectionResult<boolean>> => ipcRenderer.invoke('collections:delete', id, revision)
  },
  goals: {
    list: (): Promise<GoalResult<GoalRecord[]>> => ipcRenderer.invoke('goals:list'),
    create: (input: GoalInput): Promise<GoalResult<GoalRecord>> => ipcRenderer.invoke('goals:create', input),
    update: (id: string, revision: number, patch: GoalPatch): Promise<GoalResult<GoalRecord>> =>
      ipcRenderer.invoke('goals:update', id, revision, patch),
    addCommitment: (id: string, revision: number, input: CommitmentInput): Promise<GoalResult<GoalRecord>> =>
      ipcRenderer.invoke('goals:add-commitment', id, revision, input),
    updateCommitment: (id: string, revision: number, commitmentId: string, status: CommitmentStatus): Promise<GoalResult<GoalRecord>> =>
      ipcRenderer.invoke('goals:update-commitment', id, revision, commitmentId, status),
    addDecision: (id: string, revision: number, input: DecisionInput): Promise<GoalResult<GoalRecord>> =>
      ipcRenderer.invoke('goals:add-decision', id, revision, input),
    addCheckIn: (id: string, revision: number, input: CheckInInput): Promise<GoalResult<GoalRecord>> =>
      ipcRenderer.invoke('goals:add-checkin', id, revision, input),
    linkCollection: (id: string, revision: number, collectionId: string, linked: boolean): Promise<GoalResult<GoalRecord>> =>
      ipcRenderer.invoke('goals:link-collection', id, revision, collectionId, linked),
    linkNote: (id: string, revision: number, noteId: string, linked: boolean): Promise<GoalResult<GoalRecord>> =>
      ipcRenderer.invoke('goals:link-note', id, revision, noteId, linked)
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
