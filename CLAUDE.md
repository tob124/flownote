# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FlowNote is a "Pensieve" (冥想盆) desktop application — a personal knowledge management tool that captures quick notes, uses AI to classify/tag them, and generates monthly AI-curated wiki pages. Built with React + Electron + TypeScript.

## Environment

```bash
cd C:\code\flownoteV2.1.1
npm install
npm run dev
```

Dependencies: Node.js 18+, npm. All deps declared in package.json — use `npm install`.

**⚠️ 动手前必读 `TROUBLESHOOTING.md`（踩坑手册）**——记录了本机环境的关键坑：npm 镜像（npmmirror，清华源无 electron 包）、allow-scripts 批准、git ssh 依赖绕过、winCodeSign 符号链接权限问题（exe 图标）、DeepSeek 端点勿改（/chat 仍有效，迁移的是模型名）等。`todo.txt` 为任务清单（已全部完成，含每项决策说明）。当前版本 v2.6.0。

## Architecture (4-layer modular — mirrors Python v1.8)

```
src/
├── main/              # Electron main process (Node.js)
│   ├── store/         # File I/O — JSON/Markdown CRUD
│   │   ├── note-store.ts     # Note CRUD, search, JSON file I/O
│   │   ├── wiki-store.ts     # Wiki file list/load/save
│   │   ├── config-store.ts   # ~/.flownote_config.json
│   │   ├── dream-store.ts    # dream_state.json, trigger, time-range filtering
│   │   └── inbox-store.ts    # Atomic inbox.txt processing
│   ├── llm/           # AI API layer
│   │   ├── llm-client.ts     # DeepSeek/Gemini HTTP calls (fetch), retry
│   │   └── prompts.ts        # CLASSIFY_PROMPT, WIKI_PROMPT, DREAM_PROMPT
│   ├── services/      # Background services (async, no threads needed)
│   │   ├── classifier-service.ts  # 15s poll + poke, batch (max 3 pending)
│   │   ├── wiki-writer.ts         # LLM merge → heading enforcement → save
│   │   ├── dream-worker.ts        # 3-phase: Gather→Consolidate→Prune
│   │   └── inbox-watcher.ts       # fs.watch + 300ms debounce
│   ├── ipc/           # IPC handler registration
│   └── utils/         # logger (Winston), helpers (safeParseJson, retry)
├── preload/           # Context bridge (security boundary)
│   └── index.ts       # contextBridge.exposeInMainWorld('api', ...)
├── renderer/          # React 18 application
│   ├── App.tsx              # Root: providers + sidebar + page routing
│   ├── pages/               # NotesPage, WikisPage, DreamPage, SettingsPage
│   ├── components/          # 14 reusable components
│   ├── context/             # 6 Context + useReducer providers
│   └── styles/              # Global CSS, 3 themes (CSS custom properties), markdown
└── shared/
    └── types.ts       # Note, AppConfig, DreamMeta interfaces + IPC channel constants
```

## Key Patterns and Gotchas

- **IPC communication**: Renderer calls `window.api.notes.loadAll()` (via contextBridge), main process handles via `ipcMain.handle`. Push events from main to renderer via `webContents.send()`.
- **Background tasks**: classifier-service uses `setTimeout` chain with per-second poke checking (matches Python QThread 15s poll pattern). dream-worker is async/await (no threads needed — HTTP is natively async in Node.js).
- **State management**: 6 React Contexts (App, Theme, Config, Notes, Wikis, Dream), each with `useReducer` internally. No Redux. IPC events (`notes:updated`, `dream:phase-changed`, etc.) dispatched to context actions.
- **Theme system**: CSS custom properties on `[data-theme="dark|solar|draft"]`. Switching is `document.documentElement.setAttribute('data-theme', name)`. Each theme file defines the same CSS variable names with different values.
- **Data format compatibility**: Notes are `{13-digit-ms}.json` with identical schema to Python v1.8. Wikis are `{category}_{YYYY_MM}.md`. Zero migration needed.
- **Dream lock**: File-based mutex via `dream_state.json` → `dream_in_progress` boolean. `acquireDreamLock()` returns false if already locked. Always released in `finally` block.
- **Inbox atomic processing**: `os.rename(inbox.txt, processing.txt)` → recreate empty `inbox.txt` → parse blocks by `\n\n` → `saveNote()` per block → delete `processing.txt`.
- **Classifier retry**: 3 retries with exponential backoff (2s, 4s, 8s). After 3 failures, note status → `failed`. Notes with `retry_count < 3` stay `pending` for retry.
- **Wiki heading enforcement**: `enforceHeading()` replaces first H1 with `# {category}`, or prepends if no H1 found. Post-processes LLM output.
- **Note ID for time comparison**: Use note `id` (13-digit ms timestamp) for precise time comparisons, not `created_at` (date-only string). Same as Python version.
- **IME compatibility**: Use native `<textarea>` for QuickInput. CSS padding on `<textarea>` is fine in browsers (the QPlainTextEdit IME bug was PyQt6-specific).

## Build and Package

```bash
npm run dev                # Dev with HMR
npm run build              # Production build (electron-vite)
npm run package:win        # Package for Windows (NSIS)
npm run package:mac        # Package for macOS (DMG)
npm run package:linux      # Package for Linux (AppImage)
```
