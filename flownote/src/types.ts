export type AIStatus = "pending" | "processing" | "done" | "failed";

export interface Note {
  id: string;
  raw_content: string;
  created_at: string;
  ai_status: AIStatus;
  retry_count: number;
  title: string;
  category: string;
  tags: string[];
}
