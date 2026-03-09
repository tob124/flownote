export type AiStatus = "pending" | "processing" | "done" | "failed";

export interface NoteJson {
  id: string;
  raw_content: string;
  created_at: string;
  ai_status: AiStatus;
  retry_count: number;
  title: string;
  category: string;
  tags: string[];
}
