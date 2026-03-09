import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_KEY = "flownote-config.json";

export interface FlowNoteConfig {
  syncDirectory: string;
  aiProvider: "Gemini" | "DeepSeek";
  apiKey: string;
}

const defaultConfig: FlowNoteConfig = {
  syncDirectory: "",
  aiProvider: "Gemini",
  apiKey: "",
};

const store = new LazyStore(STORE_KEY, { autoSave: true, defaults: defaultConfig as unknown as Record<string, unknown> });

export async function getConfig(): Promise<FlowNoteConfig> {
  const syncDirectory = (await store.get<string>("syncDirectory")) ?? defaultConfig.syncDirectory;
  const aiProvider = (await store.get<FlowNoteConfig["aiProvider"]>("aiProvider")) ?? defaultConfig.aiProvider;
  const apiKey = (await store.get<string>("apiKey")) ?? defaultConfig.apiKey;
  return { syncDirectory, aiProvider, apiKey };
}

export async function setConfig(partial: Partial<FlowNoteConfig>): Promise<void> {
  if (partial.syncDirectory !== undefined) await store.set("syncDirectory", partial.syncDirectory);
  if (partial.aiProvider !== undefined) await store.set("aiProvider", partial.aiProvider);
  if (partial.apiKey !== undefined) await store.set("apiKey", partial.apiKey);
  await store.save();
}

export async function hasSyncDirectory(): Promise<boolean> {
  const config = await getConfig();
  return Boolean(config.syncDirectory?.trim());
}
