# FlowNote 踩坑手册（Troubleshooting）

> 给未来 AI 的现场记录：本仓库开发/打包环境中的已知坑、已做决策与核实结论。
> 整理时间：2026-08-06（v2.6.0 打包完成）。动手前先读本文件 + `todo.txt`（任务清单，含每项完成说明）。

## 1. 环境与网络（npm 安装）

- **`.npmrc` 用 npmmirror，不要改回清华镜像**：清华 tuna 镜像**不提供 `electron` 包**（`GET .../npm/electron` 返回 404），`npm i electron@30.5.1` 会失败。当前配置：
  ```
  registry=https://registry.npmmirror.com/
  electron_mirror=https://npmmirror.com/mirrors/electron/
  ```
  国内镜像安装 745 个包约 18 秒。
- **npm 11+ 的 allow-scripts 机制**：安装脚本（postinstall 等）默认被阻止，electron/esbuild 二进制不会下载。已在 package.json `allowScripts` 中批准 electron@30.5.1 / electron-winstaller / esbuild。**新增带安装脚本的依赖时需 `npm approve-scripts <pkg>`**。
- **git 依赖被墙**：lock 文件里有 `git+ssh://git@github.com/electron/node-gyp.git`，国内 SSH(22) 端口常被封锁导致 npm install 卡死。会话级绕过（不要改全局 git config，会破坏用户私库 SSH 认证）：
  ```powershell
  $env:GIT_CONFIG_COUNT='1'; $env:GIT_CONFIG_KEY_0='url.https://github.com/.insteadOf'; $env:GIT_CONFIG_VALUE_0='ssh://git@github.com/'
  ```
- **Electron 二进制**走 `electron_mirror`（npmmirror），实测 109MB 约 5 秒下完。

## 2. 打包（electron-builder 26.8.1 / NSIS）

- **winCodeSign 符号链接坑（最重要）**：electron-builder 26 的 **rcedit 内置于 winCodeSign 包**；该 7z 含 `darwin/*.dylib` 符号链接，**非管理员进程解压报"客户端没有所需的特权"**。后果链：`signAndEditExecutable: true` 时 → rcedit 无法执行 → **exe 图标打不上** → 且 NSIS 安装器步骤同样失败，整个打包挂掉。
  - 当前配置：`signAndEditExecutable: false`（electron-builder.yml）——应用 exe 保持默认 Electron 图标，但窗口图标（asar 内 icon.png）与**安装包图标**（NSIS 编译期嵌入 win.icon 转换的 ico）都正常。
  - 彻底修复 exe 图标：**管理员终端**执行 `npx electron-builder --win`（或将 `signAndEditExecutable` 改回 true）。也可开 Windows 开发者模式。已验证：普通权限下无解（缓存 hash 含时间戳，无法手工预置解压目录）。
  - 曾尝试的无效路径（勿重复）：手工解压 winCodeSign 到缓存（hash 每轮变化）、PS/cmd 传参跑 rcedit（引号被吃，须用 node execFileSync）。
- **`package:win` 脚本的 prune dance 很脆弱**：`npm prune --omit=dev && npm i electron electron-builder && npx electron-builder --win && npm install`——中途任何一步失败会把 node_modules 弄残（electron-vite 直接消失）。**直接 `npx electron-builder --win` 即可**（files 白名单只打 out/** 与 package.json，node_modules 本就不进包）。
- **加速工具链下载**：`$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'`（NSIS 等秒下）。
- **win.icon 的 PNG 必须正方形**：529x494 非方形图会转出问题。已用白底补边处理为 512x512（`resources/icon.png`，源图 `resources/Snipaste_2026-08-06_09-28-40.png` 保留；杂散文件 `resources/屏幕截图 2026-05-08 160845.ico` 是截图伪装，勿用）。
- **验证 exe/安装包图标的方法**：`System.Drawing.Icon::ExtractAssociatedIcon` + 平均色对比——默认 electron 图标 RGB≈(57,63,73) 深色；本项目图标 RGB≈(157,203,229) 浅蓝。注意 System.Drawing 解析含 256px PNG 压缩帧的 ico 会报"range extends past end"（正常现象，不代表文件损坏）。
- **版本号位置**（升级时同步改）：`package.json` / `package-lock.json`（根包**两处**：文件头 + `packages.""` 条目，勿动依赖的 2.1.0）/ `src/renderer/components/Sidebar.tsx` 页脚。当前 v2.6.0。

## 3. DeepSeek API（2026-08 已实测核实）

- **端点 `/v1/chat/completions` 保持不动**！实测：`/v1/chat/completions` + `model=deepseek-v4-flash` 返回 200 正常出结果；`/v1/flash/completions` 等所有 /flash 路径全部 404。
- 网上/用户流传的"接口从 /chat 更新为 /flash"是**模型名迁移**（`deepseek-chat` → `deepseek-v4-flash`，2026-07-24 硬截止）的误读——代码中模型名早已是 `deepseek-v4-flash`（llm-client.ts `DEFAULT_DEEPSEEK_MODEL`），迁移早已完成。**不要改端点**。
- 探测 API 路径的要点：**假 key 全部返回 401**（鉴权先于路径校验，无法区分路径）；必须用真实 key（在 `~/.flownote_config.json`）区分 404/400/200。
- 分类/整理请求的失败（如 404）只进主进程日志，UI 无提示——改动后务必看日志验证。

## 4. 数据与配置决策

- **默认分类**已改为 `个人、工作、想法、项目、学习`（`src/shared/types.ts` DEFAULT_CATEGORIES）。**不迁移**已有 `~/.flownote_config.json`（用户 2026-08-06 确认）——旧配置用户需在设置里手动改；旧笔记的分类标签不重分类（保留如"灵感"）。
- **inbox 读取**：启动立即读一次 + 每 10 秒轮询（`inbox-watcher.ts`，无 fs.watch）。`processInbox` 的原子 rename（inbox.txt → processing.txt）就是互斥锁，轮询重复触发安全；坚果云占用文件时 rename 失败自动等下个周期。处理出新笔记后 poke 分类器（不再等 15 秒）。
- **换行符兼容**：`inbox-store.ts` 分割前归一化（去 BOM、`\r\n`/`\r` → `\n`、空白行 `[ \t]*` 可作分隔）；`wiki-writer.ts` `stripHeading` 同样归一化（LLM 返回 CRLF 时 `'# xxx\r'` 匹配不上 `'# '` 前缀）。
- sync_dir 在坚果云目录：`C:\Users\12461\Nutstore\1\冥想盆AI笔记软件（自制）\flownotedata`（**含中文**，脚本读配置必须 UTF-8 显式编码，见下节）。
- 分类器向 CLASSIFY_PROMPT 动态注入 `config.categories`，改默认分类无需动 prompts.ts。

## 5. PowerShell 5.1 坑（本机 shell）

- **Get-Content 默认 ANSI 读 UTF-8 文件 → 中文乱码**（如 sync_dir 变"鍐ユ兂鐩…"）。必须 `[System.IO.File]::ReadAllText($path)`（自动识别 UTF-8）。
- **`ConvertFrom-Json` 对 package-lock.json 这类大文件失败**（PS 5.1 解析器限制）→ 直接 `Get-Content -TotalCount N` 看文件头。
- **`Invoke-WebRequest` 没有 `-SkipHttpErrorCheck`**（PS 6+ 才有）。捕获 4xx 要 catch `WebException` 并读 `$_.Exception.Response` 的 status + stream。
- **向 native exe 传含引号的参数会被剥引号**（PS 5.1 参数封送坑，`cmd /c` 也一样）→ 用 `node -e "execFileSync(...)"`（argv 数组，可靠）。
- **`Set-Content -Encoding utf8` 会写 BOM** → 需要无 BOM 时用 `[System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($false)))`。
- 控制台里 Electron 中文日志显示乱码（编码显示问题，数据本身正常）。
- `-SkipHttpErrorCheck` / `ConvertFrom-Json -AsHashtable` / `??` 等 PS 7 特性一律不可用；`&&` 链用 `A; if ($?) { B }`。

## 6. 遗留事项（接手时可继续）

- **exe 应用图标**待管理员权限打包（见 §2）——todo.txt 有完整步骤。
- **tsc --noEmit 有 6 个改动前就存在的错误**（`dream.ipc.ts` `getOwnerBrowserWindow` 不存在于 WebContents；`llm-client.ts` `data: unknown`×2；`retryOnFailure` 泛型×4）——与本项目功能无关，修 `retryOnFailure` 泛型时注意其签名是 `(...args: unknown[]) => unknown`。
- **无测试/lint 基础设施**（无 vitest/jest/eslint 配置）——验证靠 `npm run build` + dev 模式手测。
- **stale `processing.txt` 恢复**：崩溃残留的 processing.txt 不会被回收（rename 失败即返回），可做启动恢复，属优化项。
- 图标处理若想提升小尺寸清晰度：用 png-to-ico 生成多尺寸 ico（16–256）替换单帧 256 的自动转换结果（当前未引入新依赖）。
