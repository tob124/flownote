import { BaseDirectory, createDir, exists, readDir, readTextFile, writeFile } from '@tauri-apps/api/fs';
const NOTES_DIR = 'notes';
const WIKIS_DIR = 'wikis';
const INBOX_FILE = 'inbox.txt';

export type AiStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface NoteRecord {
  id: string;
  raw_content: string;
  title: string;
  created_at: string;
  category: string;
  tags: string[];
  ai_status: AiStatus;
  retry_count: number;
  fileName: string;
}

async function ensureDir(name: string): Promise<void> {
  const hasDir = await exists(name, { dir: BaseDirectory.App });
  if (!hasDir) {
    await createDir(name, { dir: BaseDirectory.App, recursive: true });
  }
}

async function ensureInbox(): Promise<void> {
  const hasInbox = await exists(INBOX_FILE, { dir: BaseDirectory.App });
  if (!hasInbox) {
    await writeFile({ contents: '', path: INBOX_FILE, dir: BaseDirectory.App });
  }
}

export async function saveNote(content: string): Promise<NoteRecord> {
  await ensureDir(NOTES_DIR);
  const id = Date.now().toString().padStart(13, '0');
  const payload: Omit<NoteRecord, 'fileName'> = {
    id,
    raw_content: content,
    title: '',
    created_at: new Date().toISOString(),
    category: 'Inbox',
    tags: [],
    ai_status: 'pending',
    retry_count: 0
  };
  const fileName = `${id}.json`;
  await writeFile({
    dir: BaseDirectory.App,
    path: `${NOTES_DIR}/${fileName}`,
    contents: JSON.stringify(payload, null, 2)
  });
  return { ...payload, fileName };
}

export async function updateNote(note: NoteRecord): Promise<void> {
  await writeFile({
    dir: BaseDirectory.App,
    path: `${NOTES_DIR}/${note.fileName}`,
    contents: JSON.stringify({
      id: note.id,
      raw_content: note.raw_content,
      title: note.title,
      created_at: note.created_at,
      category: note.category,
      tags: note.tags,
      ai_status: note.ai_status,
      retry_count: note.retry_count
    }, null, 2)
  });
}

export async function loadNotes(): Promise<NoteRecord[]> {
  await ensureDir(NOTES_DIR);
  const entries = await readDir(NOTES_DIR, { dir: BaseDirectory.App, recursive: false });
  const results: NoteRecord[] = [];
  for (const entry of entries) {
    if (!entry.path || !entry.name?.endsWith('.json')) continue;
    if (!/^\d{13}\.json$/.test(entry.name)) continue;
    const raw = await readTextFile(`${NOTES_DIR}/${entry.name}`, { dir: BaseDirectory.App });
    try {
      const parsed = JSON.parse(raw);
      results.push({
        ...parsed,
        fileName: entry.name,
        id: parsed.id || entry.name.replace('.json', ''),
        tags: parsed.tags || [],
        ai_status: parsed.ai_status || 'pending'
      });
    } catch (err) {
      console.error('Failed to parse note', entry.name, err);
    }
  }
  return results.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function readInbox(): Promise<string[]> {
  await ensureInbox();
  const raw = await readTextFile(INBOX_FILE, { dir: BaseDirectory.App });
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function appendToInbox(line: string): Promise<void> {
  await ensureInbox();
  const current = await readTextFile(INBOX_FILE, { dir: BaseDirectory.App });
  const payload = current ? `${current.trim()}\n${line}` : line;
  await writeFile({ dir: BaseDirectory.App, path: INBOX_FILE, contents: payload.trim() });
}

export async function processInbox(): Promise<{ created: number; backlog: number }> {
  const inbox = await readInbox();
  if (inbox.length === 0) return { created: 0, backlog: 0 };
  for (const line of inbox) {
    await saveNote(line);
  }
  await writeFile({ dir: BaseDirectory.App, path: INBOX_FILE, contents: '' });
  return { created: inbox.length, backlog: 0 };
}

export async function ensureWikiDir(): Promise<void> {
  await ensureDir(WIKIS_DIR);
}

export async function getNotesDirectory(): Promise<string> {
  return NOTES_DIR;
}

export async function getInboxFile(): Promise<string> {
  return INBOX_FILE;
}
