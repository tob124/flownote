import { getConfig } from "./configStore";
import { readWikiFile, writeWikiFile } from "./wikiFs";

/** 当前年月，格式 YYYY_MM */
function currentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}_${m}`;
}

/** Wiki 文件名：Category_YYYY_MM.md */
function wikiFilename(category: string): string {
  const safe = category.replace(/[^\w\u4e00-\u9fa5-]/g, "_");
  return `${safe}_${currentYearMonth()}.md`;
}

/** 调用大模型将新笔记融入旧总结，返回结构化 Markdown，引用格式 [细节](noteId) */
async function mergeNoteIntoWiki(
  oldMarkdown: string,
  note: { id: string; raw_content: string; title: string; category: string; tags?: string[] }
): Promise<string> {
  const config = await getConfig();
  if (!config.apiKey?.trim()) return oldMarkdown;

  const prompt = `你是一个知识库整理助手。现有以下已有的 Markdown 总结，以及一条新笔记。请将新笔记融入总结，生成一份新的结构化 Markdown。
要求：
1. 保持原有结构，把新内容合并到合适的小节或新增小节。
2. 对新笔记的引用必须使用格式：[细节](${note.id})，即用方括号写描述文字，括号内是该条笔记的 ID（${note.id}）。
3. 只输出最终 Markdown，不要其他说明。

已有总结：
---
${oldMarkdown || "# 暂无内容"}
---

新笔记（ID: ${note.id}）
- 标题: ${note.title}
- 分类: ${note.category}
- 内容: ${note.raw_content.slice(0, 1500)}
---

请输出融合后的完整 Markdown：`;

  if (config.aiProvider === "DeepSeek") {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? oldMarkdown;
  }

  if (config.aiProvider === "Gemini" && config.apiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? oldMarkdown;
  }

  return oldMarkdown;
}

export interface NoteForWiki {
  id: string;
  raw_content: string;
  title: string;
  category: string;
  tags?: string[];
}

/** 当有笔记从 pending 变为 done 且 category 不是 Inbox 时调用，增量更新对应 wiki 文件 */
export async function triggerWikiUpdate(syncDir: string, note: NoteForWiki): Promise<void> {
  if (!note.category || note.category === "Inbox") return;
  const filename = wikiFilename(note.category);
  let oldContent = "";
  try {
    oldContent = await readWikiFile(syncDir, filename);
  } catch {
    // 文件不存在则从空开始
  }
  const newContent = await mergeNoteIntoWiki(oldContent, note);
  await writeWikiFile(syncDir, filename, newContent);
}
