import { Store } from '@tauri-apps/api/store';

export type AiProvider = 'Gemini' | 'DeepSeek';

export interface FlowNoteConfig {
  syncDirectory: string;
  aiProvider: AiProvider;
  apiKey: string;
}

const DEFAULT_CONFIG: FlowNoteConfig = {
  syncDirectory: 'notes',
  aiProvider: 'Gemini',
  apiKey: ''
};

const store = new Store('flow-note-config');

export async function getConfig(): Promise<FlowNoteConfig> {
  const stored = (await store.get('config')) as Partial<FlowNoteConfig> | undefined;
  return { ...DEFAULT_CONFIG, ...stored };
}

export async function saveConfig(config: FlowNoteConfig): Promise<void> {
  await store.set('config', config);
}

export function getDefaultConfig(): FlowNoteConfig {
  return { ...DEFAULT_CONFIG };
}
