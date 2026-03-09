import { GoogleGenAI, Type } from '@google/genai';
import { Note } from '../types';
import { loadNotes, updateNote } from './fsService';
import { triggerWikiUpdate } from './wikiService';

const CATEGORIES = ["Inbox", "Tech", "Personal", "Work", "Ideas"];

// 初始化 Gemini API
// 在 AI Studio 预览环境中，GEMINI_API_KEY 会被自动注入到 process.env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface AIAnalysisResult {
  title: string;
  category: string;
  tags: string[];
}

/**
 * 安全解析 JSON，剥离 Markdown 标记或多余的文本
 */
function safeParseJSON(text: string): AIAnalysisResult {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch (e) {
    // 如果失败，尝试用正则提取大括号内的内容
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        console.warn("[FlowNote] Failed to parse extracted JSON:", match[0]);
        throw new Error("Invalid JSON format in AI response");
      }
    }
    console.warn("[FlowNote] No JSON object found in AI response:", text);
    throw new Error("No JSON object found in AI response");
  }
}

/**
 * 调用大模型分析笔记内容
 */
async function analyzeNote(raw_content: string): Promise<AIAnalysisResult> {
  const prompt = `
You are an intelligent note organizer. Analyze the following note content and extract a title, category, and tags.
Return ONLY a valid JSON object. Do not include any markdown formatting like \`\`\`json.

Rules:
1. "title": A short, concise title for the note (max 50 characters).
2. "category": MUST be exactly one of the following: ${CATEGORIES.map(c => `"${c}"`).join(', ')}. If none fit perfectly, use "Inbox".
3. "tags": An array of 1 to 3 relevant tags (lowercase, single words).

Note content:
"""
${raw_content}
"""
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { type: Type.STRING },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["title", "category", "tags"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Empty response from AI");
  }

  return safeParseJSON(response.text);
}

// 标记队列是否正在运行，防止并发执行
let isProcessingQueue = false;

/**
 * 异步重试队列：处理所有 pending 状态的笔记
 * @param onProgress 每次有笔记状态更新时调用的回调函数（用于触发 UI 刷新）
 */
export async function processPendingQueue(onProgress?: () => void) {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    // 1. 扫描所有笔记
    const allNotes = await loadNotes();
    
    // 2. 找出最多 5 条 pending 状态的笔记
    const pendingNotes = allNotes
      .filter(n => n.ai_status === 'pending')
      .slice(0, 5);

    if (pendingNotes.length === 0) {
      return; // 没有需要处理的笔记
    }

    console.log(`[FlowNote] Found ${pendingNotes.length} pending notes. Starting processing...`);

    // 3. 防多端脑裂：先将状态改为 processing 并落盘
    for (const note of pendingNotes) {
      note.ai_status = 'processing';
      note.retry_count = (note.retry_count || 0) + 1;
      await updateNote(note);
    }
    
    // 通知 UI 刷新（此时状态变为 processing）
    if (onProgress) onProgress();

    // 4. 遍历处理这 5 条笔记
    for (const note of pendingNotes) {
      try {
        const result = await analyzeNote(note.raw_content);
        
        // 成功：更新字段并设为 done
        note.title = result.title;
        // 确保 category 在预设列表中
        note.category = CATEGORIES.includes(result.category) ? result.category : "Inbox";
        note.tags = result.tags || [];
        note.ai_status = 'done';
        
        await updateNote(note);
        console.log(`[FlowNote] Successfully processed note: ${note.id}`);
        
        // 触发 Wiki 增量更新
        triggerWikiUpdate(note);
      } catch (error) {
        console.error(`[FlowNote] Failed to process note ${note.id}:`, error);
        
        // 失败：检查重试次数
        if (note.retry_count >= 3) {
          note.ai_status = 'failed';
          console.warn(`[FlowNote] Note ${note.id} reached max retries. Marked as failed.`);
        } else {
          note.ai_status = 'pending'; // 重新放回队列
        }
        await updateNote(note);
      }
      
      // 每处理完一条，通知 UI 刷新
      if (onProgress) onProgress();
    }

  } catch (error) {
    console.error("[FlowNote] Error in processPendingQueue:", error);
  } finally {
    isProcessingQueue = false;
  }
}
