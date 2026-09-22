import { loadWiki, saveWiki } from '../store/wiki-store'
import { callLlm } from '../llm/llm-client'
import { WIKI_PROMPT } from '../llm/prompts'
import { getLogger } from '../utils/logger'
import { getSyncDir } from '../store/note-store'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Note } from '../../shared/types'

const log = getLogger('wiki')

// 审查队列数据结构
interface ReviewItem {
  id: string
  category: string
  month: string
  newContent: string
  oldContent: string
  reason: 'validation_failed' | 'length_protection'
  timestamp: string
  noteTitle: string
}

let reviewQueue: ReviewItem[] = []

function stripHeading(mdText: string): string {
  return mdText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => !line.startsWith('# '))
    .join('\n')
    .trim()
}

function enforceHeading(mdText: string, category: string): string {
  const body = stripHeading(mdText)
  return `# ${category}\n\n${body}`
}

/**
 * 验证内容完整性：检查新内容是否包含笔记标题或标签
 */
function validateWikiContent(content: string, note: Note): boolean {
  const lowerContent = content.toLowerCase()
  const title = note.title?.toLowerCase() || ''
  const tags = note.tags?.map((t) => t.toLowerCase()) || []

  // 检查标题是否出现在内容中
  if (title && lowerContent.includes(title)) {
    return true
  }

  // 检查是否有任意标签出现在内容中
  for (const tag of tags) {
    if (tag && lowerContent.includes(tag)) {
      return true
    }
  }

  return false
}

/**
 * 长度保护机制：比较新旧内容长度
 */
function checkContentLength(newContent: string, oldContent: string): boolean {
  const newLen = newContent.length
  const oldLen = oldContent.length

  // 当旧内容 > 500 字符且新内容 < 旧内容的 70% 时触发保护
  if (oldLen > 500 && newLen < oldLen * 0.7) {
    log.warn(
      `Content length protection triggered: old=${oldLen}, new=${newLen}, ratio=${(newLen / oldLen * 100).toFixed(1)}%`
    )
    return false
  }
  return true
}

/**
 * 将异常内容保存到 review 目录
 */
function saveToReview(
  category: string,
  month: string,
  content: string,
  reason: string
): void {
  const syncDir = getSyncDir()
  if (!syncDir) return

  const reviewDir = join(syncDir, 'wikis', 'review')
  if (!existsSync(reviewDir)) {
    mkdirSync(reviewDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${category}_${month}_${timestamp}_${reason}.md`
  writeFileSync(join(reviewDir, filename), content, 'utf-8')
  log.warn(`Content saved to review: ${filename}`)
}

/**
 * 将项目加入审查队列
 */
function addToReviewQueue(item: Omit<ReviewItem, 'id' | 'timestamp'>): void {
  const reviewItem: ReviewItem = {
    ...item,
    id: String(Date.now()),
    timestamp: new Date().toISOString()
  }
  reviewQueue.push(reviewItem)
  log.warn(
    `Review item added to queue: ${item.category}_${item.month}, reason=${item.reason}`
  )
}

/**
 * 获取审查队列
 */
export function getReviewQueue(): ReviewItem[] {
  return [...reviewQueue]
}

/**
 * 解决审查项（从队列中移除）
 */
export function resolveReview(id: string): boolean {
  const idx = reviewQueue.findIndex((item) => item.id === id)
  if (idx === -1) return false
  reviewQueue.splice(idx, 1)
  log.info(`Review item resolved: ${id}`)
  return true
}

export async function generateWiki(
  note: Note,
  provider: 'DeepSeek' | 'Gemini',
  apiKey: string
): Promise<void> {
  const now = new Date()
  const month = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`
  const category = note.category

  const rawSummary = loadWiki(`${category}_${month}.md`)
  const oldSummary = stripHeading(rawSummary)

  log.info(
    `Wiki generation started: ${category}_${month}, oldContentLength=${rawSummary.length}`
  )

  const prompt = WIKI_PROMPT.replace('{old_summary}', oldSummary)
    .replace('{new_content}', `**${note.title || '未命名'}**\n${note.raw_content}`)
    .replace('{category}', category)

  const result = await callLlm(provider, apiKey, prompt, '', { isJson: false })

  if (!result) {
    log.warn('Wiki generation returned empty')
    return
  }

  let newMd = result
    .replace(/^```[a-zA-Z]*\n/, '')
    .replace(/\n```$/, '')
    .trim()

  newMd = enforceHeading(newMd, category)

  log.info(`Wiki generation completed: newContentLength=${newMd.length}`)

  // 内容完整性验证
  const isValid = validateWikiContent(newMd, note)
  if (!isValid) {
    log.warn(
      `Content validation failed for ${category}_${month}: title or tags not found in content`
    )
    saveToReview(category, month, newMd, 'validation_failed')
    addToReviewQueue({
      category,
      month,
      newContent: newMd,
      oldContent: rawSummary,
      reason: 'validation_failed',
      noteTitle: note.title || '未命名'
    })
    // 验证失败时仍然保存，但记录警告
  }

  // 长度保护检查
  const lengthOk = checkContentLength(newMd, rawSummary)
  if (!lengthOk) {
    log.warn(
      `Content length protection for ${category}_${month}: saving to review instead of overwriting`
    )
    saveToReview(category, month, newMd, 'length_protection')
    addToReviewQueue({
      category,
      month,
      newContent: newMd,
      oldContent: rawSummary,
      reason: 'length_protection',
      noteTitle: note.title || '未命名'
    })
    // 长度保护触发时不覆盖原文件
    return
  }

  saveWiki(category, month, newMd)
  log.info(`Wiki saved for ${category}_${month}`)
}
