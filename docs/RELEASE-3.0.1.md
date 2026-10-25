# FlowNote 3.0.1 修复说明

- AI 输出不再被应用裁剪；常用长度仅为提醒。Flash 请求采用官方允许的最大输出额度；供应商返回截断时保留原文以供恢复。
- 笔记原文保存、AI 分类更新和 Markdown 阅读/预览均保留自然换行。
- 新建笔记保存提示 3.5 秒后消失，支持手动关闭；重复保存重新计时。
- AI 润色显示进行中、完成、失败状态；等待期间防止新编辑被旧结果覆盖。失败保留草稿。
- Wiki 修正展示可读的观点和依据，不再写入内部标记、笔记编号和修正编号。后台仍保留记录及版本历史。
- 官方独立 Search/Fetch 替代 Anthropic 搜索调用，保留查询规划、来源优先排序、PDF/公开替代版本、正文逐字核查及推荐归属复核。搜索摘要和权威分数不直接作为证据。
- 仅调用 DeepSeek Flash。旧 Gemini 配置须在设置中切换并填写 DeepSeek Key。
- 新增 Windows CI：类型检查、单元/界面测试、Electron 端到端、NSIS 编译；全部通过后自动发布 exe 和 SHA256SUMS。

## 反馈说明

有帮助／没帮助仅在当前资料库保存评价，不训练模型，不自动改写笔记或 Wiki。少对这类内容评论会将最近最多 8 条例子作为后续评论的偏好参考，随 AI 请求发给 DeepSeek，并非完全屏蔽。阅读推荐中的已读／不相关会作为避免重复推荐的参考；有帮助仅保存评价。

## 接口依据

- https://api-docs.deepseek.com/guides/search/
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/quick_start/pricing/

Search/Fetch 按请求收费，不虚构模型 token 用量。模型费用仍由实际 token 用量决定。
