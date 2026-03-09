import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { NoteJson } from "./types";

const NOTES_DIR = "notes";
const WIKIS_DIR = "wikis";
const INBOX_FILE = "inbox.txt";
const PROCESSING_FILE = "processing.txt";
const NOTE_FILENAME_REGEX = /^\d{13}\.json$/;

function join(base: string, ...parts: string[]) {
  const normalized = base.replace(/\\/g, "/").replace(/\/$/, "");
  const all = [normalized, ...parts];
  return all.join("/");
}

/** 确保同步目录已被允许（选择目录后调用 expand_fs_scope 动态扩展 fs 作用域，支持任意路径） */
export async function expandSyncScope(syncDir: string): Promise<void> {
  try {
    await invoke("expand_fs_scope", { dir: syncDir });
  } catch (e) {
    console.warn("expand_fs_scope failed (ensure allow-expand-fs-scope in capabilities):", e);
  }
}

/** 初始化同步目录：创建 notes、wikis 和空 inbox.txt */
export async function initSyncDirectory(syncDir: string): Promise<void> {
  await expandSyncScope(syncDir);
  const notesPath = join(syncDir, NOTES_DIR);
  const wikisPath = join(syncDir, WIKIS_DIR);
  const inboxPath = join(syncDir, INBOX_FILE);

  const [notesExists, wikisExists] = await Promise.all([
    exists(notesPath).catch(() => false),
    exists(wikisPath).catch(() => false),
  ]);
  if (!notesExists) await mkdir(notesPath);
  if (!wikisExists) await mkdir(wikisPath);
  await writeTextFile(inboxPath, "");
}

/** 保存一条新笔记到 notes 目录，ai_status 为 pending */
export async function saveNote(syncDir: string, content: string): Promise<NoteJson> {
  await expandSyncScope(syncDir);
  const id = String(Date.now());
  const now = new Date().toISOString();
  const note: NoteJson = {
    id,
    raw_content: content,
    created_at: now,
    ai_status: "pending",
    retry_count: 0,
    title: "",
    category: "Inbox",
    tags: [],
  };
  const path = join(syncDir, NOTES_DIR, `${id}.json`);
  await writeTextFile(path, JSON.stringify(note, null, 2));
  return note;
}

/** 将笔记写回磁盘（用于更新 ai_status、title、category、tags、retry_count） */
export async function writeNote(syncDir: string, note: NoteJson): Promise<void> {
  await expandSyncScope(syncDir);
  const path = join(syncDir, NOTES_DIR, `${note.id}.json`);
  await writeTextFile(path, JSON.stringify(note, null, 2));
}

/** 按 id 读取单条笔记（用于引用弹窗） */
export async function loadNoteById(syncDir: string, id: string): Promise<NoteJson | null> {
  await expandSyncScope(syncDir);
  const path = join(syncDir, NOTES_DIR, `${id}.json`);
  const existsFile = await exists(path).catch(() => false);
  if (!existsFile) return null;
  try {
    const raw = await readTextFile(path);
    return JSON.parse(raw) as NoteJson;
  } catch {
    return null;
  }
}

/** 加载所有笔记，按时间倒序 */
export async function loadNotes(syncDir: string): Promise<NoteJson[]> {
  await expandSyncScope(syncDir);
  const notesPath = join(syncDir, NOTES_DIR);
  const existsNotes = await exists(notesPath).catch(() => false);
  if (!existsNotes) return [];

  const entries = await readDir(notesPath);
  const files = entries.filter((e) => e.isFile && NOTE_FILENAME_REGEX.test(e.name ?? ""));
  const notes: NoteJson[] = [];
  for (const f of files) {
    try {
      const path = join(syncDir, NOTES_DIR, f.name!);
      const raw = await readTextFile(path);
      const note = JSON.parse(raw) as NoteJson;
      notes.push(note);
    } catch {
      // 忽略解析失败的文件
    }
  }
  notes.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return notes;
}

/** 按抢占锁机制消化 inbox.txt：重命名为 processing.txt 后读取，按连续空行切分，生成多条 pending 笔记，最后删 processing 并重建空 inbox */
export async function processInbox(syncDir: string): Promise<number> {
  await expandSyncScope(syncDir);
  const inboxPath = join(syncDir, INBOX_FILE);
  const processingPath = join(syncDir, PROCESSING_FILE);

  const inboxExists = await exists(inboxPath).catch(() => false);
  if (!inboxExists) {
    await writeTextFile(inboxPath, "");
    return 0;
  }

  try {
    await rename(inboxPath, processingPath);
  } catch {
    // 抢占失败（可能被其他进程占用），跳过本次
    return 0;
  }

  let text: string;
  try {
    text = await readTextFile(processingPath);
  } catch {
    await writeTextFile(inboxPath, "");
    await remove(processingPath).catch(() => {});
    return 0;
  }

  await remove(processingPath).catch(() => {});

  const blocks = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  let count = 0;
  for (const block of blocks) {
    await saveNote(syncDir, block);
    count += 1;
  }

  await writeTextFile(inboxPath, "");
  return count;
}
