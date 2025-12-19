import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
// import { mockFileService } from './services/mockFileService'; // Using realFileService instead for real filesystem operations
import { realFileService, AppConfig, LLMProvider } from './services/realFileService';
import { createChatSession, sendMessage, ChatSession, getDefaultConfig, PROVIDER_DEFAULTS } from './services/llmService';
import { ChatMessage, Role } from './types';
import { 
  SaveIcon, SendIcon, RefreshIcon, PlusIcon, ArrowLeftIcon, FileIcon, EyeIcon, 
  EditIcon, SplitIcon, SidebarIcon, GripHorizontalIcon, FolderIcon, FolderOpenIcon, 
  TrashIcon, FilePlusIcon, FolderPlusIcon 
} from './components/Icon';
import ConfirmModal from './components/ConfirmModal';
import TrashView from './components/TrashView';
import QuickSettings from './components/QuickSettings';

// --- Types for File Tree ---
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

// --- Helper Functions ---
const buildFileTree = (files: string[], folders: string[]): FileNode[] => {
  const root: FileNode[] = [];

  // Helper to find or create a folder node at a specific level
  const findOrCreateFolder = (level: FileNode[], name: string, path: string): FileNode => {
    let node = level.find(n => n.name === name && n.type === 'folder');
    if (!node) {
      node = { name, path, type: 'folder', children: [] };
      level.push(node);
    }
    return node;
  };

  // 1. Process explicit folders
  folders.forEach(folderPath => {
    const parts = folderPath.split('/');
    let currentLevel = root;
    let currentPath = '';
    
    parts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const node = findOrCreateFolder(currentLevel, part, currentPath);
      currentLevel = node.children!;
    });
  });

  // 2. Process files
  files.forEach(filePath => {
    const parts = filePath.split('/');
    const fileName = parts.pop()!; // Last part is filename
    let currentLevel = root;
    let currentPath = '';

    // Traverse/Create path to file
    parts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const node = findOrCreateFolder(currentLevel, part, currentPath);
      currentLevel = node.children!;
    });

    // Add file node
    currentLevel.push({
      name: fileName,
      path: filePath,
      type: 'file'
    });
  });

  // Sort: Folders first, then files, alphabetically
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
    nodes.forEach(n => {
      if (n.children) sortNodes(n.children);
    });
  };

  sortNodes(root);
  return root;
};

// --- Resizer Components ---
const ResizerVertical = ({ onMouseDown, className }: { onMouseDown: (e: React.MouseEvent) => void, className?: string }) => (
  <div
    onMouseDown={onMouseDown}
    className={`w-1 hover:w-1.5 cursor-col-resize hover:bg-blue-500 bg-gray-800 transition-all z-50 flex-shrink-0 select-none ${className || ''}`}
  />
);

const ResizerHorizontal = ({ onMouseDown, className }: { onMouseDown: (e: React.MouseEvent) => void, className?: string }) => (
  <div
    onMouseDown={onMouseDown}
    className={`h-1.5 hover:h-2 cursor-row-resize hover:bg-blue-500 bg-gray-800 transition-all z-50 flex-shrink-0 select-none flex items-center justify-center ${className || ''}`}
  >
    <GripHorizontalIcon />
  </div>
);

// --- File Tree Node Component ---
const FileTreeNode = ({ 
  node, 
  depth = 0, 
  currentFilename, 
  onFileClick,
  onDelete,
  onFolderClick
}: { 
  node: FileNode; 
  depth?: number; 
  currentFilename: string | null;
  onFileClick: (path: string) => void;
  onDelete: (node: FileNode) => void;
  onFolderClick?: (path: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  
  // 判断是否是 .trash 文件夹
  const isTrashFolder = node.name === '.trash' && node.type === 'folder';
  // 判断是否在 .trash 文件夹内
  const isInsideTrash = node.path.startsWith('.trash/') || node.path === '.trash';

  if (node.type === 'folder') {
    // 文件夹样式 - 玻璃态设计
    const folderBaseStyle = isTrashFolder 
      ? 'mx-1 my-0.5 rounded-lg bg-gradient-to-r from-red-500/10 to-red-900/5 backdrop-blur-sm border border-red-500/20 shadow-lg shadow-red-900/10 hover:from-red-500/15 hover:to-red-900/10 hover:border-red-400/30' 
      : isInsideTrash
        ? 'mx-1 my-0.5 rounded-md bg-red-950/10 hover:bg-red-900/15 border-l-2 border-red-500/30'
        : 'mx-1 my-0.5 rounded-md hover:bg-white/5 hover:backdrop-blur-sm border-l-2 border-transparent hover:border-amber-400/50';
    
    const folderTextStyle = isTrashFolder 
      ? 'text-red-300 drop-shadow-[0_0_3px_rgba(239,68,68,0.3)]' 
      : isInsideTrash 
        ? 'text-red-300/70'
        : 'text-amber-300';

    const folderIconStyle = isTrashFolder 
      ? 'text-red-400 drop-shadow-[0_0_4px_rgba(239,68,68,0.4)]' 
      : isInsideTrash
        ? 'text-red-400/60'
        : 'text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.3)]';

    return (
      <div>
        <div 
          className={`flex items-center justify-between group px-3 py-2 text-sm cursor-pointer select-none transition-all duration-200 ${folderBaseStyle}`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => {
            setIsOpen(!isOpen);
            onFolderClick?.(node.path);
          }}
        >
          <div className="flex items-center gap-2.5 truncate">
            <span className={`transition-transform duration-200 ${isOpen ? 'scale-110' : ''} ${folderIconStyle}`}>
              {isOpen ? <FolderOpenIcon /> : <FolderIcon />}
            </span>
            <span className={`truncate font-medium ${folderTextStyle}`}>{node.name}</span>
            {isTrashFolder && (
              <span className="text-[10px] text-red-300/80 bg-red-500/20 backdrop-blur-sm px-2 py-0.5 rounded-full border border-red-500/30 shadow-inner">
                🗑️ 回收站
              </span>
            )}
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
            title={isInsideTrash ? "永久删除" : "移至回收站"}
          >
            <TrashIcon />
          </button>
        </div>
        {isOpen && node.children && (
          <div className={isTrashFolder ? 'ml-1 border-l border-red-500/10' : 'ml-1 border-l border-slate-700/30'}>
            {node.children.map(child => (
              <FileTreeNode 
                key={child.path} 
                node={child} 
                depth={depth + 1} 
                currentFilename={currentFilename}
                onFileClick={onFileClick}
                onDelete={onDelete}
                onFolderClick={onFolderClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 文件样式 - 玻璃态设计
  const isSelected = currentFilename === node.path;
  const fileBaseStyle = isSelected
    ? 'mx-1 my-0.5 rounded-lg bg-gradient-to-r from-blue-500/15 to-cyan-500/10 backdrop-blur-sm border border-blue-400/30 shadow-lg shadow-blue-500/10'
    : isInsideTrash
      ? 'mx-1 my-0.5 rounded-md hover:bg-red-500/10 border-l-2 border-transparent hover:border-red-400/40'
      : 'mx-1 my-0.5 rounded-md hover:bg-white/5 hover:backdrop-blur-sm border-l-2 border-transparent hover:border-slate-400/30';
  
  const fileTextStyle = isSelected
    ? 'text-blue-200 font-medium drop-shadow-[0_0_4px_rgba(59,130,246,0.4)]'
    : isInsideTrash
      ? 'text-red-300/60'
      : 'text-slate-300/90 group-hover:text-slate-100';

  const fileIconStyle = isSelected
    ? 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]'
    : isInsideTrash
      ? 'text-red-400/40'
      : 'text-slate-500 group-hover:text-slate-400';

  return (
    <div 
      className={`flex items-center justify-between group px-3 py-2 text-sm cursor-pointer select-none transition-all duration-200 ${fileBaseStyle}`}
      style={{ paddingLeft: `${depth * 16 + 12}px` }}
      onClick={() => onFileClick(node.path)}
    >
      <div className="flex items-center gap-2.5 truncate">
        <span className={`transition-all duration-200 ${fileIconStyle}`}><FileIcon /></span>
        <span className={`truncate ${fileTextStyle}`}>{node.name}</span>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(node); }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        title={isInsideTrash ? "永久删除" : "移至回收站"}
      >
        <TrashIcon />
      </button>
    </div>
  );
};

// --- Main Application Component ---
export default function App() {
  // --- State: Layout & Resizing ---
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(360);
  const [draftHeight, setDraftHeight] = useState(150);
  const [splitRatio, setSplitRatio] = useState(0.5); 
  const [isResizing, setIsResizing] = useState(false);
  
  // --- State: File System & Setup ---
  const [fileList, setFileList] = useState<string[]>([]);
  const [folderList, setFolderList] = useState<string[]>([]);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentFilename, setCurrentFilename] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<string>("");
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // --- 新的状态管理 ---
  const [config, setConfig] = useState<AppConfig | null>(null); // 初始为null，表示正在加载
  const [isPathSet, setIsPathSet] = useState(false);
  const [postsDetected, setPostsDetected] = useState<boolean | null>(null);
  const [postsPath, setPostsPath] = useState<string | null>(null);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>(""); // 用户当前选中的文件夹路径
  
  // View Modes: 'edit' | 'split'
  const [viewMode, setViewMode] = useState<'edit' | 'split'>('edit');

  // --- State: AI Chat ---
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [draftResponse, setDraftResponse] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatSessionRef = useRef<ChatSession | null>(null);

  // --- Refs ---
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const centerPanelRef = useRef<HTMLDivElement>(null);

  // --- Initialization ---
  useEffect(() => {
  const loadInitialConfig = async () => {
    try {
      const savedConfig = await realFileService.getConfig();
      setConfig(savedConfig);
      
      // 检查加载的路径是否有效
      if (savedConfig.hexo_path) {
        setIsPathSet(true);
        // 使用加载的配置初始化聊天会话
        chatSessionRef.current = createChatSession(savedConfig);
        // 尝试刷新文件系统以判断是否探测到 posts
        const ok = await refreshFileSystem();
        if (ok) {
          setPostsDetected(true);
        } else {
          setPostsDetected(false);
          setPostsPath(savedConfig.hexo_path || null);
        }
      }
    } catch (error) {
      console.error("Failed to load initial config from backend.", error);
      // 即使后端连接失败，也要设置默认配置让用户能看到设置界面
      setConfig(getDefaultConfig());
      // 不弹出alert，让用户可以在设置界面中配置（后端可能尚未启动）
    }
  };

  loadInitialConfig();
}, []); // 这个effect只在组件首次加载时运行一次

  // --- Resize Handlers ---
  const handleResizeStart = (e: React.MouseEvent, type: 'left' | 'right' | 'split' | 'draft') => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeftWidth = leftWidth;
    const startRightWidth = rightWidth;
    const startDraftHeight = draftHeight;
    const centerPanelRect = centerPanelRef.current?.getBoundingClientRect();

    const doDrag = (e: MouseEvent) => {
      if (type === 'left') {
        const newWidth = Math.max(0, Math.min(600, startLeftWidth + (e.clientX - startX)));
        setLeftWidth(newWidth);
      } else if (type === 'right') {
        const newWidth = Math.max(250, Math.min(800, startRightWidth - (e.clientX - startX)));
        setRightWidth(newWidth);
      } else if (type === 'draft') {
        const newHeight = Math.max(50, Math.min(600, startDraftHeight - (e.clientY - startY)));
        setDraftHeight(newHeight);
      } else if (type === 'split' && centerPanelRect) {
        const relativeX = e.clientX - centerPanelRect.left;
        const newRatio = Math.max(0.1, Math.min(0.9, relativeX / centerPanelRect.width));
        setSplitRatio(newRatio);
      }
    };

    const stopDrag = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  // --- File Logic ---
  const refreshFileSystem = async () => {
    try {
      const [files, folders] = await Promise.all([
        realFileService.getFiles(),
        realFileService.getFolders()
      ]);
      setFileList(files);
      setFolderList(folders);
      setFileTree(buildFileTree(files, folders));
      return true;
    } catch (e) {
      console.error("Failed to refresh file system", e);
      // ensure UI stays responsive
      setFileList([]);
      setFolderList([]);
      setFileTree([]);
      return false;
    }
  };

// App.tsx - 替换掉旧的 handleSetup

  const handleSetup = async () => {
    if (!config) return; // 如果配置还未加载，则不执行任何操作

    try {
      const resp = await realFileService.saveConfig(config);
      setIsPathSet(true);
      setPostsDetected(!!resp?.is_hexo);
      setPostsPath(resp?.posts_path || config.hexo_path || null);

      // 使用新的配置重新初始化聊天会话
      chatSessionRef.current = createChatSession(config);

      // 尝试刷新文件系统（始终尝试，以便显示 workspace 内容），但不让错误阻塞 UI
      const ok = await refreshFileSystem();
      if (!ok) setPostsDetected(false);
    } catch (error: any) {
      const detail = error.response?.data?.detail || "Is the backend running?";
      alert(`Failed to save configuration: ${detail}`);
      console.error(error);
    }
  };

  const handleCreatePostsFolder = async () => {
    try {
      const resp = await realFileService.initPostsFolder();
      setPostsDetected(true);
      setPostsPath(resp.posts_path || postsPath);
      // now that posts folder exists, refresh
      await refreshFileSystem();
    } catch (e: any) {
      alert(`Failed to create posts folder: ${e?.message || e}`);
    }
  };

  const handleQuickSettingsSaved = async (resp: any, savedConfig?: AppConfig) => {
    // 更新配置状态
    if (savedConfig) {
      setConfig(savedConfig);
      // 重新初始化聊天会话
      chatSessionRef.current = createChatSession(savedConfig);
    }
    setIsPathSet(true);
    setPostsDetected(!!resp?.is_hexo);
    setPostsPath(resp?.posts_path || savedConfig?.hexo_path || config?.hexo_path || null);
    const ok = await refreshFileSystem();
    if (!ok) setPostsDetected(false);
  };

  const handleFileClick = async (filename: string) => {
    setIsLoadingFile(true);
    try {
      const content = await realFileService.getPostContent(filename);
      setCurrentFilename(filename);
      setEditorContent(content);
    } catch (e) {
      console.error("Failed to load file", e);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleCreateFile = async () => {
    const prompt = currentFolder 
      ? `在 "${currentFolder}/" 下创建文件 (例如: new-post.md 或 subfolder/new-post.md):`
      : "创建文件 (例如: folder/new-post.md):";
    const filename = window.prompt(prompt);
    // 如果用户未提供路径则直接返回
    if (!filename || filename.trim() === '') return;

    // 构建完整路径：currentFolder + 用户输入
    const fullPath = currentFolder ? `${currentFolder}/${filename}` : filename;

    try {
      await realFileService.createPost(fullPath);
      // 创建成功后刷新文件系统
      await refreshFileSystem();
      // 自动选中并打开新创建的文件 (normalize same as service)
      const normalized = fullPath.trim().replace(/\\/g, '/');
      const finalName = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
      await handleFileClick(finalName);
    } catch (e: any) {
      // 提取并显示具体错误信息
      let detail: string = 'Unknown error';
      
      if (e?.response?.data?.detail) {
        detail = e.response.data.detail;
      } else if (e?.response?.data) {
        const data = e.response.data;
        detail = typeof data === 'string' ? data : JSON.stringify(data);
      } else if (e?.message) {
        detail = e.message;
      } else if (typeof e === 'string') {
        detail = e;
      }
      
      alert(`创建文件失败: ${detail}`);
      console.error('创建文件错误详情:', e);
    }
  };

  const handleCreateFolder = async () => {
    const prompt = currentFolder
      ? `在 "${currentFolder}/" 下创建文件夹 (例如: my-folder):`
      : "创建文件夹 (例如: my-folder 或 nested/folder):";
    const folderPath = window.prompt(prompt);
    // 如果用户未提供路径则直接返回
    if (!folderPath || folderPath.trim() === '') return;

    // 构建完整路径
    const fullPath = currentFolder ? `${currentFolder}/${folderPath}` : folderPath;

    try {
      await realFileService.createFolder(fullPath);
      // 创建成功后刷新文件系统
      await refreshFileSystem();
    } catch (e: any) {
      // 提供清晰的错误提示
      alert(`Failed to create folder: ${e.message}`);
      console.error(e);
    }
  };

  // Pending delete: shows confirmation modal first
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null);
  const [strictDeleteMode, setStrictDeleteMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('safe.strictDelete') === '1';
    } catch { return false; }
  });

  // Trash Modal state
  const [showTrash, setShowTrash] = useState(false);

  const handleDelete = async (node: FileNode) => {
    // 判断是否在 .trash 文件夹内
    const isInsideTrash = node.path.startsWith('.trash/') || node.path === '.trash';
    
    if (isInsideTrash) {
      // .trash 内的内容需要确认后永久删除
      const confirmMsg = `确定要永久删除 "${node.name}" 吗？此操作无法恢复。`;
      if (window.confirm(confirmMsg)) {
        try {
          // 使用永久删除API，传入相对于.trash的路径
          const trashRelativePath = node.path.replace(/^\.trash\/?/, '');
          if (trashRelativePath) {
            await realFileService.permanentDelete(trashRelativePath);
          } else {
            // 删除整个 .trash 文件夹
            await realFileService.emptyTrash();
          }
          await refreshFileSystem();
        } catch (e: any) {
          alert(`永久删除失败: ${e?.message || e}`);
        }
      }
    } else {
      // 普通文件/文件夹：显示确认弹窗，移至回收站
      setPendingDelete(node);
    }
  };

  const performDelete = async (node: FileNode) => {
    const typeLabel = node.type === 'folder' ? 'Folder' : 'File';
    try {
      if (node.type === 'folder') {
        await realFileService.deleteFolder(node.path);
      } else {
        await realFileService.deletePost(node.path);
      }

      // 如果当前打开的文件被删除，或位于被删除的文件夹内，则关闭编辑器并清空内容
      if (currentFilename && (currentFilename === node.path || currentFilename.startsWith(node.path + '/'))) {
        setCurrentFilename(null);
        setEditorContent("");
      }

      // 刷新文件系统并更新 UI
      await refreshFileSystem();

    } catch (e: any) {
      alert(`Failed to delete ${typeLabel}: ${e.message}`);
      console.error(e);
    } finally {
      setPendingDelete(null);
    }
  };

  const handleSaveFile = async () => {
    if (currentFilename) {
      await realFileService.savePostContent(currentFilename, editorContent);
      alert(`Saved ${currentFilename}`);
    }
  };

  // --- AI Logic ---
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    // 如果没有会话，尝试创建
    if (!chatSessionRef.current && config) {
      chatSessionRef.current = createChatSession(config);
    }
    
    if (!chatSessionRef.current) {
      setChatHistory(prev => [...prev, { role: Role.USER, text: chatInput }]);
      setChatHistory(prev => [...prev, { role: Role.MODEL, text: "请先在设置中配置 API Key" }]);
      setChatInput("");
      return;
    }

    const userMsg: ChatMessage = { role: Role.USER, text: chatInput };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput("");
    setIsAiThinking(true);
    try {
      const responseText = await sendMessage(chatSessionRef.current, userMsg.text);
      setChatHistory(prev => [...prev, { role: Role.MODEL, text: responseText }]);
      setDraftResponse(responseText);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: Role.MODEL, text: "抱歉，请求出错了，请检查 API 配置。" }]);
    } finally {
      setIsAiThinking(false);
      scrollToBottom();
    }
  };

  const handleNewTopic = () => {
    if (config) {
      chatSessionRef.current = createChatSession(config);
      setChatHistory([]);
      setDraftResponse("");
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleInsertContent = () => {
    if (!draftResponse || !editorRef.current) return;
    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textBefore = editorContent.substring(0, start);
    const textAfter = editorContent.substring(end);
    const newContent = textBefore + draftResponse + textAfter;
    setEditorContent(newContent);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.selectionStart = start + draftResponse.length;
        editorRef.current.selectionEnd = start + draftResponse.length;
      }
    }, 0);
  };

  // --- View: Path Setup ---
  if (!isPathSet) {
    // 添加一个加载状态，防止在配置加载完成前显示页面
    if (!config) {
      return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">Loading configuration...</div>;
    }

    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="w-full max-w-lg p-8 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <h1 className="text-2xl font-bold mb-6 text-blue-400">Hexo Copilot 设置</h1>
          <div className="space-y-4">
            {/* 工作目录路径 */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">工作目录路径（绝对路径）</label>
              <input 
                type="text" 
                value={config.hexo_path || ""} 
                onChange={(e) => setConfig(prev => ({...prev!, hexo_path: e.target.value}))}
                className="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-blue-500 outline-none"
                placeholder="例如: D:/Blog/my-hexo-site"
              />
            </div>

            {/* AI 模型选择 */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">AI 模型</label>
              <select 
                value={config.llm_provider}
                onChange={(e) => setConfig(prev => ({...prev!, llm_provider: e.target.value as 'gemini' | 'openai'}))}
                className="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-blue-500 outline-none"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
          
           {/* API Key */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">
                {config.llm_provider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}
              </label>
              <input 
                type="password" 
                value={config.providers[config.llm_provider]?.api_key || ""}
                onChange={(e) => {
                    const newKey = e.target.value;
                    setConfig(prev => ({
                        ...prev!,
                        providers: {
                            ...prev!.providers,
                            [prev!.llm_provider]: { api_key: newKey }
                        }
                    }));
                }}
                className="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-blue-500 outline-none"
                placeholder="Enter your API Key"
              />
            </div>

            <button 
              onClick={handleSetup} 
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded transition-colors mt-2"
            >
              保存并开始
            </button>
            <p className="text-xs text-gray-500 mt-2">设置后会递归扫描该目录下的所有 .md 文件和子文件夹</p>
          </div>
        </div>
      </div>
    );
  }

  // --- View: Main Layout ---
  return (
    <div className={`flex h-screen w-screen bg-gray-900 text-gray-200 overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      
      {/* 1. LEFT COLUMN: File Tree (Collapsible & Resizable) - 玻璃态设计 */}
      {isLeftPanelOpen && (
        <div 
          style={{ width: leftWidth }} 
          className="flex flex-col border-r border-white/5 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-gray-900/95 backdrop-blur-xl flex-shrink-0 transition-[width] duration-0 ease-linear shadow-2xl shadow-black/20"
        >
          {/* Header - 玻璃态 */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-500/5 to-purple-500/5 backdrop-blur-sm">
            <h2 className="font-bold text-gray-100 flex items-center gap-2">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 font-mono tracking-tight drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">Hexo</span>
              <span className="text-slate-300/80 font-light">Copilot</span>
            </h2>
            <div className="flex gap-1 p-1 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10">
              <button onClick={handleCreateFolder} className="p-1.5 hover:bg-amber-500/20 rounded-md text-slate-400 hover:text-amber-300 hover:shadow-[0_0_8px_rgba(251,191,36,0.3)] transition-all duration-200" title="新建文件夹">
                <FolderPlusIcon />
              </button>
              <button onClick={handleCreateFile} className="p-1.5 hover:bg-blue-500/20 rounded-md text-slate-400 hover:text-blue-300 hover:shadow-[0_0_8px_rgba(59,130,246,0.3)] transition-all duration-200" title="新建文件">
                <FilePlusIcon />
              </button>
              <button onClick={refreshFileSystem} className="p-1.5 hover:bg-green-500/20 rounded-md text-slate-400 hover:text-green-300 hover:shadow-[0_0_8px_rgba(34,197,94,0.3)] transition-all duration-200" title="刷新">
                <RefreshIcon />
              </button>
              <button onClick={() => setShowTrash(true)} className="p-1.5 hover:bg-red-500/20 rounded-md text-slate-400 hover:text-red-300 hover:shadow-[0_0_8px_rgba(239,68,68,0.3)] transition-all duration-200" title="回收站">
                <TrashIcon />
              </button>
            </div>
          </div>
          
          {/* 当前文件夹指示器 - 玻璃态 */}
          {currentFolder && (
            <div className="mx-2 mt-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/5 backdrop-blur-sm border border-blue-400/20 flex items-center justify-between text-xs shadow-lg shadow-blue-500/5">
              <div className="flex items-center gap-2 text-blue-300">
                <span className="drop-shadow-[0_0_4px_rgba(59,130,246,0.4)]"><FolderOpenIcon /></span>
                <span className="truncate font-medium" title={currentFolder}>{currentFolder}/</span>
              </div>
              <button 
                onClick={() => setCurrentFolder("")}
                className="text-blue-300/70 hover:text-blue-200 px-2.5 py-1 hover:bg-blue-400/20 rounded-md transition-all duration-200 border border-transparent hover:border-blue-400/30"
              >
                ← 根目录
              </button>
            </div>
          )}
          
          {/* File Tree */}
          <div className="flex-1 overflow-y-auto py-2">
             {fileTree.map(node => (
               <FileTreeNode 
                key={node.path} 
                node={node} 
                currentFilename={currentFilename}
                onFileClick={handleFileClick}
                onDelete={handleDelete}
                onFolderClick={(path) => setCurrentFolder(path)}
               />
             ))}

             {/* Confirmation modal for destructive actions */}
             <ConfirmModal
               open={!!pendingDelete}
               title="确认删除"
               message={pendingDelete ? `确定要删除 '${pendingDelete.name}' (${pendingDelete.type === 'folder' ? '文件夹' : '文件'}) 吗?` : undefined}
               strictLabel={strictDeleteMode && pendingDelete ? pendingDelete.name : undefined}
               confirmText="删除"
               cancelText="取消"
               onCancel={() => setPendingDelete(null)}
               onConfirm={() => pendingDelete && performDelete(pendingDelete)}
             />

             <TrashView open={showTrash} onClose={() => setShowTrash(false)} onChanged={() => { refreshFileSystem(); }} />
             {fileList.length === 0 && folderList.length === 0 && (
               <div className="flex flex-col items-center justify-center text-center text-sm mt-10 mx-4 py-8 rounded-xl bg-gradient-to-b from-slate-800/30 to-transparent backdrop-blur-sm border border-white/5">
                 <div className="text-4xl mb-3 opacity-50">📁</div>
                 <span className="text-slate-400">目录为空</span>
                 <span className="text-slate-500 text-xs mt-1">点击上方按钮创建文件或文件夹</span>
               </div>
             )}
          </div>
          
          {/* Footer Stats - 玻璃态 */}
          <div className="mx-2 mb-2 px-4 py-3 rounded-lg bg-gradient-to-r from-slate-800/50 to-slate-700/30 backdrop-blur-sm border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 shadow-[0_0_6px_rgba(59,130,246,0.5)]"></span>
                <span>{fileList.length} 文件</span>
              </span>
              <span className="flex items-center gap-2 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]"></span>
                <span>{folderList.length} 文件夹</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Resizer: Left <-> Center */}
      {isLeftPanelOpen && <ResizerVertical onMouseDown={(e) => handleResizeStart(e, 'left')} />}

      {/* 2. MIDDLE COLUMN: Preview & Editor */}
      <div ref={centerPanelRef} className="flex-1 flex flex-col min-w-0 bg-gray-900">
        
        {/* Toolbar */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-gray-900 flex-shrink-0">
          <div className="flex items-center gap-3 font-mono text-sm text-gray-300 truncate max-w-md">
            <button 
              onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} 
              className={`p-1.5 rounded transition-colors ${!isLeftPanelOpen ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              title="Toggle Sidebar"
            >
              <SidebarIcon />
            </button>
            <span>{currentFilename || "No file selected"}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex bg-gray-800 rounded p-0.5 mr-2">
               <button 
                onClick={() => setViewMode('edit')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1
                  ${viewMode === 'edit' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
               >
                 <EditIcon /> Edit
               </button>
               <button 
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1
                  ${viewMode === 'split' ? 'bg-blue-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
               >
                 <SplitIcon /> Split
               </button>
            </div>

            <button 
              onClick={handleSaveFile}
              disabled={!currentFilename}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors
                ${currentFilename 
                  ? 'bg-green-700 hover:bg-green-600 text-white shadow-sm' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
              `}
            >
              <SaveIcon />
              Save
            </button>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {isLoadingFile ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">Loading...</div>
          ) : (
            <>
              {/* SPLIT VIEW LOGIC */}
              {viewMode === 'split' && (
                <>
                  <div 
                    className="h-full bg-[#0d1117] overflow-y-auto border-r border-gray-800"
                    style={{ width: `${splitRatio * 100}%` }}
                  >
                     <div className="p-8 prose prose-invert prose-sm max-w-none">
                       <ReactMarkdown>{editorContent}</ReactMarkdown>
                     </div>
                  </div>
                  
                  <ResizerVertical onMouseDown={(e) => handleResizeStart(e, 'split')} />
                </>
              )}

              {/* EDITOR PANE */}
              <div 
                className="h-full flex flex-col flex-1"
              >
                <textarea
                  ref={editorRef}
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="w-full h-full p-6 bg-[#0d1117] text-gray-300 font-mono text-sm resize-none outline-none focus:ring-0 leading-relaxed"
                  spellCheck={false}
                  placeholder="Select a file to start writing..."
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Resizer: Center <-> Right */}
      <ResizerVertical onMouseDown={(e) => handleResizeStart(e, 'right')} />

      {/* 3. RIGHT COLUMN: AI Assistant (Resizable) */}
      <div 
        style={{ width: rightWidth }}
        className="flex flex-col bg-gray-900 border-l border-gray-800 flex-shrink-0"
      >
        
        {/* Header */}
        <div className="border-b border-gray-800 bg-gray-900 flex-shrink-0">
          <div className="h-14 flex items-center justify-between px-4">
            <span className="font-semibold text-gray-200">AI Assistant</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleNewTopic}
                className="text-xs flex items-center gap-1 text-gray-400 hover:text-white px-2 py-1 hover:bg-gray-800 rounded transition-colors"
                title="开始新对话"
              >
                <PlusIcon /> New Chat
              </button>

              <button 
                onClick={() => setShowQuickSettings(true)}
                className="text-xs flex items-center gap-1 text-gray-400 hover:text-white px-2 py-1 hover:bg-gray-800 rounded transition-colors"
              >
                <SidebarIcon /> Settings
              </button>
            </div>
          </div>
          
          {/* 模型选择和API Key 快速设置 */}
          <div className="px-4 pb-3 pt-1 space-y-2">
            <div className="flex gap-2 items-center">
              <select
                value={config?.llm_provider || 'openai'}
                onChange={(e) => {
                  const newProvider = e.target.value as LLMProvider;
                  setConfig(prev => {
                    if (!prev) return null;
                    const updated = {...prev, llm_provider: newProvider};
                    // 切换模型时重新初始化会话
                    chatSessionRef.current = createChatSession(updated);
                    return updated;
                  });
                }}
                className="flex-1 text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300"
              >
                <option value="openai">GPT</option>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="qwen">Qwen</option>
                <option value="deepseek">DeepSeek</option>
              </select>
              <button
                onClick={() => setShowQuickSettings(true)}
                className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                title="打开设置"
              >
                ⚙️
              </button>
            </div>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#161b22]">
          {chatHistory.length === 0 && (
            <div className="text-center text-gray-600 text-sm mt-10">
              Ask me to help you write, summarize, or format your Hexo blog post.
            </div>
          )}
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === Role.USER ? 'items-end' : 'items-start'}`}>
              <div 
                className={`
                  max-w-[95%] px-3 py-2 rounded-lg text-sm leading-relaxed overflow-x-hidden
                  ${msg.role === Role.USER 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-gray-800 text-gray-200 rounded-bl-none border border-gray-700'}
                `}
              >
                <div className="prose prose-invert prose-sm max-w-none break-words">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
           {isAiThinking && (
             <div className="flex items-start">
               <div className="bg-gray-800 px-3 py-2 rounded-lg rounded-bl-none border border-gray-700">
                 <div className="flex space-x-1">
                   <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                   <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                   <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 </div>
               </div>
             </div>
           )}
           <div ref={chatEndRef} />
        </div>

        {/* Resize Handle for Draft Area */}
        <ResizerHorizontal onMouseDown={(e) => handleResizeStart(e, 'draft')} />

        {/* AI Response Staging & Input Area */}
        <div className="bg-gray-900 p-4 pt-1 flex flex-col gap-3 flex-shrink-0 border-t border-gray-800">
          
          {/* Staging Area (Draft) */}
          {draftResponse && (
            <div 
              style={{ height: draftHeight }}
              className="flex flex-col gap-2 p-2 bg-gray-800 rounded border border-blue-900/50 relative group"
            >
               <div className="flex justify-between items-center text-xs text-blue-400 font-medium flex-shrink-0">
                 <span>Draft / Suggestion</span>
                 <button 
                  onClick={handleInsertContent}
                  disabled={!currentFilename}
                  className="flex items-center gap-1 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   <ArrowLeftIcon /> Insert at Cursor
                 </button>
               </div>
               <textarea
                 value={draftResponse}
                 onChange={(e) => setDraftResponse(e.target.value)}
                 className="w-full flex-1 bg-gray-900 text-gray-300 text-xs rounded p-2 border border-gray-700 focus:border-blue-500 outline-none resize-none font-mono"
               />
            </div>
          )}

          {/* User Input */}
          <div className="relative">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask AI Copilot..."
              className="w-full bg-gray-800 text-white rounded-md border border-gray-700 p-3 pr-10 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-20 shadow-sm"
            />
            <button 
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isAiThinking}
              className="absolute bottom-3 right-3 p-1.5 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <SendIcon />
            </button>
          </div>
        </div>

      </div>
    {showQuickSettings && (
      <QuickSettings
        open={showQuickSettings}
        onClose={() => setShowQuickSettings(false)}
        config={config}
        onSaved={(resp, savedConfig) => { setShowQuickSettings(false); handleQuickSettingsSaved(resp, savedConfig); }}
      />
    )}
    </div>
  );
}