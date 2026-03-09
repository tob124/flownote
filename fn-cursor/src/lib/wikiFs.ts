import { exists, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const WIKIS_DIR = "wikis";

function join(base: string, ...parts: string[]) {
  const normalized = base.replace(/\\/g, "/").replace(/\/$/, "");
  return [normalized, ...parts].join("/");
}

/** 展开同步目录作用域（与 fsService 一致） */
async function ensureScope(syncDir: string) {
  const { expandSyncScope } = await import("./fsService");
  await expandSyncScope(syncDir);
}

/** 列出 wikis 目录下所有 .md 文件 */
export async function listWikiFiles(syncDir: string): Promise<string[]> {
  await ensureScope(syncDir);
  const wikisPath = join(syncDir, WIKIS_DIR);
  const ok = await exists(wikisPath).catch(() => false);
  if (!ok) return [];
  const entries = await readDir(wikisPath);
  return entries.filter((e) => e.isFile && e.name?.endsWith(".md")).map((e) => e.name!);
}

/** 读取 wiki 文件内容 */
export async function readWikiFile(syncDir: string, filename: string): Promise<string> {
  await ensureScope(syncDir);
  const path = join(syncDir, WIKIS_DIR, filename);
  return readTextFile(path);
}

/** 写入 wiki 文件 */
export async function writeWikiFile(syncDir: string, filename: string, content: string): Promise<void> {
  await ensureScope(syncDir);
  const path = join(syncDir, WIKIS_DIR, filename);
  await writeTextFile(path, content);
}
