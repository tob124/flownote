import { limited } from './request-limit'
import { AI_MODELS, AI_LIMITS } from './models'
import { getLogger } from '../utils/logger'
import { retryOnFailure } from '../utils/helpers'

const log = getLogger('llm')

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'


const DEFAULT_DEEPSEEK_MODEL = AI_MODELS.deepseek


interface LlmOptions {
  isJson?: boolean
  timeout?: number
  model?: typeof AI_MODELS.deepseek
}

async function callDeepseek(
  apiKey: string,
  prompt: string,
  content: string,
  options: LlmOptions = {}
): Promise<string> {
  const startTime = Date.now()
  const { isJson = false, timeout = 1800000, model } = options
  const modelName = model || DEFAULT_DEEPSEEK_MODEL
  const safeContent = content.trim() || '请按系统提示词执行任务并生成内容。'

  log.info(`DeepSeek request: model=${modelName}, isJson=${isJson}, promptLength=${prompt.length}, contentLength=${safeContent.length}`)

  const body: Record<string, unknown> = {
    model: DEFAULT_DEEPSEEK_MODEL,
    max_tokens: AI_LIMITS.outputTokens,
    thinking: { type: 'disabled' },
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: safeContent }
    ]
  }

  if (isJson) {
    body.response_format = { type: 'json_object' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const duration = Date.now() - startTime
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      log.error(`DeepSeek HTTP ${resp.status} after ${duration}ms: ${errText.slice(0, 200)}`)
      throw new Error(`DeepSeek HTTP ${resp.status}: ${errText.slice(0, 200)}`)
    }

    const data = await resp.json() as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] }
    if(data.choices?.[0]?.finish_reason === 'length') throw new Error('达到供应商输出上限，结果未完整返回，请重试')
    const result = data.choices?.[0]?.message?.content
    if (typeof result !== 'string') throw new Error('DeepSeek returned no text')
    log.info(`DeepSeek response: status=${resp.status}, duration=${duration}ms, responseLength=${result.length}`)
    return result
  } finally {
    clearTimeout(timer)
  }
}

async function callLlmUnbounded(
  provider: 'DeepSeek' | 'Gemini',
  apiKey: string,
  prompt: string,
  content: string,
  options: LlmOptions = {}
): Promise<string | null> {
  if (!apiKey) {
    log.warn('LLM call skipped: no API key')
    return null
  }

  try {
    if (provider === 'DeepSeek') {
      const fn = retryOnFailure(callDeepseek, 3, 2)
      return await fn(apiKey, prompt, content, { timeout: 1800000, ...options })
    } else {
      log.error('当前仅支持 DeepSeek Flash，请在设置中配置 DeepSeek API Key')
      return null
    }
  } catch (e) {
    log.error(`LLM request failed after retries: ${e}`)
    return null
  }
}

export function callLlm(...args: Parameters<typeof callLlmUnbounded>): Promise<string | null> {
  return limited(() => callLlmUnbounded(...args))
}
