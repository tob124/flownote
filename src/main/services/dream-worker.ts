import { BrowserWindow } from 'electron'
import { loadConfig } from '../store/config-store'
import {
  acquireDreamLock,
  releaseDreamLock,
  getNotesForDream,
  getNewNotesCount,
  loadDreamState,
  saveDreamReport
} from '../store/dream-store'
import { callLlm } from '../llm/llm-client'
import { DREAM_PROMPT } from '../llm/prompts'
import { getLogger } from '../utils/logger'
import { IPC_CHANNELS } from '../../shared/types'
import { pushNotification } from '../store/notifications-store'

const log = getLogger('dream')

/**
 * 自动触发 Autodream：当自上次 dream 以来新增的笔记数达到阈值时，自动开始一次 dream。
 * 由分类器在批次处理完成后调用。通过 dream_in_progress 锁避免与手动/其它自动触发重复。
 */
export async function maybeAutoDream(win: BrowserWindow): Promise<void> {
  try {
    const config = loadConfig()
    if (!config.sync_dir || !config.api_key) return
    const state = loadDreamState()
    if (state.dream_in_progress) return
    const count = getNewNotesCount()
    if (count >= state.dream_threshold) {
      log.info(
        `Auto-dream triggered: new notes (${count}) >= threshold (${state.dream_threshold})`
      )
      pushNotification({
        type: 'Autodream',
        message: `新增笔记已达 ${count} 条（≥阈值 ${state.dream_threshold}），已自动开始 Dream 整理`
      })
      await startDream(config.sync_dir, config.api_provider, config.api_key, win)
    } else {
      log.info(
        `Auto-dream check: new notes (${count}) < threshold (${state.dream_threshold})`
      )
    }
  } catch (e) {
    log.error(`Auto-dream check failed: ${e}`)
  }
}

export async function startDream(
  syncDir: string,
  provider: 'DeepSeek' | 'Gemini',
  apiKey: string,
  win: BrowserWindow
): Promise<void> {
  const send = (channel: string, ...args: unknown[]): void => {
    win.webContents.send(channel, ...args)
  }

  if (!acquireDreamLock()) {
    send(IPC_CHANNELS.DREAM_ERROR, 'Dream 已在运行中')
    return
  }

  try {
    // Phase 1: Gather
    send(IPC_CHANNELS.DREAM_PHASE_CHANGED, 'Gather: 扫描笔记...')
    const notes = getNotesForDream()
    log.info(`Dream started: found ${notes.length} notes for processing`)

    if (notes.length === 0) {
      send(IPC_CHANNELS.DREAM_ERROR, '时间范围内没有可整理的笔记')
      return
    }

    // 记录笔记日期分布
    const dateDistribution = notes.reduce((acc, n) => {
      const date = n.created_at
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    log.info(`Dream notes date distribution: ${JSON.stringify(dateDistribution)}`)

    const formatted = notes
      .map((n) => `**[${n.category}] ${n.title || '未命名'}**\n${n.raw_content}`)
      .join('\n\n---\n\n')

    // Phase 2: Consolidate
    send(IPC_CHANNELS.DREAM_PHASE_CHANGED, 'Consolidate: AI 整合分析中...')

    if (!apiKey) {
      pushNotification({ type: 'Dream', message: '未配置 API Key，无法开始 Dream' })
      send(IPC_CHANNELS.DREAM_ERROR, '未配置 API Key')
      return
    }

    const prompt = DREAM_PROMPT.replace('{dream_notes}', formatted)
    const report = await callLlm(provider, apiKey, prompt, '', {
      timeout: 300000,
      isJson: false
    })

    if (!report) {
      send(IPC_CHANNELS.DREAM_ERROR, 'AI 分析返回为空')
      return
    }

    // Phase 3: Prune
    send(IPC_CHANNELS.DREAM_PHASE_CHANGED, 'Prune: 保存报告...')

    const filename = saveDreamReport(report)
    if (!filename) {
      send(IPC_CHANNELS.DREAM_ERROR, '保存报告失败')
      return
    }

    send(IPC_CHANNELS.DREAM_FINISHED, filename)
    pushNotification({ type: 'Dream', message: `Dream 已完成，报告已保存：${filename}` })
    log.info(`Dream report saved: ${filename}`)
  } catch (e) {
    log.error(`Dream failed: ${e}`)
    pushNotification({ type: 'Dream', message: `Dream 过程出错：${String(e).slice(0, 120)}` })
    send(IPC_CHANNELS.DREAM_ERROR, `Dream 过程出错: ${e}`)
  } finally {
    releaseDreamLock()
  }
}
