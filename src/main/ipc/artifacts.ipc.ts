import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { loadConfig } from '../store/config-store'
import {
  ArtifactStoreError, artifactMarkdown, createArtifact, listArtifacts,
  renameArtifact, saveArtifactVersion
} from '../store/artifact-store'
import type { ArtifactInput, ArtifactRecord, ArtifactResult } from '../../shared/artifacts'
import { IPC_CHANNELS } from '../../shared/types'

function handle<T>(work: (syncDir: string) => T): ArtifactResult<T> {
  try {
    const dir = loadConfig().sync_dir
    if (!dir) return { ok: false, error: { code: 'INVALID', message: '请先设置同步目录' } }
    return { ok: true, value: work(dir) }
  } catch (reason) {
    const error = reason instanceof ArtifactStoreError ? reason : new ArtifactStoreError('IO', String(reason))
    return { ok: false, error: { code: error.code, message: error.message } }
  }
}
export function registerArtifactsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ARTIFACTS_LIST, (): ArtifactResult<ArtifactRecord[]> => handle(listArtifacts))
  ipcMain.handle(IPC_CHANNELS.ARTIFACTS_CREATE, (_e, input: ArtifactInput): ArtifactResult<ArtifactRecord> =>
    handle((dir) => createArtifact(dir, input)))
  ipcMain.handle(IPC_CHANNELS.ARTIFACTS_RENAME, (_e, id: string, revision: number, title: string): ArtifactResult<ArtifactRecord> =>
    handle((dir) => renameArtifact(dir, id, revision, title)))
  ipcMain.handle(IPC_CHANNELS.ARTIFACTS_SAVE_VERSION, (_e, id: string, revision: number, body: string, noteIds: string[]): ArtifactResult<ArtifactRecord> =>
    handle((dir) => saveArtifactVersion(dir, id, revision, body, noteIds)))
  ipcMain.handle(IPC_CHANNELS.ARTIFACTS_EXPORT, async (_e, id: string, versionId: string): Promise<ArtifactResult<boolean>> => {
    const result = handle((dir) => {
      const record = listArtifacts(dir).find((item) => item.id === id)
      if (!record) throw new ArtifactStoreError('NOT_FOUND', '成果已不存在')
      return { record, markdown: artifactMarkdown(record, versionId) }
    })
    if (!result.ok) return result
    try {
      const suggested = result.value.record.title.replace(/[<>:"/\|?*]/g, '_').slice(0, 80) || 'FlowNote 成果'
      const save = await dialog.showSaveDialog({ defaultPath: `${suggested}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
      if (save.canceled || !save.filePath) return { ok: true, value: false }
      writeFileSync(save.filePath, result.value.markdown, 'utf-8')
      return { ok: true, value: true }
    } catch (reason) { return { ok: false, error: { code: 'IO', message: String(reason) } } }
  })
}
