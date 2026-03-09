import { useEffect, useMemo, useState } from 'react';
import { SettingsDialog } from './components/SettingsDialog';
import { WikiViewer } from './components/WikiViewer';
import { FlowNoteConfig, getConfig, getDefaultConfig } from './lib/configStore';
import { NoteRecord, appendToInbox, loadNotes, processInbox, readInbox } from './lib/fsService';
import { loadWikis, persistWiki, WikiItem } from './lib/wikiService';
import { QueueSummary, processPendingNotes } from './lib/queueService';

type MainView = 'inbox' | 'notes' | 'wikis';

export default function App() {
  const [config, setConfig] = useState<FlowNoteConfig>(getDefaultConfig());
  const [view, setView] = useState<MainView>('inbox');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [inboxLines, setInboxLines] = useState<string[]>([]);
  const [newInbox, setNewInbox] = useState('');
  const [message, setMessage] = useState('');
  const [wikiFiles, setWikiFiles] = useState<WikiItem[]>([]);
  const [selectedWiki, setSelectedWiki] = useState<string | null>(null);
  const [queueSummary, setQueueSummary] = useState<QueueSummary>({ processed: 0, failed: 0 });

  const activeWiki = useMemo(() => wikiFiles.find((wiki) => wiki.id === selectedWiki) ?? wikiFiles[0], [selectedWiki, wikiFiles]);

  const refreshWorkspace = async () => {
    setNotes(await loadNotes());
    setInboxLines(await readInbox());
    const wikis = await loadWikis();
    setWikiFiles(wikis);
    setSelectedWiki((prev) => wikis.find((wiki) => wiki.id === prev)?.id ?? wikis[0]?.id ?? null);
  };

  useEffect(() => {
    (async () => {
      setConfig(await getConfig());
      await refreshWorkspace();
    })();
  }, []);

  const handleSaveSettings = (updated: FlowNoteConfig) => {
    setConfig(updated);
  };

  const handleProcessInbox = async () => {
    const result = await processInbox();
    await refreshWorkspace();
    setMessage(`已将 ${result.created} 条待办添加到 notes`);
  };

  const handleAddToInbox = async () => {
    if (!newInbox.trim()) return;
    await appendToInbox(newInbox.trim());
    setNewInbox('');
    setInboxLines(await readInbox());
  };

  const handleQueue = async () => {
    const summary = await processPendingNotes((note) => {
      setNotes((prev) => prev.map((item) => (item.id === note.id ? note : item)));
    });
    setQueueSummary(summary);
    setMessage(AI 处理完成  条，失败  条);
    const updatedNotes = await loadNotes();
    setNotes(updatedNotes);
    await Promise.all(updatedNotes.map((note) => persistWiki(note)));
    const wikis = await loadWikis();
    setWikiFiles(wikis);
    setSelectedWiki((prev) => wikis.find((wiki) => wiki.id === prev)?.id ?? wikis[0]?.id ?? null);
  };

  const tabs = [
    { key: 'inbox' as MainView, label: 'Inbox' },
    { key: 'notes' as MainView, label: 'All Notes' },
    { key: 'wikis' as MainView, label: 'Wikis' }
  ];
  const tabCounts: Record<MainView, number> = {
    inbox: inboxLines.length,
    notes: notes.length,
    wikis: wikiFiles.length
  };

  const renderView = () => {
    switch (view) {
      case 'inbox':
        return (
          <div className="flex h-full flex-col gap-4">
            <div className="rounded border border-slate-200 bg-white/5 p-4 text-sm text-slate-200">
              最近的未处理条目：
              <ul className="mt-3 list-disc pl-5 text-slate-100">
                {inboxLines.length === 0 && <li>队列为空，或通过设置页面更改 input。</li>}
                {inboxLines.map((line) => (
                  <li key={line} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">添加到 Inbox</label>
              <textarea
                value={newInbox}
                onChange={(event) => setNewInbox(event.target.value)}
                rows={3}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                placeholder="写下新的灵感或任务，按按钮保存"
              />
              <div className="flex gap-2">
                <button onClick={handleAddToInbox} className="rounded bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900">
                  入库
                </button>
                <button
                  onClick={handleProcessInbox}
                  className="rounded border border-slate-200 px-4 py-2 text-sm font-semibold text-white"
                >
                  处理 Inbox → notes
                </button>
              </div>
            </div>
          </div>
        );
      case 'notes':
        return (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between rounded border border-slate-200 bg-white/5 p-3 text-sm text-slate-200">
              <span>总笔记数：{notes.length}</span>
              <div className="flex gap-2 text-xs">
                <span>处理完成 {notes.filter((note) => note.ai_status === 'done').length}</span>
                <span>失败 {notes.filter((note) => note.ai_status === 'failed').length}</span>
                <span>待处理 {notes.filter((note) => note.ai_status === 'pending').length}</span>
              </div>
            </div>
            <div className="grid gap-3 overflow-auto">
              {notes.map((note) => (
                <article key={note.id} className="rounded border border-slate-800 bg-white/5 p-4 text-sm text-white">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{new Date(note.created_at).toLocaleString()}</span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide">
                      {note.ai_status}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-white">{note.title || '（无标题）'}</h3>
                  <p className="text-[13px] text-slate-200">{note.raw_content}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">{note.category}</span>
                    {note.tags.map((tag) => (
                      <span key={`${note.id}-${tag}`} className="rounded-full border border-slate-700 px-2 py-0.5">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
              <button onClick={handleQueue} className="w-full rounded bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900">
                触发 AI 处理（{queueSummary.processed} 已处理，{queueSummary.failed} 失败）
              </button>
            </div>
          </div>
        );
      case 'wikis':
        return <WikiViewer wikis={wikiFiles} selectedId={activeWiki?.id ?? null} onSelect={setSelectedWiki} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">FlowNote</p>
          <p className="text-2xl font-semibold">本地优先 AI 大脑</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400">当前 AI 提供商: {config.aiProvider}</p>
          <SettingsDialog config={config} open={isSettingsOpen} onOpenChange={setIsSettingsOpen} onSaved={handleSaveSettings} />
        </div>
      </header>
      <main className="grid grid-cols-5 gap-6 px-6 py-10">
        <section className="col-span-1 space-y-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex w-full items-center justify-between rounded px-4 py-3 text-left text-sm font-semibold ${view === tab.key ? 'bg-slate-800 text-white' : 'bg-white/5 text-slate-200'}`}
            >
              {tab.label}
              <span className="text-xs text-slate-400">{tabCounts[tab.key]}</span>
            </button>
          ))}
          <div className="rounded border border-slate-700 bg-slate-900/60 p-4 text-[13px] text-slate-300">
            同步目录: {config.syncDirectory}
            <br />
            API Key: {config.apiKey ? '已配置' : '未配置'}
          </div>
        </section>
        <section className="col-span-4 flex flex-col gap-4">{renderView()}</section>
      </main>
      <footer className="border-t border-slate-800 px-6 py-4 text-xs text-slate-500">
        {message || '本地优先，AI 推理均在设备外部接口隔离处理。'}
      </footer>
    </div>
  );
}
