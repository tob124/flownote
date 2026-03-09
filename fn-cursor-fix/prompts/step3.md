文件系统已经跑通！现在我们实现 AI 处理队列。我们需要根据 Settings 里配置的 provider 动态调用 API。

1. **AI 服务封装 (`src/lib/aiService.ts`)：**
   - 读取 `configStore` 中的 `aiProvider` 和 `apiKey`。
   - 编写 `analyzeNote(content)` 函数。
   - 如果是 Gemini，调用 Google Generative AI REST API 或 SDK；如果是 DeepSeek，调用兼容 OpenAI 格式的 REST API。
   - Prompt 要求严格输出 JSON `{ title, category, tags }`。并写一个 `safeParseJSON` 函数用正则强洗数据。

2. **后台防弹队列 (`src/lib/queueService.ts`)：**
   - 写一个轮询函数（例如每 15 秒执行一次）。
   - 扫描 `/notes` 获取最多 3 条 `pending` 的笔记。
   - 处理前，先将它们的 `ai_status` 改为 `processing` 并写入硬盘。
   - 调用 `analyzeNote`。
   - 成功则更新字段，设为 `done` 并落盘。失败则检查 `retry_count`，>=3 次设为 `failed`，否则设回 `pending` 并落盘。

3. **UI 联动：**
   - 在 React 组件里启动这个轮询。
   - 给 `done` 状态的卡片禁用编辑功能（Append-Only 原则）。
   - 卡片状态变更时，React 列表应自动刷新。