# FlowNote 功能批次实现计划（2026-08-19）

## 概览（Summary）

根据 `更新日志汇总20260809.md` 的 todos，本批次实现用户确认的 5 大功能（**不含**自定义图标打包修复——该坑需管理员权限打包，见 TROUBLESHOOTING §2，单列）：

1. **主页输入框卡顿 + 语音输入 + AI 润色**
2. **wiki/笔记外观字体修正 + 自定义字体导入**
3. **wiki 可展开/隐藏的侧边栏大纲**
4. **PC 端 attach file（files 文件夹、图片预览、notes 分页、附件兜底）**
5. **热力图/统计面板 + 通知中心 + diff 醒目显示**

全部基于现有 Electron + React + TypeScript 架构（`src/main` store/ipc/services/llm，`src/preload` contextBridge，`src/renderer` pages/components/context/styles）。无新增网络依赖；语音用浏览器原生 **Web Speech API**（非神经网络）；diff 用**轻量行级算法**，不引入第三方库。

执行方式（用户已确认）：**一次做完整批并验证**。按依赖顺序分阶段实现，最后 `npm run build` + dev 手测。

---

## 现状分析（Current State Analysis）

- **笔记存储**：`sync_dir/notes/{id}.json`，`Note.id` 为 13 位毫秒时间戳；`created_at` 为 `YYYY-MM-DD`（`src/main/store/note-store.ts`）。`ensureDirectories` 已建 `notes/`、`wikis/`、`inbox.txt`，但**无 `files/` 目录**。
- **笔记展示**：`NotesPage.tsx`（QuickInput + SearchBar + NoteList），`NoteList` **单列渲染全部笔记**，`NoteCard` 每次 `notes:updated`/inbox 事件都会 `loadNotes()` 全量重载 → 输入框卡顿主因（DOM 过多 + 高频全量重读）。
- **wiki 渲染**：`WikisPage.tsx` = `WikiList`（左侧文件列表）+ `MarkdownViewer.tsx`（`react-markdown` 渲染 `currentContent`）。wiki 由 `wiki-writer.ts::generateWiki` 调用 LLM 生成**整篇覆盖**（`saveWiki` 前会 `backupWiki` 到 `wikis/backups/`）。
- **字体**：全局 `global.css` 用 `'Lora','Source Sans Pro','Segoe UI','Microsoft YaHei',sans-serif`；`markdown.css` 用 `'Lora','Source Sans Pro',serif` —— 中文字形没有 Lora 被降级到系统 serif，观感差。
- **上下文**：`AppContext` 的 `pageIndex: 0|1|2|3`；`NotesContext` 持有完整 `notes` 数组（热力图数据源）；`ConfigContext` 对应 `AppConfig`（存于 `~/.flownote_config.json`）。
- **IPC 模式**：`ipc/main/handle`（renderer→main）+ `webContents.send`（main→renderer 推送）；`IPC_CHANNELS` 集中管理常量；`preload/index.ts` 暴露 `window.api.*`。
- **LLM 层**：`llm-client.ts::callLlm(provider, apiKey, prompt, content, {isJson,timeout})`；`classifier-service.ts` 在笔记分类后对非 Inbox 笔记调 `generateWiki`。

---

## 变更方案（Proposed Changes）

按阶段顺序实现（每阶段独立可验证）：

---

### 阶段 A：主页输入框卡顿 + 语音输入 + AI 润色

**目标**：减少 Notes 列表高负载引起的输入框卡顿；给 QuickInput 加轻量语音输入（非神经网络）；可选 AI 润色。

#### A1. Notes 列表分页（主要卡顿修复）
- **文件**：`src/renderer/components/NoteList.tsx`
- **改**：客户端分页渲染（`pageSize = 15`）。新增 `const [visible, setVisible] = useState(15)`；`filteredNotes.slice(0, visible)` 循环渲染；末尾若 `visible < filteredNotes.length` 显示"加载更多"按钮。`visible` 在 `searchKeyword` 或笔记数量变化时复位（`useEffect([searchKeyword])`）。
- **为何**：把一次渲染几百上千条 `NoteCard` 降为 ≤15 个 DOM 节点，输入框所在的 `NotesPage` 重渲染成本骤降，是卡顿根因修复（todo #1、#8 共用）。

#### A2. NoteCard 记忆化 + 惰性重载
- **文件**：`src/renderer/components/NoteCard.tsx` → 包 `React.memo(NoteCard)`，`onDelete` 用 `useCallback`（`NoteList` 中 `deleteNote` 已来自 context）。属性稳定则卡片不因兄弟更新而重渲。
- **文件**：`src/renderer/context/NotesContext.tsx`
- **改**：把 inbox `onNoteCreated` 逐个 `loadNotes()` 改为 **300ms debounce 全量刷新**（新增 `pendingReload` ref + `setTimeout`），减少高频 IPC 全量重读。

#### A3. 语音输入（Web Speech API，非神经网络）
- **文件**：`src/renderer/components/QuickInput.tsx`
- **改**：
  - 检测 `window.SpeechRecognition || window.webkitSpeechRecognition`；不可用时 mic 按钮置灰并 `title="当前环境不支持语音输入"`。
  - 在 `textarea` 上方/右侧加 **mic 按钮**（🎤），点击开始/停止 `recognition`；`interimResults = true`，`lang = 'zh-CN'`，识别结果追加进 `text`（识别期间禁用 mic 防重复）。
  - 语音识别期间显示"正在聆听…"状态文案。
- **说明**：Web Speech API 走系统/浏览器语音服务，端上零模型，满足"简单、性能消耗小"。

#### A4. AI 润色（可选按钮）
- **目标**：对语音/手输文本做轻量润色：去口吃/语气词/理顺表达；**修缮程度小、表达顺序不变**。
- **文件**：`src/main/llm/prompts.ts` → 新增 `POLISH_PROMPT`（明示"只做轻微口语转书面，纠正口吃/语气词，严禁改变表达顺序和信息，删除冗余重复，字数尽量接近原文，直接输出润色后文本，不得用代码块包裹"）。
- **文件**：`src/shared/types.ts` → `IPC_CHANNELS` 增加 `LLM_POLISH: 'llm:polish'`。
- **文件**：`src/main/ipc/polish.ipc.ts`（新建）→ `registerPolishIpc()`：`ipcMain.handle(LLM_POLISH, (_, text) => callLlm(config.api_provider, config.api_key, POLISH_PROMPT, text))`。
- **文件**：`src/main/ipc/register-all.ts` → 注册 `registerPolishIpc()`。
- **文件**：`src/preload/index.ts` → `window.api.polish(text): Promise<string|null>`；`index.d.ts` 同步。
- **文件**：`QuickInput.tsx` → 加"✨ 润色"按钮（仅当 `text` 非空且已配置 API key）：调用 `window.api.polish(text)`，成功则 `setText(润色结果)`，失败给出提示。

---

### 阶段 B：wiki/笔记外观字体 + 自定义字体导入

**目标**：修复 wiki markdown 字体难看；支持导入本地自定义字体（如鸿蒙体、原神体）。**不内置**字体文件。

#### B1. 修正 markdown 字体上齐系统/notes
- **文件**：`src/renderer/styles/markdown.css`
- **改**：`.markdown-body` 及 `h1/h2/h3`、`th` 的 `font-family` 从 Lora/serif 改为与 `global.css` 相同的栈 `var(--font-sans)`。
- **文件**：`src/renderer/styles/global.css` → 新增 `:root { --font-sans: 'Source Sans Pro','Segoe UI','Microsoft YaHei',system-ui,sans-serif; }`，并把 `html,body,#root` 的 `font-family` 改为 `var(--font-sans)`（notes 卡片沿用，保证一致）。

#### B2. 自定义字体导入（设置页）
- **文件**：`src/shared/types.ts`
  - `AppConfig` 增加可选 `font_file?: string`（已导入字体的本地路径）与 `font_family?: string`（已注册的字族名）。
- **文件**：`src/main/store/font-store.ts`（新建）
  - 字体目录 `~/.flownote/fonts/`（不入坚果云同步，控制体积）。
  - `importFont(srcPath)`：复制 `srcPath`（`.ttf/.otf/.woff/.woff2`）到该目录，返回 `{ file, family }`。字族名优先从字体文件读取（若可解析），否则用文件名。
  - `listFonts()` / `deleteFont(file)` / `getFontPath(file)`。
- **文件**：`src/main/ipc/font.ipc.ts`（新建）→ `registerFontIpc()`：`fonts:select-file`（`dialog.showOpenDialog` 过滤字体格式）、`fonts:list`、`fonts:delete`。channel 常量加入 `IPC_CHANNELS`。
- **文件**：`src/main/ipc/register-all.ts` & `src/preload/index.ts`(+`index.d.ts`) → 暴露 `window.api.fonts.{select,list,delete}`。
- **文件**：`src/renderer/context/ThemeContext.tsx`
  - 挂载时若 `config.font_file` 存在，用 `new FontFace(family, \`url(file://${path})\`)` 注册到 `document.fonts`，成功后设置 `--font-sans` 为该字族；失败回退默认。提供 `applyFont/clearFont`。
- **文件**：`src/renderer/components/FontSelector.tsx`（新建）+ 挂到 `SettingsPage.tsx`"外观"区：选择/删除/恢复默认按钮 + 当前字体文件名展示。

---

### 阶段 C：wiki 可展开/隐藏侧边栏大纲

**目标**：长 markdown 提供可折叠大纲导航，点击快速跳转。

- **文件**：`src/renderer/utils/markdown.ts`（新建）→ `parseHeadings(content): {level,text,id}[]`（按行匹配 `/^(#{1,6})\s+(.+)/`，生成 `slug` id）。
- **文件**：`src/renderer/components/OutlinePanel.tsx`（新建）
  - 接收 `headings` + `onNavigate(id)`；按 level 缩进渲染；点击高亮当前项。
- **文件**：`src/renderer/pages/WikisPage.tsx`
  - 新增右侧大纲：`MarkdownViewer` 旁的 `OutlinePanel`。顶部加"大纲"折叠按钮（`useState` 控制显隐，默认隐藏）。
  - 点击大纲项 → 在 `.markdown-body` 容器内 `querySelector('[id=id]')` 并 `scrollIntoView({behavior:'smooth', block:'start'})`（容器为 `overflowY:auto` 的滚动父级；用容器 `scrollTop` 校正若被遮挡）。
- **文件**：`src/renderer/components/MarkdownViewer.tsx`
  - 用 `rehype`？避免新增依赖 → 改用**自定义渲染**：不复用 ReactMarkdown 默认 heading，而是给每个 `h1-h3` 注入 `id`。最简方案：写一个轻量 wrapper，利用 `components={{ h1: (p)=><h1 id={...}...>, ...}}` 传入 ReactMarkdown 的 `components` 重写项，`id` 由 `parseHeadings` 生成的同一 slug 规则派生（按文本哈希/序号）。
- **文件**：`src/renderer/styles/markdown.css` → 增加 `.outline-toggle`、`h1[id],h2[id],h3[id]`（`scroll-margin-top`）。

---

### 阶段 D：attach file（files 文件夹 + 图片预览 + 分页 + 兜底）

**目标**：笔记可附加任意格式文件；图片在 notes 显示预览；附件缺失时通知并可补齐/移除；notes 分页控制性能。

#### D1. 数据层
- **文件**：`src/shared/types.ts`
  - `Note` 增加 `attachments?: NoteFile[]`；`interface NoteFile { name:string; storedName:string; ext:string; size:number }`。
  - `IPC_CHANNELS` 增加 `FILES_SELECT`/`FILES_CHECK`/`NOTE_ATTACH` 等。
- **文件**：`src/main/store/note-store.ts`
  - `ensureDirectories` 增建 `files/` 目录。
- **文件**：`src/main/store/file-store.ts`（新建）
  - `saveFiles(syncDir, srcPaths[]): NoteFile[]`：把文件复制到 `sync_dir/files/{时间戳}_{原名}`（避免命名冲突），返回元数据。
  - `attachmentPath(syncDir, storedName)`：拼接绝对路径（供 renderer 显示）。
  - `checkFiles(syncDir, storedNames[]): Record<storedName, boolean>`：判存在性（兜底）。
- **文件**：`src/main/ipc/files.ipc.ts`（新建）→ `registerFilesIpc()`：`files:select`（`dialog.showOpenDialog` 多选）返回元数据、`files:check`（批量存在性）、`notes:attach`（noteId + 已选 storedName list → `updateNote` 追加 attachments）。
- **文件**：`src/main/ipc/register-all.ts` & `src/preload/index.ts`(+`index.d.ts`) → 暴露 `window.api.files.{select,check}`。

#### D2. 展示（图片预览 + 兜底）
- **文件**：`src/renderer/components/AttachmentList.tsx`（新建）
  - props: `attachments, noteId, onRefresh, onNotify`。
  - 挂载时 `files.check(attachments.map(a=>a.storedName))` 得到缺失集。
  - 图片（`png/jpg/jpeg/gif/webp/svg`）：`<img src="file:///...attachmentPath...">` 缩略预览（CSS max-width/height）。
  - 非图片：文件名 + 大小 + 点击 `shell.openPath`（经 IPC `files:open`）打开。
  - 兜底：缺失文件显示"文件缺失"徽标 + "补齐"（`files:select` 重新选文件替换）/"移除"（`notes:update` 去掉该 attachment）。
  - chunk 式挂载图片（分批 `setTimeout`/`requestIdleCallback`）避免一次性渲染大量 `img` 卡顿。
- **文件**：`src/renderer/components/NoteCard.tsx` → 挂 `AttachmentList`；卡片头部加"📎 添加附件"按钮（调 `files.select` 后 `notes:attach`）。
- **文件**：`src/renderer/styles/notecard.css` → 附件样式。

> 说明：分页已在阶段 A1 完成，保证"附件多时 notes 页分页展示"的性能诉求。

---

### 阶段 E：热力图/统计面板 + 通知中心 + diff 醒目显示

#### E1. 热力图/统计面板
- **文件**：`src/renderer/components/StatsPanel.tsx`（新建）+ `src/renderer/pages/StatsPage.tsx`（新建）
  - 数据源：`NotesContext.notes`（含 attachment 计数可从 `attachments` 累加）在 renderer 端聚合，**无需新 IPC**。
  - **热力图**：GitHub 风格，按日期（`created_at`）统计笔记数，CSS grid 渲染近 52 周色块（`var(--text-muted)`→`var(--accent)` 4 级梯度）；tooltip 显示日期/数量。
  - **统计卡片**：总笔记数、本周新增、连续打卡天数、各分类数量、各 `ai_status` 数量、各月份数量、附件总数。
- **文件**：`src/renderer/context/AppContext.tsx` → `pageIndex` 扩为 `0|1|2|3|4`；`StatsPage` 映射 `case 4`。
- **文件**：`src/renderer/components/Sidebar.tsx` → 新增"Stats 📊"导航项。
- **文件**：`src/main/index.ts`（无改动；渲染层已共享 notes 数据）。

#### E2. 通知中心
- **文件**：`src/renderer/context/NotificationContext.tsx`（新建 `NotificationProvider`）
  - 状态：`notifications: {id,type,message,time,read}[]` + `unreadCount`。
  - `push(type,message)`/`markRead`/`clearAll`。
  - 订阅现有 IPC 事件：`notes:updated`（"笔记已更新"）、`wikis:updated`（"Wiki 已更新"）、`inbox:processing-start/end`、`dream:phase-changed`/`finished`/`error`；本地：附件缺失、"配置保存"等。
  - 持久化：可选写 `~/.flownote_notifications.json`（`notifications:load/save` IPC，简单 JSON，保留最近 50 条）。
- **文件**：`src/renderer/components/NotificationBell.tsx`（新建）→ 铃铛 🔔 + 未读数徽标 + 下拉列表（点标记已读、可清除）。放 `Sidebar` 头部或 `AppShell` 右上角（建议 `AppShell` 内容区右上固定）。
- **文件**：`src/renderer/App.tsx` → 包裹 `NotificationProvider` 并挂 Bell。
- **文件**：`src/main/ipc/notifications.ipc.ts`（新建）+ `register-all.ts` + `IPC_CHANNELS` + `preload`。

#### E3. diff：醒目显示最近改动
- **背景**：LLM 整篇重编 wiki，无法做常规行 diff，方案为"保存时记录本版相对上一版新增的片段，加载时高亮"。
- **文件**：`src/main/utils/diff.ts`（新建）
  - `computeAddedLines(oldText, newText): string[]`：先归一化换行/BOM，按行拆，用**轻量 LCS（最长公共子序列，DP）**求出仅新增的行；返回每行去首尾空白后的文本（不区分标题层级）。
- **文件**：`src/main/store/wiki-store.ts`
  - `backupWiki`/`saveWiki` 前：读取旧内容，调用 `computeAddedLines(old, new)`；把 **新增片段集** 写入 `wikis/diffs/{category}_{month}.md.json`（同目录 sidecar），覆盖式。清除旧 sidecar 时机：每次 save 覆盖。
- **文件**：`src/main/ipc/wikis.ipc.ts` → `wikis:load-diff`（读 sidecar，返回 `string[]` 或空）。
- **文件**：`src/shared/types.ts` → `IPC_CHANNELS` 加 `WIKIS_LOAD_DIFF`；`preload` 暴露 `window.api.wikis.loadDiff(filename)`。
- **文件**：`src/renderer/pages/WikisPage.tsx`(或 `MarkdownViewer.tsx`)
  - 选中 wiki 时并行读 diff，构造"新增片段高亮集"。
  - 顶部加 **"最近改动"高亮开关**（默认仅在有 diff 时显示该开关；开启状态高亮）。
- **文件**：`src/renderer/components/MarkdownViewer.tsx`
  - 增加 prop `diffLines?: Set<string> | null`；渲染时对文本按行匹配：某行"规范化后文本"命中高亮集 → 包 `<mark className="wiki-diff-new">`。用 ReactMarkdown `components` 的 `p/li/h2/blockquote` 重写较繁琐；**最简实现**：对不命中高亮的行正常渲染，命中行用 `components.p` 检测——实现取"改前行文本→显示行"太复杂。**落地做法**：在传给 ReactMarkdown 前，对高亮行用 `==文本==`（markdown 高亮语法需插件）不可行 → 改为对命中行前缀注入 `<mark>` 需要 HTML 信任。**最终方案**：`MarkdownViewer` 用 `rehype-raw`? 不引依赖 → 采用**行匹配+划重点**：把 diff 高亮做在对应文字片段上，通过 `remark` 不现实。**折中**：高亮开关打开时，在 `.markdown-body` 之上叠加"本版新增句"浮层（一个可折叠的 `.wiki-diff-box` 列出新增行，点击可定位），并在 markdown 渲染的匹配段落加 CSS 类。为避免过度工程，优先实现 **diff-box 浮层 + 匹配段落高亮**（`components={p: 若段落文本命中高亮集之一则外加 .diff-highlight 类}`；段落级即可，够醒目）。

- **文件**：`src/renderer/styles/markdown.css` → `.diff-highlight { background: 类比 --accent 淡色; ... }`、`.wiki-diff-box { ... }`。

> 备注：为控制复杂度，diff 高亮采用**段落级 `components.p/li` 命中高亮**而非逐字，兼顾"醒目"与实现可行。若验证发现重排导致命中率低，再降级为仅 diff-box 浮层（不阻塞整体）。

---

## 假设与决策（Assumptions & Decisions）

1. **不新增重型依赖**：语音走 Web Speech API；diff 自写 LCS；都不引 npm 包。分页为客户端分页（NotesContext 仍持有全量数组，供搜索/热力图/统计使用）。
2. **附件路径**：`sync_dir/files/`，与 notes/wikis 平行同目录（todo 明确要求）。字体**不进 sync_dir**，放 `~/.flownote/fonts/` 避免坚果云同步体积。
3. **附件兜底**：存在性检测在渲染侧批量 IPC 完成；缺失时"补齐/移除"走现有 `notes:update` 通道，保持数据自洽。
4. **配置零迁移**：`AppConfig` 新增字段为可选（`font_file`/`font_family`），旧配置 `{...defaults,...data}` 合并不受影响（TROUBLESHOOTING §4 既定策略）。
5. **diff 时效**：sidecar 每次 wiki save 覆盖，仅代表"最近一次更新增了哪些行"，满足"最近改动能醒目显示"。
6. **语音识别失败**静默降级：环境不支持则按钮置灰，不抛错。
7. **notifications 持久化**：轻量 JSON，最多保留 50 条；无数据库。

---

## 涉及文件清单

**Main（新增）**：`font-store.ts`、`file-store.ts`、`diff.ts`、`polish.ipc.ts`、`fonts.ipc.ts`、`files.ipc.ts`、`notifications.ipc.ts`
**Main（修改）**：`store/note-store.ts`（files/ 目录、attachments）、`store/wiki-store.ts`（diff sidecar）、`ipc/wikis.ipc.ts`（load-diff）、`ipc/register-all.ts`、`llm/prompts.ts`（POLISH_PROMPT）
**Shared**：`types.ts`（Note.attachments、AppConfig.font_*、IPC_CHANNELS 新增）
**Preload**：`index.ts` + `index.d.ts`（api.polish、api.fonts、api.files、api.wikis.loadDiff、api.notifications）
**Renderer（新增）**：`StatsPage.tsx`、`StatsPanel.tsx`、`OutlinePanel.tsx`、`AttachmentList.tsx`、`FontSelector.tsx`、`NotificationBell.tsx`、`context/NotificationContext.tsx`、`utils/markdown.ts`
**Renderer（修改）**：`QuickInput.tsx`（mic/润色）、`NoteList.tsx`（分页）、`NoteCard.tsx`（memo+附件）、`NotesContext.tsx`（debounce）、`WikisPage.tsx`（大纲+diff）、`MarkdownViewer.tsx`（id 锚点+diff 高亮）、`ThemeContext.tsx`（字体注册）、`AppContext.tsx`（pageIndex 0-4）、`App.tsx`（NotificationProvider+Bell+StatsPage）、`Sidebar.tsx`（Stats 项）、`SettingsPage.tsx`（FontSelector）
**样式**：`global.css`（--font-sans）、`markdown.css`（字体/outline/diff 高亮）、`notecard.css`（附件）、`quickinput.css`（mic/润色按钮）、`sidebar.css`/新样式

---

## 验证步骤（Verification）

1. **构建门禁**：`npm run build`（electron-vite build）零新增 TS 错误（TROUBLESHOOTING §6 列出的 6 个历史错误除外，不改它们）。
2. **dev 手测**（`npm run dev`）：
   - **A**：连续快速输入不卡顿；列表分页正常；语音按钮可用（本机支持时）能出文字；润色按钮对文本生效且不改顺序。
   - **B**：wiki 正文中文字体明显改善；设置页导入 `.ttf` 后全局/正文字体切换生效；删除/恢复默认正常。
   - **C**：打开长 wiki，可切换大纲显隐，点击跳转定位正确。
   - **D**：给笔记附加图片 → notes 显示缩略图；附加 `.pdf` 等 → 显示链接可打开；手动删掉 files 里的图 → 卡片出现"缺失"，补齐/移除可用。
   - **E**：新增一条笔记并等待分类 → 触发 wiki 更新后，切到 wiki 打开该月文件，"最近改动"高亮/浮层显示新增片段；通知中心有对应事件且未读数正确；Stats 页热力图/统计数字与笔记一致。
3. **数据自洽**：`sync_dir/files/` 与实际附件一致；删除附件条目后无悬空引用。
4. 记录 `npm run build` 输出与手测结果到会话总结；不提交 git（用户未要求）。

---

## 风险与备注

- diff 高亮因 LLM 整篇重排可能命中率有限，已在方案中留降级路径（仅浮层）。
- 语音输入依赖系统/浏览器语音服务，离线/受限环境不可用属预期。
- 大量图片缩略采用 chunk 分批挂载 + 列表分页双重控持有节点数。
- exe 应用图标修复未纳入本批（需管理员权限打包）。