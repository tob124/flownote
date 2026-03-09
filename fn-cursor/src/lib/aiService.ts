import { getConfig } from "./configStore";

export interface AnalyzeResult {
  title: string;
  category: string;
  tags: string[];
}

/** 从模型返回的文本中用正则提取 JSON 并解析，防御性解析 */
export function safeParseJSON<T = unknown>(raw: string): T | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/** 调用大模型分析笔记，返回 { title, category, tags } */
export async function analyzeNote(content: string): Promise<AnalyzeResult | null> {
  const config = await getConfig();
  const { aiProvider, apiKey } = config;
  if (!apiKey?.trim()) return null;

  const prompt = `你是一个笔记分类助手。根据下面这条笔记的原文，输出一个 JSON 对象，且只输出该 JSON，不要其他说明。
要求：
- title: 简短标题（中文，不超过20字）
- category: 分类名（如：Tech、Life、Work、Inbox 等，英文）
- tags: 标签数组，最多5个

笔记原文：
---
${content.slice(0, 2000)}
---

只输出一个 JSON，格式：{"title":"...","category":"...","tags":[...]}`;

  if (aiProvider === "DeepSeek") {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek API: ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJSON<AnalyzeResult>(text);
    if (parsed && typeof parsed.title === "string" && typeof parsed.category === "string" && Array.isArray(parsed.tags)) {
      return {
        title: String(parsed.title),
        category: String(parsed.category),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      };
    }
    return null;
  }

  if (aiProvider === "Gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini API: ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = safeParseJSON<AnalyzeResult>(text);
    if (parsed && typeof parsed.title === "string" && typeof parsed.category === "string" && Array.isArray(parsed.tags)) {
      return {
        title: String(parsed.title),
        category: String(parsed.category),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      };
    }
    return null;
  }

  return null;
}
