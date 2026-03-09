import { getConfig } from './configStore';

export interface AiAnalysis {
  title: string;
  category: string;
  tags: string[];
}

function safeTitle(content: string): string {
  const firstLine = content.split(/\r?\n/)[0].trim();
  if (!firstLine) return 'Untitled thought';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function detectCategory(content: string): string {
  if (/wiki|research|learning/i.test(content)) return 'Research';
  if (/plan|next step|todo/i.test(content)) return 'Task';
  if (/idea|brainstorm|concept/i.test(content)) return 'Ideas';
  return 'Inbox';
}

function suggestTags(content: string): string[] {
  const words = content
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  const unique = Array.from(new Set(words));
  return unique.slice(0, 3);
}

export async function analyzeNote(content: string): Promise<AiAnalysis> {
  const config = await getConfig();
  const providerNote = config.aiProvider === 'DeepSeek' ? 'DeepSeek translation' : 'Gemini generative';
  const title = safeTitle(content);
  const category = detectCategory(content);
  const tags = suggestTags(content);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return {
    title: `${title} (${providerNote})`,
    category,
    tags
  };
}

export function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('safeParseJSON failed', error);
    return fallback;
  }
}
