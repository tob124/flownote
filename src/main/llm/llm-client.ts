import { getLogger } from '../utils/logger'
import { retryOnFailure } from '../utils/helpers'

const log = getLogger('llm')

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

interface LlmOptions {
  isJson?: boolean
  timeout?: number
  model?: string
}

async function callDeepseek(
  apiKey: string,
  prompt: string,
  content: string,
  options: LlmOptions = {}
): Promise<string> {
  const startTime = Date.now()
  const { isJson = false, timeout = 120000, model } = options
  const modelName = model || DEFAULT_DEEPSEEK_MODEL
  const safeContent = content.trim() || '请按系统提示词执行任务并生成内容。'

  log.info(`DeepSeek request: model=${modelName}, isJson=${isJson}, promptLength=${prompt.length}, contentLength=${safeContent.length}`)

  const body: Record<string, unknown> = {
    model: modelName,
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

    const data = await resp.json()
    const result = data.choices[0].message.content
    log.info(`DeepSeek response: status=${resp.status}, duration=${duration}ms, responseLength=${result.length}`)
    return result
  } finally {
    clearTimeout(timer)
  }
}

async function callGemini(
  apiKey: string,
  prompt: string,
  content: string,
  options: LlmOptions = {}
): Promise<string> {
  const startTime = Date.now()
  const { timeout = 30000, model } = options
  const modelName = model || DEFAULT_GEMINI_MODEL

  const url = GEMINI_ENDPOINT.replace('{model}', modelName) + `?key=${apiKey}`

  log.info(`Gemini request: model=${modelName}, promptLength=${prompt.length}, contentLength=${content.length}`)

  const body = {
    contents: [{ parts: [{ text: prompt + '\n\n' + content }] }]
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const duration = Date.now() - startTime
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      log.error(`Gemini HTTP ${resp.status} after ${duration}ms: ${errText.slice(0, 200)}`)
      throw new Error(`Gemini HTTP ${resp.status}: ${errText.slice(0, 200)}`)
    }

    const data = await resp.json()
    const result = data.candidates[0].content.parts[0].text
    log.info(`Gemini response: status=${resp.status}, duration=${duration}ms, responseLength=${result.length}`)
    return result
  } finally {
    clearTimeout(timer)
  }
}

export async function callLlm(
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
      return await fn(apiKey, prompt, content, { timeout: 120000, ...options })
    } else if (provider === 'Gemini') {
      const fn = retryOnFailure(callGemini, 3, 2)
      return await fn(apiKey, prompt, content, { timeout: 30000, ...options })
    } else {
      log.error(`Unknown LLM provider: ${provider}`)
      return null
    }
  } catch (e) {
    log.error(`LLM request failed after retries: ${e}`)
    return null
  }
}
