import { GoogleGenAI } from '@google/genai';
import { Note } from '../types';

// Web 预览环境的 Mock 存储前缀
const MOCK_WIKI_PREFIX = 'flownote_mock_wiki_';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const WORKSPACE_DIR_NAME = 'FlowNote_Workspace';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// 批量处理队列，按 category 归类
const wikiUpdateQueue: Record<string, Note[]> = {};
const updateTimers: Record<string, NodeJS.Timeout> = {};

// 延迟时间，设为 10 秒（为了演示效果快一点，实际生产环境可设为 1 分钟 60000）
const DEBOUNCE_DELAY = 10000;

function getWikiFileName(category: string) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${category}_${year}_${month}.md`;
}

async function readWiki(fileName: string): Promise<string> {
  if (!isTauri) {
    return localStorage.getItem(MOCK_WIKI_PREFIX + fileName) || '';
  }

  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  
  const docDir = await documentDir();
  const wikiPath = await join(docDir, WORKSPACE_DIR_NAME, 'wikis', fileName);
  
  if (await exists(wikiPath)) {
    try {
      return await readTextFile(wikiPath);
    } catch (e) {
      console.warn(`[FlowNote] Failed to read wiki ${fileName}`, e);
      return '';
    }
  }
  return '';
}

async function writeWiki(fileName: string, content: string) {
  if (!isTauri) {
    localStorage.setItem(MOCK_WIKI_PREFIX + fileName, content);
    return;
  }

  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  
  const docDir = await documentDir();
  const wikiPath = await join(docDir, WORKSPACE_DIR_NAME, 'wikis', fileName);
  
  await writeTextFile(wikiPath, content);
}

async function generateIncrementalWiki(category: string, oldSummary: string, newNotes: Note[]): Promise<string> {
  const newNotesText = newNotes.map(n => `ID: ${n.id}\n内容: ${n.raw_content}`).join('\n\n');
  
  const prompt = `
你是一个专业的知识整理维基编辑。
这里是一份【${category}】领域的旧有月度总结：
---
${oldSummary || "(暂无旧总结)"}
---
现在，用户新增了以下几条灵感/记录：
${newNotesText}

请将这些新记录无缝融合进旧总结中，重写一份逻辑连贯、分点清晰的 Markdown 长文。
要求：
- 如果新记录是对旧内容的补充，请在旧段落中扩写。如果是全新的子话题，请新建小标题。
- **极度重要：** 当你总结或提到新记录的内容时，必须在其后加上 Markdown 格式的引用链接指向原笔记，格式严格为：\`[引用](${newNotes[0]?.id || '笔记ID'})\`。
- 直接输出 Markdown 文本，不要在开头加 '好的' 等废话。
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview', // 使用 pro 模型以获得更好的长文重写和逻辑梳理能力
    contents: prompt,
  });

  if (!response.text) {
    throw new Error("Empty response from AI for Wiki generation");
  }

  // 移除可能存在的 Markdown 代码块标记
  let text = response.text.trim();
  if (text.startsWith('```markdown')) {
    text = text.replace(/^```markdown\n/, '').replace(/\n```$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  return text;
}

async function processWikiUpdate(category: string) {
  const notesToProcess = wikiUpdateQueue[category];
  if (!notesToProcess || notesToProcess.length === 0) return;

  // 清空当前队列，准备处理
  wikiUpdateQueue[category] = [];
  
  console.log(`[FlowNote] Generating wiki for ${category} with ${notesToProcess.length} new notes...`);

  try {
    const fileName = getWikiFileName(category);
    const oldSummary = await readWiki(fileName);
    
    const newSummary = await generateIncrementalWiki(category, oldSummary, notesToProcess);
    
    await writeWiki(fileName, newSummary);
    console.log(`[FlowNote] Successfully updated wiki: ${fileName}`);
  } catch (error) {
    console.error(`[FlowNote] Failed to update wiki for ${category}:`, error);
    // 失败了把笔记放回队列前部，等待下次重试
    wikiUpdateQueue[category] = [...notesToProcess, ...(wikiUpdateQueue[category] || [])];
  }
}

/**
 * 触发 Wiki 增量更新（带防抖机制）
 */
export function triggerWikiUpdate(note: Note) {
  if (note.category === 'Inbox') return;

  const category = note.category;
  
  if (!wikiUpdateQueue[category]) {
    wikiUpdateQueue[category] = [];
  }
  
  wikiUpdateQueue[category].push(note);

  // 防抖处理：如果短时间内有同分类的新笔记，重置定时器
  if (updateTimers[category]) {
    clearTimeout(updateTimers[category]);
  }

  updateTimers[category] = setTimeout(() => {
    processWikiUpdate(category);
  }, DEBOUNCE_DELAY);
}
