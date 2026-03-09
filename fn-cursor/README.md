# FlowNote

本地优先的 AI 笔记桌面应用（Tauri v2 + React + Vite + TypeScript）。

## 功能概览

- **本地同步目录**：所有数据以 JSON/MD/TXT 保存在用户选择的目录，无云端数据库。
- **Inbox 抢占锁**：消化 `inbox.txt` 时先重命名为 `processing.txt`，处理完再重建空 `inbox.txt`。
- **AI 分析**：支持 Gemini / DeepSeek，自动为笔记生成 title、category、tags。
- **后台队列**：每 15 秒处理最多 3 条 pending 笔记，失败重试最多 3 次。
- **Wiki 增量生成**：笔记变为 done 且分类非 Inbox 时，自动更新对应 `Category_YYYY_MM.md`。
- **引用链接**：Wiki 中 `[细节](noteId)` 点击后在弹窗中展示原笔记。

## 开发与运行

### 环境要求

- Node.js 18+
- Rust 1.70+
- Windows：需安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含「使用 C++ 的桌面开发」），以提供 `link.exe`

### 命令

```bash
# 安装依赖
npm install

# 仅构建前端（不跑 Tauri）
npm run build

# 开发模式（需本机已配置好 Rust + MSVC）
npm run tauri dev

# 打包
npm run tauri build
```

### 首次使用

1. 启动后若未配置同步目录，会弹出设置。
2. 点击「选择目录」选择本地文件夹；将自动创建 `notes/`、`wikis/` 和 `inbox.txt`。
3. 在设置中选择 AI 服务商（Gemini / DeepSeek）并填写 API Key。
4. 在主界面输入内容并「添加」即可生成笔记；AI 会在后台分析并更新分类与 Wiki。

## 目录与数据格式

- `notes/`：单条笔记，文件名 `[13位时间戳].json`。
- `wikis/`：AI 生成的长文总结，如 `Tech_2024_05.md`。
- `inbox.txt`：供外部网盘同步的收集箱，按连续空行切分为多条笔记导入。

笔记 JSON 字段：`id`, `raw_content`, `created_at`, `ai_status`, `retry_count`, `title`, `category`, `tags`。

## 技术栈

- 前端：Vite、React 18、TypeScript、Tailwind CSS、shadcn/ui、react-markdown
- 桌面：Tauri v2，插件 fs / dialog / store
