# Hexo-Copilot

<p align="center">
  <img alt="Hexo-Copilot Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</p>

<p align="center">
  <strong>本地部署的 Hexo 博客 AI 写作助手 (Built with Google AI Studio)</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-0.111.0-green?logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Python-3.9+-blue?logo=python" alt="Python">
</p>

**Hexo-Copilot** 是一款运行在你本地电脑上的全栈Web应用，为撰写和管理你的Hexo博客文章提供无缝的、IDE般的体验。它集成了现代化的文件浏览器、功能丰富的Markdown编辑器，以及一个由Google Gemini模型驱动的、具备上下文感知能力的强大AI助手。

告别在编辑器、文件管理器和AI聊天工具之间的频繁切换。Hexo-Copilot将你需要的一切都整合进了一个优雅的界面中。
<br>
<br>


### ✨ 主要功能

*   **🖥️ 本地优先:** 你的文件始终保留在你的电脑上。本应用通过一个安全的本地后端，直接与你的Hexo项目文件系统进行交互。
*   **🗂️ 集成文件浏览器:** 直接在应用内浏览、创建、删除和管理你的文章与文件夹，其响应式的目录树结构会实时反映你的 `source/_posts` 目录。
*   **✍️ 高级Markdown编辑器:** 一个简洁、直观的编辑器，支持分屏视图以便实时预览你的Markdown内容。
*   **🧠 智能AI助手:**
    *   **上下文对话:** AI能够在一个会话中记住你的聊天历史，允许你进行深入的追问。
    *   **智能内容插入:** 将AI生成的内容（文本、代码片段等）一键插入到你光标所在的位置。
    *   **草稿与编辑:** AI的回答会出现在一个独立的暂存区，允许你在插入文章前对其进行编辑和优化。
*   **⚡ 现代化技术栈:** 前端采用 React, TypeScript 和 Vite 构建，后端则使用高性能的 Python FastAPI 服务器。
*   **🚀 一键启动:** 一条简单的 `npm start` 命令即可同时启动前后端服务。
<br>
<br>


### 🛠️ 技术栈

| 领域     | 技术                                    |
| :------- | :-------------------------------------- |
| 前端     | React 19, TypeScript, Vite, Tailwind CSS|
| 后端     | Python 3.9+, FastAPI, Uvicorn           |
| AI模型   | Google Gemini API (`gemini-1.5-flash`)  |
| 开发工具 | Node.js, npm, `concurrently`            |
<br>
<br>


### 🚀 快速上手

请遵循以下步骤在你的本地电脑上运行Hexo-Copilot。
<br>

#### [ 先决条件 ] 

*   **[Node.js](https://nodejs.org/)**: 版本 18.x 或更高。
*   **[Python](https://www.python.org/)**: 版本 3.9 或更高。
*   一个已存在于你本地文件系统的 **Hexo 博客项目**。
*   一个 **Google Gemini API 密钥**。你可以从 [Google AI Studio](https://ai.google.dev/) 获取。
<br>

#### [ 安装与配置 ]

1.  **克隆仓库:**
    ```bash
    git clone https://github.com/your-username/hexo-copilot.git
    cd hexo-copilot
    ```

2.  **安装前端依赖:**
    ```bash
    npm install
    ```

3.  **配置Python后端环境:**
    *   创建Python虚拟环境:
        ```bash
        python -m venv .venv
        ```
    *   激活虚拟环境:
        *   在 **Windows** 上: `.\.venv\Scripts\activate`
        *   在 **macOS/Linux** 上: `source .venv/bin/activate`
    *   根据“购物清单”安装后端依赖:
        ```bash
        pip install -r requirements.txt
        ```

4.  **配置应用:**
    *   **后端路径:** 打开 `backend/main.py` 文件，将 `HEXO_BASE_PATH` 变量的值更新为你Hexo博客根目录的**绝对路径**。
        ```python
        # backend/main.py
        # !!! 重要：请修改为你的真实博客路径 !!!
        HEXO_BASE_PATH = "D:/path/to/your/hexo-blog" 
        ```
    *   **API密钥:** API密钥将在首次运行时于应用的UI界面中进行配置。该密钥会安全地存储在你浏览器的本地存储中，不会被暴露。
<br>

#### [ 运行应用 ] 

完成所有设置后，你可以从项目的**根目录**下，用一条命令来启动整个应用：
```
npm start
```
该命令会同时启动：
*   位于 `http://127.0.0.1:8000` 的 **FastAPI 后端服务**。
*   位于 `http://localhost:3000` 的 **Vite 前端服务**。

你的默认浏览器应该会自动打开 `http://localhost:3000`。首次启动时，应用会提示你在设置界面输入你的Hexo路径和Gemini API密钥。

要停止应用，只需在运行 `npm start` 的终端里按下 `Ctrl+C` 即可。
<br>
<br>


### 🛣️ 未来路线图

这仅仅是个开始！以下是计划在未来版本中实现的一些功能：
- [ ] **v2.0: RAG 集成** - 使用本地向量数据库 (ChromaDB) 实现长期记忆。
- [ ] **v3.0: 多模态支持** - 在AI聊天中支持上传和分析图片。
- [ ] **编辑器升级** - 将标准文本区替换为专业的编辑器组件（如CodeMirror），以支持语法高亮和更强大的撤销/重做功能。
- [ ] **主题定制** - 允许用户调整UI的颜色和外观。