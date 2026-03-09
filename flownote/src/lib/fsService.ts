import { Note } from '../types';

// 检测是否在 Tauri 环境中运行。
// 在 AI Studio Web 预览环境中，此值为 false，我们将降级使用 localStorage 模拟文件系统，
// 以保证你在浏览器中也能预览和测试核心逻辑。
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const WORKSPACE_DIR_NAME = 'FlowNote_Workspace';

// ============================================================================
// 真实 Tauri 文件系统实现
// ============================================================================

export async function initWorkspace() {
  if (!isTauri) return mockInitWorkspace();
  
  // 使用动态导入避免在非 Tauri 环境下报错
  const { exists, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  
  const docDir = await documentDir();
  const workspace = await join(docDir, WORKSPACE_DIR_NAME);
  
  if (!(await exists(workspace))) {
    await mkdir(workspace);
  }
  
  const notesDir = await join(workspace, 'notes');
  if (!(await exists(notesDir))) {
    await mkdir(notesDir);
  }
  
  const wikisDir = await join(workspace, 'wikis');
  if (!(await exists(wikisDir))) {
    await mkdir(wikisDir);
  }
  
  const inboxPath = await join(workspace, 'inbox.txt');
  if (!(await exists(inboxPath))) {
    await writeTextFile(inboxPath, '');
  }
}

export async function saveNote(content: string): Promise<Note> {
  const timestamp = Date.now().toString();
  const note: Note = {
    id: timestamp,
    raw_content: content,
    created_at: new Date().toISOString(),
    ai_status: "pending",
    retry_count: 0,
    title: "",
    category: "Inbox",
    tags: []
  };

  if (!isTauri) return mockSaveNote(note);

  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  
  const docDir = await documentDir();
  const notePath = await join(docDir, WORKSPACE_DIR_NAME, 'notes', `${timestamp}.json`);
  
  // 状态变更优先：先写入 pending 状态落盘
  await writeTextFile(notePath, JSON.stringify(note, null, 2));
  return note;
}

export async function updateNote(note: Note): Promise<Note> {
  if (!isTauri) return mockUpdateNote(note);

  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  
  const docDir = await documentDir();
  const notePath = await join(docDir, WORKSPACE_DIR_NAME, 'notes', `${note.id}.json`);
  
  await writeTextFile(notePath, JSON.stringify(note, null, 2));
  return note;
}

export async function loadNotes(): Promise<Note[]> {
  if (!isTauri) return mockLoadNotes();

  const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  
  const docDir = await documentDir();
  const notesDir = await join(docDir, WORKSPACE_DIR_NAME, 'notes');
  
  const entries = await readDir(notesDir);
  const notes: Note[] = [];
  
  // 幽灵文件正则过滤法则：严格匹配 13位时间戳.json
  const validFileRegex = /^\d{13}\.json$/;
  
  for (const entry of entries) {
    if (entry.name && validFileRegex.test(entry.name)) {
      try {
        const filePath = await join(notesDir, entry.name);
        const content = await readTextFile(filePath);
        const note = JSON.parse(content) as Note;
        notes.push(note);
      } catch (error) {
        // JSON 安全解析法则：解析失败只允许打印警告并跳过，绝对不允许导致应用崩溃
        console.warn(`[FlowNote] Failed to parse note: ${entry.name}. Skipping.`, error);
      }
    }
  }
  
  // 按时间倒序排列
  return notes.sort((a, b) => Number(b.id) - Number(a.id));
}

export async function processInbox() {
  if (!isTauri) return mockProcessInbox();

  const { rename, writeTextFile, readTextFile, remove } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  
  const docDir = await documentDir();
  const workspace = await join(docDir, WORKSPACE_DIR_NAME);
  const inboxPath = await join(workspace, 'inbox.txt');
  
  const timestamp = Date.now().toString();
  const processingPath = await join(workspace, `processing_${timestamp}.txt`);
  
  try {
    // 防网盘同步冲突法则：尝试重命名，抢占网盘读写锁
    await rename(inboxPath, processingPath);
  } catch (error) {
    // 重命名失败，说明文件正被占用或不存在，直接返回
    return;
  }
  
  // 成功抢占后，立即创建一个全新的、空的 inbox.txt 供手机端继续使用
  await writeTextFile(inboxPath, '');
  
  try {
    const content = await readTextFile(processingPath);
    // 按连续两个空行 (\n\n) 或 --- 分割
    const segments = content.split(/\n\s*\n|---/);
    
    for (const segment of segments) {
      const text = segment.trim();
      if (text) {
        // 忽略纯空白段落，将每一段有效文本作为一个独立的新笔记保存
        await saveNote(text);
      }
    }
  } catch (error) {
    console.error("[FlowNote] Failed to process inbox content", error);
  } finally {
    // 处理完成后，删除 processing 文件
    try {
      await remove(processingPath);
    } catch (e) {
      console.warn("[FlowNote] Failed to remove processing file", e);
    }
  }
}

// ============================================================================
// Web 预览环境 Mock 实现 (基于 localStorage)
// ============================================================================

const MOCK_STORAGE_KEY = 'flownote_mock_notes';
const MOCK_INBOX_KEY = 'flownote_mock_inbox';

async function mockInitWorkspace() {
  if (!localStorage.getItem(MOCK_STORAGE_KEY)) {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(MOCK_INBOX_KEY)) {
    // 预置一些 inbox 测试数据
    localStorage.setItem(MOCK_INBOX_KEY, '这是来自手机端 Inbox 的第一条笔记\n\n这是第二条笔记，通过两个换行符分割\n\n---\n\n这是第三条笔记，通过横线分割');
  }
}

async function mockSaveNote(note: Note) {
  const notes = await mockLoadNotes();
  notes.push(note);
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(notes));
  return note;
}

async function mockUpdateNote(note: Note) {
  const notes = await mockLoadNotes();
  const index = notes.findIndex(n => n.id === note.id);
  if (index !== -1) {
    notes[index] = note;
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(notes));
  }
  return note;
}

async function mockLoadNotes(): Promise<Note[]> {
  try {
    const data = localStorage.getItem(MOCK_STORAGE_KEY);
    const notes: Note[] = data ? JSON.parse(data) : [];
    return notes.sort((a, b) => Number(b.id) - Number(a.id));
  } catch (e) {
    console.warn("Mock load failed", e);
    return [];
  }
}

async function mockProcessInbox() {
  const inboxContent = localStorage.getItem(MOCK_INBOX_KEY) || '';
  if (!inboxContent.trim()) return;
  
  // 模拟抢占锁并清空 inbox
  localStorage.setItem(MOCK_INBOX_KEY, '');
  
  const segments = inboxContent.split(/\n\s*\n|---/);
  for (const segment of segments) {
    const text = segment.trim();
    if (text) {
      // 稍微延迟一下时间戳，避免 id 冲突
      const timestamp = (Date.now() + Math.floor(Math.random() * 10000)).toString();
      const note: Note = {
        id: timestamp,
        raw_content: text,
        created_at: new Date().toISOString(),
        ai_status: "pending",
        retry_count: 0,
        title: "",
        category: "Inbox",
        tags: []
      };
      await mockSaveNote(note);
    }
  }
}
