# FlowNote

个人知识管理工具 — "冥想盆" (Pensieve)。快速捕获灵感笔记，AI 自动分类/打标签，每月 AI 生成精选 Wiki 页面，支持"Dream"知识整合洞察。

基于 React + Electron + TypeScript 构建。

## 环境要求

- Node.js 18+
- npm 9+

## 快速启动

```bash
# 安装依赖
npm install

# 开发模式 (热重载)
npm run dev

# 生产构建
npm run build
```

## 打包

### 核心原则

**打包前必须剪枝 devDependencies**。`node_modules` 含 ~750MB 的开发依赖（electron、typescript、webpack 等），如果不剪枝就打包，ASAR 会膨胀到 956MB，最终安装包 651MB。剪枝后 ASAR 仅 ~9MB，安装包 ~75MB。

### 打包流水线

`package:win` 脚本执行以下 5 个步骤：

```
1. electron-vite build     编译 TypeScript → out/
2. npm prune --omit=dev    删除 devDependencies（node_modules 从 724MB → ~50MB）
3. npm i --save-dev electron + electron-builder  装回打包必需的两个
4. npx electron-builder    生成安装包 → release/
5. npm install             恢复全部 devDependencies，回到开发状态
```

### 命令

```bash
npm run package:win      # Windows  NSIS 安装包
npm run package:mac      # macOS    DMG
npm run package:linux    # Linux    AppImage
```

等效于手动执行：

```bash
npm run build                          # 1. 编译
npm prune --omit=dev                   # 2. 剪枝
npm i --save-dev electron@30.5.1 electron-builder@26.8.1  # 3. 装回打包工具
npx electron-builder --win             # 4. 打包
npm install                            # 5. 恢复开发环境
```

### 构建产物

```
release/
├── FlowNote Setup 2.0.0.exe          # NSIS 安装包，~75MB
├── FlowNote Setup 2.0.0.exe.blockmap # 增量更新块映射
└── win-unpacked/                     # 解包目录
    └── resources/
        └── app.asar                  # 应用代码+生产依赖，~9MB
```

### 两文件关系

| 文件 | 内容 | 典型大小 |
|------|------|----------|
| `electron-builder.yml` | 打包配置：目标格式、图标、平台选项 | — |
| `package.json` → `scripts.package:*` | 打包流水线：5 步串联脚本 | — |

### electron-builder.yml 参考

```yaml
appId: com.flownote.app
productName: FlowNote

directories:
  buildResources: resources    # 图标等资源目录
  output: release              # 构建产物输出目录

npmRebuild: false              # 跳过原生模块重编译（项目无原生模块）

files:                         # 打入 ASAR 的文件
  - out/**/*                   # electron-vite 编译产物
  - package.json               # 运行时读取版本号等

win:
  target:
    - target: nsis             # NSIS 安装向导
      arch: [x64]
  icon: resources/icon.png
  signAndEditExecutable: false # 跳过代码签名（本地/未持有证书时必需）

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.png
  category: public.app-category.productivity

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: resources/icon.png
  category: Office
```

### 常见问题速查

#### 包体异常大

**现象**：安装包 >600MB，asar >900MB。
**原因**：`node_modules` 全部打入包内 — electron 本体(256MB)、@electron-forge(37MB)、typescript(23MB) 等 devDependencies 未排除。
**修复**：确保运行 `npm run package:win` 而非手动 `npx electron-builder`。脚本内置了 prune 步骤。如果手动操作，打包前必须 `npm prune --omit=dev`。

#### electron-builder 不在 devDependencies

```
⨯ Package "electron-builder" is only allowed in "devDependencies"
```
将 `electron-builder` 放在 `package.json` 的 `devDependencies` 中，不要放在 `dependencies`。

#### Windows 符号链接错误

```
ERROR: Cannot create symbolic link : 客户端没有所需的权限
```
`winCodeSign` 归档中包含 macOS 的 symlink，Windows 非管理员用户无法创建。修复：在 `electron-builder.yml` 的 `win` 段中设置 `signAndEditExecutable: false`，并清理缓存 `rm -rf ~/AppData/Local/electron-builder/Cache/winCodeSign`。

#### sign 属性不存在

```
configuration.win has an unknown property 'sign'
```
electron-builder 26.x 已移除 `sign`。改用 `signAndEditExecutable: false`。

#### 剪枝后 electron-builder 找不到

```
'electron-builder' 不是内部或外部命令
```
`npm prune --omit=dev` 会删除 electron-builder。脚本通过 `npx electron-builder` 调用（从 npm 缓存运行），并在 prune 后立即 `npm i --save-dev` 装回 electron 和 electron-builder，确保版本信息可用。

#### 无法确定 Electron 版本

```
Cannot compute electron version from installed node modules
```
electron-builder 需要从 `node_modules/electron/package.json` 读取具体版本号。`npm prune` 删掉了 electron，所以必须在打包前 `npm i --save-dev electron@30.5.1` 单独装回。

#### 清理所有缓存

```bash
# Windows
rm -rf ~/AppData/Local/electron-builder/Cache

# macOS
rm -rf ~/Library/Caches/electron-builder

# Linux
rm -rf ~/.cache/electron-builder
```

#### 多平台打包约束

- `CSC_IDENTITY_AUTO_DISCOVERY=false` 跳过 macOS 代码签名证书自动查找
- macOS DMG 只能在 macOS 主机上生成
- Linux AppImage 在任意发行版上可运行，无需安装

## 功能

| 功能 | 说明 |
|------|------|
| **快速笔记** | Shift+Enter 提交，毫秒级时间戳存储 |
| **AI 分类** | DeepSeek / Gemini 自动提取标题、分类、标签 |
| **Wiki 生成** | 月度 AI 精选 Wiki，按分类整理 |
| **Dream** | 3 阶段知识整合（Gather → Consolidate → Prune） |
| **Inbox** | 外部 inbox.txt 文件监控，原子化处理 |
| **主题** | 暗色 / 暖色 / 草稿 三套主题 |

## 数据存储

所有数据以 JSON + Markdown 文件存储于用户指定的 `sync_dir` 目录：

```
sync_dir/
├── notes/          # 笔记 JSON 文件 (13位时间戳.json)
├── wikis/          # AI Wiki Markdown ({分类}_{年}_{月}.md)
├── dreams/         # Dream 报告 Markdown
├── dream_state.json
└── inbox.txt
```

配置文件：`~/.flownote_config.json`

## 技术栈

- **前端**: React 18, TypeScript, CSS Custom Properties
- **桌面**: Electron 30
- **构建**: electron-vite, electron-builder
- **Markdown**: react-markdown, remark-gfm
- **日志**: Winston

## 架构

```
src/
├── main/           # Electron 主进程 (Node.js)
│   ├── store/      # 文件 I/O 数据层
│   ├── llm/        # LLM API 客户端 + 提示词
│   ├── services/   # 后台服务 (分类/Dream/Inbox)
│   ├── ipc/        # IPC 通道注册
│   └── utils/      # 工具 (日志/重试)
├── preload/        # Context bridge (安全边界)
├── renderer/       # React 应用
│   ├── pages/      # 4 个主页面
│   ├── components/ # 可复用组件
│   ├── context/    # React Context 状态管理
│   └── styles/     # CSS 样式 + 主题
└── shared/         # 共享类型定义
```

## 数据兼容

与 Python/PyQt6 版本的 FlowNote v1.x 完全数据兼容。可直接将现有 `sync_dir` 用于此版本，无需任何迁移。
