import { useState, useEffect, useCallback } from "react";
import { Settings, Inbox, FileText, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsDialog } from "@/components/SettingsDialog";
import { getConfig, hasSyncDirectory } from "@/lib/configStore";
import { loadNotes, saveNote, processInbox } from "@/lib/fsService";
import { startQueuePoll, stopQueuePoll } from "@/lib/queueService";
import type { NoteJson } from "@/lib/types";
import { NoteCard } from "@/components/NoteCard";
import { NoteRefModal } from "@/components/NoteRefModal";
import { WikiView } from "@/components/WikiView";
import { loadNoteById } from "@/lib/fsService";

type ViewFilter = "inbox" | "all" | string; // string = category

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncDir, setSyncDir] = useState("");
  const [notes, setNotes] = useState<NoteJson[]>([]);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [inputValue, setInputValue] = useState("");
  const [wikisView, setWikisView] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [noteRefId, setNoteRefId] = useState<string | null>(null);
  const [noteRef, setNoteRef] = useState<NoteJson | null>(null);

  const refreshNotes = useCallback(async () => {
    if (!syncDir) return;
    const list = await loadNotes(syncDir);
    setNotes(list);
    const cats = Array.from(new Set(list.map((n) => n.category).filter(Boolean))).sort();
    setCategories(cats);
  }, [syncDir]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const hasDir = await hasSyncDirectory();
      if (!hasDir) {
        setSettingsOpen(true);
        return;
      }
      const config = await getConfig();
      setSyncDir(config.syncDirectory);
      if (!config.syncDirectory) {
        setSettingsOpen(true);
        return;
      }
      await processInbox(config.syncDirectory);
      if (mounted) {
        const list = await loadNotes(config.syncDirectory);
        setNotes(list);
        setCategories(Array.from(new Set(list.map((n) => n.category).filter(Boolean))).sort());
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!syncDir) return;
    refreshNotes();
  }, [syncDir, refreshNotes]);

  useEffect(() => {
    if (syncDir) startQueuePoll(syncDir);
    return () => stopQueuePoll();
  }, [syncDir]);

  // 与队列同步：定期刷新列表以便看到 pending -> done 等状态变化
  useEffect(() => {
    if (!syncDir) return;
    const t = setInterval(refreshNotes, 15_000);
    return () => clearInterval(t);
  }, [syncDir, refreshNotes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ id: string }>;
      const id = ev.detail?.id;
      if (!id || !syncDir) return;
      setNoteRefId(id);
      const inList = notes.find((n) => n.id === id);
      if (inList) {
        setNoteRef(inList);
        return;
      }
      loadNoteById(syncDir, id).then(setNoteRef);
    };
    window.addEventListener("flownote-open-note", handler);
    return () => window.removeEventListener("flownote-open-note", handler);
  }, [syncDir, notes]);

  const handleSettingsSaved = useCallback(() => {
    getConfig().then((c) => {
      setSyncDir(c.syncDirectory);
      if (c.syncDirectory) {
        processInbox(c.syncDirectory).then(() => refreshNotes());
      }
    });
  }, [refreshNotes]);

  const handleAddNote = async () => {
    const text = inputValue.trim();
    if (!text || !syncDir) return;
    await saveNote(syncDir, text);
    setInputValue("");
    await refreshNotes();
  };

  const filteredNotes =
    filter === "all"
      ? notes
      : filter === "inbox"
        ? notes.filter((n) => n.category === "Inbox" || !n.category)
        : notes.filter((n) => n.category === filter);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-56 border-r border-border flex flex-col">
        <div className="p-2 border-b border-border flex items-center justify-between">
          <span className="font-semibold">FlowNote</span>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="设置">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <nav className="p-2 flex-1 overflow-auto">
          <Button
            variant={filter === "inbox" && !wikisView ? "secondary" : "ghost"}
            className="w-full justify-start mb-1"
            onClick={() => { setWikisView(false); setFilter("inbox"); }}
          >
            <Inbox className="h-4 w-4 mr-2" />
            Inbox
          </Button>
          <Button
            variant={filter === "all" && !wikisView ? "secondary" : "ghost"}
            className="w-full justify-start mb-1"
            onClick={() => { setWikisView(false); setFilter("all"); }}
          >
            <FileText className="h-4 w-4 mr-2" />
            全部笔记
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={filter === cat && !wikisView ? "secondary" : "ghost"}
              className="w-full justify-start mb-1"
              onClick={() => { setWikisView(false); setFilter(cat); }}
            >
              <Inbox className="h-4 w-4 mr-2" />
              {cat}
            </Button>
          ))}
          <Button
            variant={wikisView ? "secondary" : "ghost"}
            className="w-full justify-start mt-2"
            onClick={() => setWikisView(true)}
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Wikis (知识库)
          </Button>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        {wikisView ? (
          <WikiView syncDir={syncDir} />
        ) : (
          <>
            <div className="p-4 border-b border-border flex gap-2">
              <Input
                placeholder="输入新笔记内容…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddNote()}
              />
              <Button onClick={handleAddNote} disabled={!inputValue.trim() || !syncDir}>
                添加
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {filteredNotes.map((note) => (
                <NoteCard key={note.id} note={note} syncDir={syncDir} onUpdated={refreshNotes} />
              ))}
              {filteredNotes.length === 0 && (
                <p className="text-muted-foreground text-sm">暂无笔记</p>
              )}
            </div>
          </>
        )}
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={handleSettingsSaved} />
      <NoteRefModal
        open={noteRefId !== null}
        onOpenChange={(open) => { if (!open) { setNoteRefId(null); setNoteRef(null); } }}
        note={noteRef}
      />
    </div>
  );
}

export default App;
