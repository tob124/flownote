import { ipcMain } from 'electron'
import { loadConfig } from '../store/config-store'
import { callLlm } from '../llm/llm-client'
import { POLISH_PROMPT } from '../llm/prompts'
import { IPC_CHANNELS } from '../../shared/types'

export function registerPolishIpc(): void {
  ipcMain.handle(IPC_CHANNELS.LLM_POLISH, async (_e, text: string): Promise<string | null> => {
    const config = loadConfig()
    if (!config.api_key || !text.trim()) return null
    return callLlm(config.api_provider, config.api_key, POLISH_PROMPT, text)
  })
}