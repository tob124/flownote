import { newestFirst } from '../../shared/note-time'
import { BrowserWindow } from 'electron'
import { applyAiPatch, getSyncDir, hashNoteInput, loadAllNotesFrom, loadNote } from '../store/note-store'
import { loadConfig } from '../store/config-store'
import { callLlm } from '../llm/llm-client'
import { CLASSIFY_PROMPT } from '../llm/prompts'
import { safeParseJson } from '../utils/helpers'
import { getLogger } from '../utils/logger'
import { generateWiki } from './wiki-writer'
import { maybeAutoDream } from './dream-worker'
import { pushNotification } from '../store/notifications-store'
import type { Note } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

const log = getLogger('classifier')

export class ClassifierService {
  private timerId: NodeJS.Timeout | null = null
  private _poke = false
  private _running = false
  private win: BrowserWindow | null = null

  start(win?: BrowserWindow): void {
    if (this._running) { if (win) this.win=win; return }
    this._running = true
    if (win) this.win = win
    this.schedule()
  }

  stop(): void {
    this._running = false
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  poke(): void {
    this._poke = true
  }

  private schedule(): void {
    this.waitAndRetry(0)
  }

  private waitAndRetry(seconds: number): void {
    if (!this._running) return
    if (this._poke || seconds >= 15) {
      this.timerId = setTimeout(() => {
        void this.processQueue().finally(() => {
          if (this._running) this.waitAndRetry(0)
        })
      }, 0)
      return
    }
    this.timerId = setTimeout(() => this.waitAndRetry(seconds + 1), 1000)
  }

  private async processQueue(): Promise<void> {
    try {
      const config = loadConfig()
      const syncDir = config.sync_dir
      if (!syncDir || !config.api_key) return

      const allNotes = loadAllNotesFrom(syncDir)
      let recovered = 0
      for (const note of allNotes) {
        if (note.ai_status !== 'processing') continue
        const state = applyAiPatch(syncDir, note.id, hashNoteInput(note.raw_content), {
          ai_status: 'pending'
        })
        if (state === 'applied') {
          note.ai_status = 'pending'
          recovered++
        }
      }
      if (recovered > 0) {
        log.warn(`Recovered ${recovered} stuck 'processing' notes back to pending`)
        this.notifyUpdate()
      }

      const pending = allNotes
        .filter((note) => note.ai_status === 'pending')
        .sort((a, b) => newestFirst(b,a))
        .slice(0, 3)

      if (pending.length === 0) { this._poke = false; return }
      this._poke = false

      const inputs = new Map<string, string>()
      for (const note of pending) {
        const inputHash = hashNoteInput(note.raw_content)
        if (applyAiPatch(syncDir, note.id, inputHash, { ai_status: 'processing' }) === 'applied') {
          inputs.set(note.id, inputHash)
        }
      }
      this.notifyUpdate()

      const prompt = CLASSIFY_PROMPT.replace(
        '{categories}',
        JSON.stringify(config.categories, null, 0)
      )

      for (const note of pending) {
        const inputHash = inputs.get(note.id)
        if (!inputHash) continue
        try {
          const result = await callLlm(
            config.api_provider,
            config.api_key,
            prompt,
            note.raw_content,
            { isJson: true }
          )
          if (!result) {
            this.failNote(syncDir, note, inputHash)
            continue
          }
          const parsed = safeParseJson(result)
          if (!parsed || !parsed.title) {
            this.failNote(syncDir, note, inputHash)
            continue
          }

          const applied = applyAiPatch(syncDir, note.id, inputHash, {
            title: String(parsed.title || '').trim(),
            category: this.validCategory(String(parsed.category || ''), config.categories),
            summary: String(parsed.summary || '').trim(),
            tags: Array.isArray(parsed.tags)
              ? parsed.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
              : [],
            ai_status: 'done',
            retry_count: 0
          })
          this.notifyUpdate()
          if (applied !== 'applied') continue

          const latest = loadNote(note.id, syncDir)
          if (latest && latest.category !== 'Inbox' && getSyncDir() === syncDir) {
            this.notifyWikiUpdating()
            try {
              await generateWiki(latest, config.api_provider, config.api_key)
            } catch (error) {
              log.error(`Wiki generation failed for note ${note.id}: ${error}`)
              pushNotification({
                type: 'Wiki 生成',
                message: `「${latest.category}」Wiki 更新失败：${String(error).slice(0, 80)}`
              })
            }
            this.notifyWikiUpdate()
          }
        } catch (error) {
          log.error(`Classifier error on note ${note.id}: ${error}`)
          this.failNote(syncDir, note, inputHash)
        }
      }

      if (this.win && getSyncDir() === syncDir) {
        try {
          await maybeAutoDream(this.win)
        } catch (error) {
          log.error(`Auto-dream trigger failed: ${error}`)
        }
      }
    } catch (error) {
      log.error(`Classifier cycle error: ${error}`)
    }
  }

  private failNote(syncDir: string, note: Note, inputHash: string): void {
    const latest = loadNote(note.id, syncDir)
    if (!latest) return
    const attempts = latest.retry_count + 1
    const applied = applyAiPatch(syncDir, note.id, inputHash, {
      retry_count: attempts,
      ai_status: attempts >= 3 ? 'failed' : 'pending'
    })
    if (applied !== 'applied') return
    this.notifyUpdate()
    if (attempts >= 3) {
      pushNotification({
        type: 'AI 预处理',
        message: `笔记「${latest.title || latest.raw_content.slice(0, 12)}…」重试 3 次后仍失败，请检查 API 配置`
      })
    }
  }

  private validCategory(category: string, validList: string[]): string {
    return validList.includes(category) ? category : 'Inbox'
  }

  private notifyUpdate(): void {
    this.win?.webContents.send(IPC_CHANNELS.NOTES_UPDATED)
  }

  private notifyWikiUpdating(): void {
    this.win?.webContents.send(IPC_CHANNELS.WIKIS_UPDATING)
  }

  private notifyWikiUpdate(): void {
    this.win?.webContents.send(IPC_CHANNELS.WIKIS_UPDATED)
  }
}
