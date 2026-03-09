import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NoteJson } from "@/lib/types";

interface NoteRefModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: NoteJson | null;
}

export function NoteRefModal({ open, onOpenChange, note }: NoteRefModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{note?.title || "笔记引用"}</DialogTitle>
        </DialogHeader>
        {note && (
          <div className="space-y-2">
            {note.category && <p className="text-sm text-muted-foreground">分类: {note.category}</p>}
            {note.tags?.length ? (
              <p className="text-sm text-muted-foreground">标签: {note.tags.join(", ")}</p>
            ) : null}
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {note.raw_content}
            </div>
            <p className="text-xs text-muted-foreground">ID: {note.id}</p>
          </div>
        )}
        {!note && open && <p className="text-muted-foreground">未找到该笔记</p>}
      </DialogContent>
    </Dialog>
  );
}
