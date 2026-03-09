import { analyzeNote } from './aiService';
import { loadNotes, updateNote, NoteRecord } from './fsService';

export interface QueueSummary {
  processed: number;
  failed: number;
}

const MAX_RETRY = 3;
const MAX_BATCH = 15;

export async function processPendingNotes(onUpdate?: (note: NoteRecord) => void): Promise<QueueSummary> {
  const notes = await loadNotes();
  const pending = notes.filter((note) => note.ai_status === 'pending').slice(0, MAX_BATCH);
  let processed = 0;
  let failed = 0;
  for (const note of pending) {
    note.ai_status = 'processing';
    await updateNote(note);
    onUpdate?.(note);
    try {
      const analysis = await analyzeNote(note.raw_content);
      note.title = analysis.title;
      note.category = analysis.category;
      note.tags = analysis.tags;
      note.ai_status = 'done';
      note.retry_count = 0;
      processed += 1;
    } catch (error) {
      note.retry_count = (note.retry_count || 0) + 1;
      if (note.retry_count >= MAX_RETRY) {
        note.ai_status = 'failed';
        failed += 1;
      } else {
        note.ai_status = 'pending';
      }
    }
    await updateNote(note);
    onUpdate?.(note);
  }
  return { processed, failed };
}
