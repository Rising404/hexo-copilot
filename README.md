# Hexo-Copilot

<p align="center">
  <strong>本地部署的 Hexo 博客 AI 写作助手</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-0.111.0-green?logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Python-3.9+-blue?logo=python" alt="Python">
</p>

**Hexo-Copilot** 是一款运行在你本地电脑上的全栈 Web 应用，为撰写和管理你的 Hexo 博客文章提供无缝的、IDE 般的体验。它集成了现代化的文件浏览器、功能丰富的 Markdown 编辑器，以及一个支持多模型的、具备上下文感知能力的强大 AI 助手。

告别在编辑器、文件管理器和 AI 聊天工具之间的频繁切换。Hexo-Copilot 将你需要的一切都整合进了一个优雅的界面中。

---

## ✨ 主要功能

### 📁 文件管理
- **集成文件浏览器**：直接在应用内浏览、创建、删除和管理你的文章与文件夹
- **灵活的工作目录**：支持任意目录作为工作空间，不强制要求 Hexo 目录结构
- **当前文件夹上下文**：新建文件/文件夹时自动创建在当前选中的目录下

### 🗑️ 回收站系统
- **软删除机制**：删除的文件会移动到 `.trash/<timestamp>/` 目录，而非直接删除
- **回收站管理**：可视化查看已删除项目，支持恢复或永久删除
- **批量操作**：支持批量恢复/删除，带进度条和取消功能
- **严格确认**：永久删除操作需要输入确认文本，防止误操作
- **清空回收站**：一键清空所有回收站内容（需输入 `EMPTY` 确认）

### ✍️ Markdown 编辑器
- **分屏视图**：支持编辑/分屏模式，实时预览 Markdown 渲染效果
- **语法高亮**：代码块自动语法高亮显示
- **自动保存提示**：编辑后可一键保存文件

### 🤖 多模型 AI 助手
- **多模型支持**：支持 5 种主流 AI 模型
  - **OpenAI** (GPT-4o, GPT-4o-mini 等)
  - **Claude** (Claude 3.5 Sonnet, Claude 3 Opus 等)
  - **Google Gemini** (Gemini 2.0 Flash, Gemini 1.5 Pro 等)
  - **通义千问** (qwen-turbo, qwen-plus, qwen-max)
  - **DeepSeek** (deepseek-chat, deepseek-coder)
- **国内代理支持**：所有模型都支持自定义 API 地址，方便国内用户使用
- **上下文对话**：AI 能够记住聊天历史，支持深入追问
- **智能内容插入**：将 AI 生成的内容一键插入到光标位置
- **草稿暂存区**：AI 回答会显示在独立区域，可编辑后再插入

### ⚙️ 快速设置
- **可视化配置界面**：模型选择、API Key、代理地址一目了然
- **无缝切换**：无需重启即可切换工作目录和 AI 模型
- **持久化存储**：配置保存在后端 `config.json` 中

---

## 🛠️ 技术栈

| 领域     | 技术                                    |
| :------- | :-------------------------------------- |
| 前端     | React 19, TypeScript, Vite, Tailwind CSS |
| 后端     | Python 3.9+, FastAPI, Uvicorn           |
| AI 模型  | OpenAI / Claude / Gemini / Qwen / DeepSeek |
| 开发工具 | Node.js, npm, `concurrently`            |

---

## 🚀 快速上手

### 先决条件

- **[Node.js](https://nodejs.org/)**: 版本 18.x 或更高
- **[Python](https://www.python.org/)**: 版本 3.9 或更高
- 任意一个支持的 AI 模型 API 密钥

### 一键启动（推荐）

1. **克隆仓库：**
   ```bash
   git clone https://github.com/Rising404/hexo-copilot.git
   cd hexo-copilot
   ```

2. **双击 `start-app.bat`** 即可自动：
   - 检测并安装依赖
   - 启动前端和后端服务
   - 自动打开浏览器

3. **（可选）创建桌面快捷方式：**
   - 双击 `create-shortcut.bat`
   - 桌面会出现 "Hexo Copilot" 快捷方式
   - 以后双击即可一键启动

### 手动安装

1. **安装前端依赖：**
   ```bash
   npm install
   ```

2. **配置 Python 后端环境：**
   ```bash
   # 创建虚拟环境
   python -m venv .venv
   
   # 激活虚拟环境
   # Windows:
   .\.venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate
   
   # 安装依赖
   pip install -r requirements.txt
   ```

3. **运行应用：**
   ```bash
   npm start
   ```

该命令会同时启动：
- **FastAPI 后端服务**：`http://127.0.0.1:8000`
- **Vite 前端服务**：`http://localhost:3000`

---

## 🎨 自定义图标

### 浏览器标签图标
将以下文件放到项目根目录：
- `favicon.ico` (32x32) - 浏览器标签图标

### 桌面快捷方式图标
将 `app.ico` 放到项目根目录，然后重新运行 `create-shortcut.bat`

> 💡 推荐使用 [favicon.io](https://favicon.io/) 生成全套图标

---

## 📡 后端 API

### 配置
| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/config` | 获取当前配置 |
| POST | `/api/config` | 保存配置 |

### 文件操作
| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/posts` | 获取所有文件列表 |
| GET | `/api/folders` | 获取所有文件夹列表 |
| GET | `/api/posts/{filename}` | 读取文件内容 |
| POST | `/api/posts/new` | 创建新文件 |
| PUT | `/api/posts/{filename}` | 更新文件内容 |
| DELETE | `/api/posts/{filename}` | 删除文件（移至回收站） |
| POST | `/api/folders/new` | 创建新文件夹 |
| DELETE | `/api/folders/{foldername}` | 删除文件夹（移至回收站） |

### 回收站
| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/trash` | 列出回收站内容 |
| POST | `/api/trash/restore` | 恢复项目 |
| DELETE | `/api/trash/{path}` | 永久删除项目 |
| DELETE | `/api/trash` | 清空回收站 |

---

## 🔧 Windows UTF-8 配置

如果在 Windows 终端中遇到中文乱码，请在 PowerShell 中运行：

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
```

或将这两行添加到你的 PowerShell 配置文件中以永久生效。

---

## 🛣️ 未来路线图

- [ ] **RAG 集成** - 使用本地向量数据库实现长期记忆
- [ ] **多模态支持** - 在 AI 聊天中支持上传和分析图片
- [ ] **编辑器升级** - 集成 CodeMirror/Monaco 实现语法高亮
- [ ] **主题定制** - 允许用户调整 UI 的颜色和外观
- [ ] **Hexo 命令集成** - 支持 `hexo generate` / `hexo deploy` 等命令

---

## 📄 License

MIT License
