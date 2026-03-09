import { useState } from "react";
import { writeNote } from "@/lib/fsService";
import type { NoteJson } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NoteCardProps {
  note: NoteJson;
  syncDir: string;
  onUpdated: () => void;
}

export function NoteCard({ note, syncDir, onUpdated }: NoteCardProps) {
  const [content, setContent] = useState(note.raw_content);
  const isDone = note.ai_status === "done";

  const handleBlur = async () => {
    if (isDone) return;
    if (content === note.raw_content) return;
    await writeNote(syncDir, { ...note, raw_content: content });
    onUpdated();
  };

  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm")}>
      {note.title && <div className="text-sm font-medium text-muted-foreground mb-1">{note.title}</div>}
      {note.category && note.category !== "Inbox" && (
        <span className="text-xs text-muted-foreground mr-2">{note.category}</span>
      )}
      {note.tags?.length ? (
        <div className="flex flex-wrap gap-1 mb-2">
          {note.tags.map((t) => (
            <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={handleBlur}
        disabled={isDone}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y",
          isDone && "border-0 bg-transparent cursor-default"
        )}
        rows={3}
      />
      <div className="mt-2 text-xs text-muted-foreground">
        {note.ai_status} · {note.created_at?.slice(0, 19)}
      </div>
    </div>
  );
}
