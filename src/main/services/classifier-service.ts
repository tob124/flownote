import { BrowserWindow } from 'electron'
import { loadAllNotes, updateNote } from '../store/note-store'
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
      if (!config.sync_dir || !config.api_key) return

      // 恢复卡在 processing 的笔记（上次运行意外中断/处理中途被打断），防止永久停留“处理中”
      // 此处不会与并发处理的 batch 冲突：processQueue 是串行 await 的，本轮开始时上一轮已结束，
      // 因此任何仍是 processing 的笔记都确认为残留状态，安全地回退到 pending 重新排队。
      const allNotes = loadAllNotes()
      let recovered = 0
      for (const n of allNotes) {
        if (n.ai_status === 'processing') {
          n.ai_status = 'pending'
          n.retry_count = 0
          updateNote(n)
          recovered++
        }
      }
      if (recovered > 0) {
        log.warn(`Recovered ${recovered} stuck 'processing' notes back to pending`)
        this.notifyUpdate()
      }

      // 按“先旧后新”顺序处理：旧笔记往往记的是“因”，新笔记可能记的是“果”，
      // 只有先整合旧笔记，wiki 才能完整承接因果逻辑。loadAllNotes 默认降序（新在前），
      // 因此在筛选待处理笔记时单独升序，仅影响处理顺序，不影响前端展示的降序。
      const pending = allNotes
        .filter((n) => n.ai_status === 'pending')
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 3)

      if (pending.length === 0) {
        // Check if we were poked during idle time; if so, re-scan immediately
        if (this._poke) {
          this._poke = false
          this.timerId = setTimeout(() => {
            void this.processQueue().finally(() => this.schedule())
          }, 1000)
        }
        return
      }

      this._poke = false

      // Mark as processing
      for (const note of pending) {
        note.ai_status = 'processing'
        updateNote(note)
      }
      this.notifyUpdate()

      const prompt = CLASSIFY_PROMPT.replace(
        '{categories}',
        JSON.stringify(config.categories, null, 0)
      )

      for (const note of pending) {
        try {
          const result = await callLlm(
            config.api_provider,
            config.api_key,
            prompt,
            note.raw_content,
            { isJson: true }
          )

          if (!result) {
            this.failNote(note)
            updateNote(note)
            this.notifyUpdate()
            continue
          }

          const parsed = safeParseJson(result)
          if (!parsed || !parsed.title) {
            this.failNote(note)
            updateNote(note)
            this.notifyUpdate()
            continue
          }

          note.title = String(parsed.title || '').trim()
          note.category = this.validCategory(
            String(parsed.category || ''),
            config.categories
          )
          note.summary = String(parsed.summary || '').trim()
          note.tags = Array.isArray(parsed.tags)
            ? parsed.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
            : []
          note.ai_status = 'done'
          note.retry_count = 0

          updateNote(note)
          this.notifyUpdate()

          // Generate wiki for classified non-Inbox notes
          if (note.category !== 'Inbox') {
            this.notifyWikiUpdating()
            try {
              await generateWiki(note, config.api_provider, config.api_key)
            } catch (ge) {
              log.error(`Wiki generation failed for note ${note.id}: ${ge}`)
              pushNotification({
                type: 'Wiki 生成',
                message: `「${note.category}」Wiki 更新失败：${String(ge).slice(0, 80)}`
              })
            }
            this.notifyWikiUpdate()
          }
        } catch (e) {
          log.error(`Classifier error on note ${note.id}: ${e}`)
          this.failNote(note)
          updateNote(note)
          this.notifyUpdate()
        }
      }

      // 一批笔记处理完成后，检查是否满足自动 dream 触发阈值
      if (this.win) {
        try {
          await maybeAutoDream(this.win)
        } catch (e) {
          log.error(`Auto-dream trigger failed: ${e}`)
        }
      }
    } catch (e) {
      log.error(`Classifier cycle error: ${e}`)
    }
  }

  private failNote(note: Note): void {
    note.retry_count++
    if (note.retry_count >= 3) {
      note.ai_status = 'failed'
      pushNotification({
        type: 'AI 预处理',
        message: `笔记「${note.title || note.raw_content.slice(0, 12)}…」重试 3 次后仍失败，请检查 API 配置`
      })
    }
  }

  private validCategory(category: string, validList: string[]): string {
    if (validList.includes(category)) return category
    return 'Inbox'
  }

  private notifyUpdate(): void {
    if (this.win) {
      this.win.webContents.send(IPC_CHANNELS.NOTES_UPDATED)
    }
  }

  private notifyWikiUpdating(): void {
    if (this.win) {
      this.win.webContents.send(IPC_CHANNELS.WIKIS_UPDATING)
    }
  }

  private notifyWikiUpdate(): void {
    if (this.win) {
      this.win.webContents.send(IPC_CHANNELS.WIKIS_UPDATED)
    }
  }
}
