很好！现在我们要实现设置界面和真实的文件系统读写。

1. **设置中心 (Settings Dialog)：** 
   - 使用 shadcn/ui 编写一个设置弹窗。
   - 包含：选择 AI 模型服务商 (下拉框: Gemini / DeepSeek)、填写 API Key 的密码框。
   - 包含：一个【选择同步目录】的按钮，点击时调用 Tauri 的 `dialog.open({ directory: true })` 让用户选择本地文件夹。
   - 选择目录后，立即调用 Tauri 的 `fs` API，在该目录下自动创建 `notes` 和 `wikis` 文件夹，以及一个空的 `inbox.txt`。
   - 将这些配置保存到我们上一步写的 `configStore` 中。

2. **本地笔记读写层 (`src/lib/fsService.ts`)：**
   - 编写 `saveNote(content)`：生成包含 13 位时间戳的 JSON，`ai_status` 设为 `pending`，保存到用户选择的目录下的 `/notes` 中。
   - 编写 `loadNotes()`：遍历 `/notes` 目录，读取所有正则匹配 `^\d{13}\.json$` 的文件，按照时间倒序返回数组。
   - 编写 `processInbox()`：按照全局指令里的**抢占锁机制**，将 `inbox.txt` 重命名、按连续空行切割文本、转为多个 pending 状态的 JSON 保存，最后重置 `inbox.txt`。

3. **UI 骨架缝合：** 
   - 在左侧侧边栏加上 Inbox, All Notes, 以及按 Category 过滤的菜单。
   - 在主界面渲染输入框和笔记卡片。
   - 应用启动时，读取配置，如果没设置目录则强制弹出 Settings；如果已设置，则执行一次 `processInbox()`，然后加载笔记列表。

请一步步实现，确保本地真实文件能正确生成。