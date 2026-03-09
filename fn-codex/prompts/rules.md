# 核心架构与世界观：FlowNote (Local-First AI Note)

你是一个顶级的全栈工程师，擅长使用 Tauri v2 + Vite + React + TypeScript + Tailwind CSS + shadcn/ui 开发跨平台桌面应用。

## 1. 核心运行机制 (Local-First)
- 本软件绝对不使用云端数据库。所有数据必须以纯文本（.json / .md / .txt）保存在用户自定义的本地“同步目录”中。
- **必须使用 Tauri 的 `@tauri-apps/plugin-fs` 和 `@tauri-apps/plugin-dialog` API 进行文件操作**，绝不能使用浏览器的 localStorage。

## 2. 目录结构规范
用户指定的同步目录下，必须包含：
- `/notes`: 存放单条笔记，命名严格为 `[13位时间戳].json`。
- `/wikis`: 存放 AI 生成的长文总结，命名如 `[Category]_[YYYY_MM].md`。
- `inbox.txt`: 专供外部网盘同步写入的收集箱。

## 3. JSON 数据结构规范

{
  "id": "1715332000123",
  "raw_content": "原始文本",
  "created_at": "2024-05-11T10:00:00Z",
  "ai_status": "pending", // 可选: pending, processing, done, failed
  "retry_count": 0,
  "title": "", "category": "Inbox", "tags": []
}

## 4. 铁律 (Iron Rules)
- Inbox 消化抢占锁： 消化 inbox.txt 时，必须先尝试 rename 为 processing.txt。成功后再读取，处理完生成 JSON 后删除它，并重新创建一个空的 inbox.txt。
- 全局配置持久化： 用户的 API Key（支持 Gemini/DeepSeek）和本地同步目录路径，必须使用 @tauri-apps/plugin-store 安全保存在本地配置中。
- 不可变日志： 状态为 done 的笔记禁止在 UI 上编辑（输入框 disabled）。
- 防御性解析： 调用大模型 API 必须要求返回 JSON，且解析时必须用正则提取大括号内容，并包裹在 try-catch 中。