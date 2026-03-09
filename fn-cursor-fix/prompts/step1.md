### 🚀 阶段一：项目初始化与底层基建


```text
你好！我们要开发一款名为 FlowNote 的本地优先 AI 笔记桌面端应用。
请帮我执行以下操作，搭建底层基建：

1. 使用 Tauri v2 + React + Vite + TypeScript 初始化项目。
2. 安装必要的依赖：Tailwind CSS, shadcn/ui, lucide-react。
3. 安装并配置 Tauri 核心插件：`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-store`。
4. **权限配置极其重要：** 请在 `src-tauri/tauri.conf.json` (或 capabilities 配置中) 开放文件系统 (fs) 读写任意目录的权限，以及 dialog 和 store 的权限。
5. 帮我写一个 `src/lib/configStore.ts`，封装对全局配置的读写（字段包含：`syncDirectory` 目录路径, `aiProvider` (Gemini或DeepSeek), `apiKey`）。

完成初始化并确保项目能通过 `npm run tauri dev` 正常启动后，请告诉我。