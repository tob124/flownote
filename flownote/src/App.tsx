import React, { useState, useEffect } from 'react';
import { 
  Inbox, 
  Library, 
  Hash, 
  Sparkles, 
  Loader2, 
  XCircle, 
  Send,
  Search,
  Settings,
  PenLine,
  Lock
} from 'lucide-react';
import { Note } from './types';
import { initWorkspace, loadNotes, saveNote, processInbox } from './lib/fsService';
import { processPendingQueue } from './lib/aiService';

const CATEGORIES = ["Inbox", "Tech", "Personal", "Work", "Ideas"];

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [activeCategory, setActiveCategory] = useState("Inbox");
  const [isInitializing, setIsInitializing] = useState(true);

  // 刷新笔记列表的辅助函数
  const refreshNotes = async () => {
    const loadedNotes = await loadNotes();
    setNotes(loadedNotes);
  };

  useEffect(() => {
    async function initialize() {
      try {
        // 1. 初始化工作区
        await initWorkspace();
        // 2. 消化 Inbox
        await processInbox();
        // 3. 加载所有笔记
        await refreshNotes();
      } catch (error) {
        console.error("Failed to initialize workspace:", error);
      } finally {
        setIsInitializing(false);
      }
    }
    
    initialize();
  }, []);

  // 设置后台轮询，每 10 秒执行一次 AI 处理队列
  useEffect(() => {
    if (isInitializing) return;

    const intervalId = setInterval(() => {
      processPendingQueue(refreshNotes);
    }, 10000);

    // 立即执行一次
    processPendingQueue(refreshNotes);

    return () => clearInterval(intervalId);
  }, [isInitializing]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!inputValue.trim()) return;
      
      const content = inputValue.trim();
      setInputValue(""); // 立即清空输入框，提升响应感
      
      try {
        // 调用真实的 saveNote 逻辑
        await saveNote(content);
        // 重新加载笔记列表以获取最新状态
        await refreshNotes();
        // 立即触发一次 AI 处理队列
        processPendingQueue(refreshNotes);
      } catch (error) {
        console.error("Failed to save note:", error);
        // 恢复输入框内容
        setInputValue(content);
      }
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    }).format(date);
  };

  const filteredNotes = activeCategory === "All Notes" 
    ? notes 
    : notes.filter(n => n.category === activeCategory || (activeCategory === "Inbox" && n.category === "Inbox"));

  if (isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FAFAFA] text-zinc-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          <p className="text-sm font-medium text-zinc-500">Initializing Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#FAFAFA] text-zinc-900 font-sans selection:bg-zinc-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-200 bg-zinc-50/50 flex flex-col">
        <div className="p-6 flex items-center gap-2 font-semibold text-lg tracking-tight">
          <div className="w-6 h-6 bg-zinc-900 rounded-md flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          FlowNote
        </div>

        <div className="px-3 flex-1 overflow-y-auto">
          <div className="space-y-1 mb-8">
            <button 
              onClick={() => setActiveCategory("Inbox")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeCategory === "Inbox" ? "bg-zinc-200/60 text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}
            >
              <Inbox className="w-4 h-4" />
              Inbox
              <span className="ml-auto text-xs text-zinc-400 font-mono">
                {notes.filter(n => n.category === "Inbox").length}
              </span>
            </button>
            <button 
              onClick={() => setActiveCategory("All Notes")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeCategory === "All Notes" ? "bg-zinc-200/60 text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}
            >
              <Library className="w-4 h-4" />
              All Notes
            </button>
          </div>

          <div className="mb-2 px-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Categories
          </div>
          <div className="space-y-1">
            {CATEGORIES.filter(c => c !== "Inbox").map(category => (
              <button 
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeCategory === category ? "bg-zinc-200/60 text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}
              >
                <Hash className="w-4 h-4 opacity-50" />
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-200">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        {/* Header / Input Area */}
        <div className="border-b border-zinc-100 p-6 md:p-8 max-w-4xl mx-auto w-full">
          <div className="relative group">
            <div className="absolute top-4 left-4 text-zinc-400">
              <PenLine className="w-5 h-5" />
            </div>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind? (Press Enter to capture)"
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 resize-none transition-all"
              rows={3}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-medium hidden sm:inline-block">
                Enter to save
              </span>
              <button 
                onClick={() => handleKeyDown({ key: 'Enter', preventDefault: () => {}, shiftKey: false } as any)}
                className="p-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold tracking-tight">{activeCategory}</h1>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Search notes..." 
                  className="pl-9 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {filteredNotes.map(note => (
                <div 
                  key={note.id} 
                  className="group bg-white border border-zinc-200 rounded-2xl p-5 hover:shadow-sm hover:border-zinc-300 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                      {formatDate(note.created_at)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {note.ai_status === 'done' && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full" title="Append-Only: Note is locked and cannot be edited">
                          <Lock className="w-3 h-3" />
                          Locked
                        </div>
                      )}
                      {note.ai_status === 'pending' && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Pending
                        </div>
                      )}
                      {note.ai_status === 'processing' && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Processing
                        </div>
                      )}
                      {note.ai_status === 'done' && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <Sparkles className="w-3 h-3" />
                          Done
                        </div>
                      )}
                      {note.ai_status === 'failed' && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full" title={`Retries: ${note.retry_count}`}>
                          <XCircle className="w-3 h-3" />
                          Failed
                        </div>
                      )}
                    </div>
                  </div>

                  {note.title && (
                    <h3 className="text-base font-semibold text-zinc-900 mb-2 leading-tight">
                      {note.title}
                    </h3>
                  )}
                  
                  <p className={`text-sm leading-relaxed ${note.ai_status === 'done' ? 'text-zinc-600' : 'text-zinc-800'}`}>
                    {note.raw_content}
                  </p>

                  {note.tags && note.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {note.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 text-xs font-medium">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              {filteredNotes.length === 0 && (
                <div className="col-span-full py-12 text-center text-zinc-400">
                  <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Inbox className="w-5 h-5 opacity-50" />
                  </div>
                  <p>No notes found in {activeCategory}.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
