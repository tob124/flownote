import { loadNotes, writeNote } from "./fsService";
import { analyzeNote } from "./aiService";
import type { NoteJson } from "./types";

const POLL_INTERVAL_MS = 15_000;
const MAX_BATCH = 3;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentSyncDir = "";

export function startQueuePoll(syncDir: string) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!syncDir) return;
  currentSyncDir = syncDir;

  const run = async () => {
    if (!currentSyncDir) return;
    const notes = await loadNotes(currentSyncDir);
    const pending = notes.filter((n) => n.ai_status === "pending").slice(0, MAX_BATCH);
    for (const note of pending) {
      const updated: NoteJson = { ...note, ai_status: "processing" };
      await writeNote(currentSyncDir, updated);
      try {
        const result = await analyzeNote(note.raw_content);
        if (result) {
          await writeNote(currentSyncDir, {
            ...updated,
            ai_status: "done",
            title: result.title,
            category: result.category,
            tags: result.tags ?? [],
          });
          // Step4: 若 category 不是 Inbox，触发 wiki 增量生成
          if (result.category && result.category !== "Inbox") {
            const { triggerWikiUpdate } = await import("./wikiService");
            void triggerWikiUpdate(currentSyncDir, {
              id: note.id,
              raw_content: note.raw_content,
              title: result.title,
              category: result.category,
              tags: result.tags,
            });
          }
        } else {
          throw new Error("parse failed");
        }
      } catch {
        const retry = (note.retry_count ?? 0) + 1;
        await writeNote(currentSyncDir, {
          ...updated,
          ai_status: retry >= 3 ? "failed" : "pending",
          retry_count: retry,
        });
      }
    }
  };

  run();
  pollTimer = setInterval(run, POLL_INTERVAL_MS);
}

export function stopQueuePoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  currentSyncDir = "";
}
