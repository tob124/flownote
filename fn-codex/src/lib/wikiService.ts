import { BaseDirectory, createDir, exists, readDir, readTextFile, writeFile } from '@tauri-apps/api/fs';
import { NoteRecord } from './fsService';

const WIKIS_DIR = 'wikis';

export interface WikiItem {
  id: string;
  name: string;
  path: string;
  content: string;
  updatedAt: string;
}

function buildEntry(note: NoteRecord): string {
  const date = new Date(note.created_at).toLocaleString();
  const tags = note.tags.length ? `Tags: ${note.tags.join(', ')}` : 'Tags: none';
  return `## ${note.title || 'Untitled'} (${date})\n\n${tags}\n\n${note.raw_content}\n\n---\n`;
}

function buildFileName(note: NoteRecord): string {
  const created = new Date(note.created_at);
  const year = created.getUTCFullYear();
  const month = String(created.getUTCMonth() + 1).padStart(2, '0');
  const safeCategory = note.category.replace(/[^a-zA-Z0-9]/g, '_');
  return `${safeCategory}_${year}_${month}.md`;
}

export async function loadWikis(): Promise<WikiItem[]> {
  const dirExists = await exists(WIKIS_DIR, { dir: BaseDirectory.App });
  if (!dirExists) {
    await createDir(WIKIS_DIR, { dir: BaseDirectory.App });
  }
  const list = await readDir(WIKIS_DIR, { dir: BaseDirectory.App, recursive: false });
  const items: WikiItem[] = [];
  for (const entry of list) {
    if (!entry.name?.endsWith('.md')) continue;
    const path = `${WIKIS_DIR}/${entry.name}`;
    const content = await readTextFile(path, { dir: BaseDirectory.App });
    items.push({
      id: entry.name,
      name: entry.name,
      path,
      content,
      updatedAt: new Date().toISOString()
    });
  }
  return items.sort((a, b) => b.name.localeCompare(a.name));
}

export async function persistWiki(note: NoteRecord): Promise<void> {
  if (note.category === 'Inbox' || note.ai_status !== 'done') return;
  const fileName = buildFileName(note);
  const path = `${WIKIS_DIR}/${fileName}`;
  const existsFile = await exists(path, { dir: BaseDirectory.App });
  const entry = buildEntry(note);
  const content = existsFile
    ? `${await readTextFile(path, { dir: BaseDirectory.App })}\n${entry}`
    : entry;
  await writeFile({ dir: BaseDirectory.App, path, contents: content });
}
