import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { atomicWrite } from '../src/main/store/atomic-file'
import { loadNote, saveNote } from '../src/main/store/note-store'
import { ClassifierService } from '../src/main/services/classifier-service'

const state = vi.hoisted(() => ({
  syncDir: '',
  callLlm: vi.fn(),
  pushNotification: vi.fn()
}))
vi.mock('../src/main/store/config-store', () => ({
  loadConfig: () => ({
    sync_dir: state.syncDir, api_key: 'fake', api_provider: 'DeepSeek', categories: ['工作']
  })
}))
vi.mock('../src/main/llm/llm-client', () => ({ callLlm: state.callLlm }))
vi.mock('../src/main/store/notifications-store', () => ({ pushNotification: state.pushNotification }))
vi.mock('../src/main/services/wiki-writer', () => ({ generateWiki: vi.fn() }))
vi.mock('../src/main/services/dream-worker', () => ({ maybeAutoDream: vi.fn() }))
vi.mock('../src/main/utils/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn() })
}))

let dir: string | null = null
function library(): string {
  dir = mkdtempSync(join(tmpdir(), 'flownote-classifier-'))
  state.syncDir = dir
  return dir
}
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
  state.syncDir = ''
  state.callLlm.mockReset()
  state.pushNotification.mockReset()
})

async function cycle(service: ClassifierService): Promise<void> {
  await (service as unknown as { processQueue: () => Promise<void> }).processQueue()
}

describe('classifier durability', () => {
  it('persists three failed attempts and stops retrying', async () => {
    const syncDir = library()
    const id = saveNote(syncDir, 'test')
    state.callLlm.mockResolvedValue(null)
    const service = new ClassifierService()
    for (let i = 0; i < 4; i++) await cycle(service)
    expect(loadNote(id, syncDir)?.retry_count).toBe(3)
    expect(loadNote(id, syncDir)?.ai_status).toBe('failed')
    expect(state.callLlm).toHaveBeenCalledTimes(3)
    expect(state.pushNotification).toHaveBeenCalledTimes(1)
  })

  it('ignores an AI answer for content edited while the request was in flight', async () => {
    const syncDir = library()
    const id = saveNote(syncDir, 'original')
    state.callLlm.mockImplementation(async () => {
      const file = join(syncDir, 'notes', `${id}.json`)
      atomicWrite(file, JSON.stringify({
        ...loadNote(id, syncDir), raw_content: 'user edit',
        attachments: [{ name: 'a.png', storedName: 'a.png', ext: 'png', size: 1 }]
      }))
      return JSON.stringify({ title: 'stale title', category: '工作', summary: '', tags: [] })
    })
    await cycle(new ClassifierService())
    const saved = loadNote(id, syncDir)!
    expect(saved.raw_content).toBe('user edit')
    expect(saved.attachments).toHaveLength(1)
    expect(saved.title).toBe('')
    expect(saved.ai_status).toBe('pending')
  })
})
