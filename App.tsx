import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
// import { mockFileService } from './services/mockFileService'; // Using realFileService instead for real filesystem operations
import { realFileService, AppConfig, LLMProvider } from './services/realFileService';
import { createChatSession, sendMessage, ChatSession, getDefaultConfig, PROVIDER_DEFAULTS } from './services/llmService';
import { ChatMessage, Role } from './types';
import { 
  SaveIcon, SendIcon, RefreshIcon, PlusIcon, ArrowLeftIcon, FileIcon, EyeIcon, 
  EditIcon, SplitIcon, SidebarIcon, GripHorizontalIcon, FolderIcon, FolderOpenIcon, 
  TrashIcon, FilePlusIcon, FolderPlusIcon, PencilIcon, ImageIcon, MarkdownIcon, ImagePlusIcon 
} from './components/Icon';
import ConfirmModal from './components/ConfirmModal';
import TrashView from './components/TrashView';
import QuickSettings from './components/QuickSettings';
import ErrorBoundary from './components/ErrorBoundary';

// 防抖工具函数
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// API基础URL用于图片
const API_BASE_URL = 'http://127.0.0.1:8000';

// 图片文件扩展名
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];

// 判断是否为图片文件
const isImageFile = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
};

// 判断是否为Markdown文件
const isMarkdownFile = (filename: string): boolean => {
  return filename.toLowerCase().endsWith('.md');
};

// --- Types for File Tree ---
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  fileType?: 'markdown' | 'image' | 'other';
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

    // Determine file type
    let fileType: 'markdown' | 'image' | 'other' = 'other';
    if (isMarkdownFile(fileName)) {
      fileType = 'markdown';
    } else if (isImageFile(fileName)) {
      fileType = 'image';
    }

    // Add file node
    currentLevel.push({
      name: fileName,
      path: filePath,
      type: 'file',
      fileType
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

// --- Optimized Markdown Preview Component ---
interface MarkdownPreviewProps {
  content: string;
  currentFilename: string | null;
}

const MarkdownPreview = React.memo(({ content, currentFilename }: MarkdownPreviewProps) => {
  const [renderError, setRenderError] = React.useState<string | null>(null);

  // 重置错误状态当内容改变时
  React.useEffect(() => {
    setRenderError(null);
  }, [content]);

  if (renderError) {
    return (
      <div className="p-6 space-y-4">
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 text-red-300">
          <div className="font-bold mb-2">⚠️ 预览渲染失败</div>
          <div className="text-sm opacity-90">{renderError}</div>
          <button 
            onClick={() => setRenderError(null)}
            className="mt-3 px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm"
          >
            重新尝试
          </button>
        </div>
        <div className="text-gray-400 text-sm font-mono whitespace-pre-wrap">{content}</div>
      </div>
    );
  }

  try {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt, ...props }) => {
            // 处理图片路径
            let imageSrc = src || '';
          
          // 如果是相对路径（不是http/https/data开头）
          if (imageSrc && !imageSrc.startsWith('http://') && !imageSrc.startsWith('https://') && !imageSrc.startsWith('data:')) {
            // 获取当前文件的目录和文件名（不含扩展名）
            let currentDir = '';
            let currentFileBaseName = '';
            if (currentFilename) {
              const lastSlash = currentFilename.lastIndexOf('/');
              currentDir = lastSlash > 0 ? currentFilename.substring(0, lastSlash) : '';
              // 获取文件名（不含扩展名），用于查找图片文件夹
              const fileName = lastSlash > 0 ? currentFilename.substring(lastSlash + 1) : currentFilename;
              currentFileBaseName = fileName.replace(/\.md$/i, '');
            }
            
            // 解析相对路径
            let resolvedPath = imageSrc;
            if (imageSrc.startsWith('./')) {
              const relativePart = imageSrc.substring(2);
              // 检查是否只是图片文件名（不含目录）
              if (relativePart && !relativePart.includes('/')) {
                // ./image.png -> 转换为 ./笔记同名文件夹/image.png
                const folderPath = currentDir ? `${currentDir}/${currentFileBaseName}` : currentFileBaseName;
                resolvedPath = `${folderPath}/${relativePart}`;
              } else {
                // ./hello/image.png -> hello/image.png (相对于当前目录)
                resolvedPath = currentDir ? `${currentDir}/${relativePart}` : relativePart;
              }
            } else if (imageSrc.startsWith('../')) {
              // 处理 ../ 的情况
              const parts = currentDir ? currentDir.split('/') : [];
              let imgParts = imageSrc.split('/');
              while (imgParts[0] === '..' && parts.length > 0) {
                parts.pop();
                imgParts.shift();
              }
              // 移除剩余的 ..
              imgParts = imgParts.filter(p => p !== '..');
              resolvedPath = [...parts, ...imgParts].join('/');
            } else if (!imageSrc.startsWith('/')) {
              // 普通相对路径 (不以 ./ 或 ../ 开头)
              resolvedPath = currentDir ? `${currentDir}/${imageSrc}` : imageSrc;
            }
            
            // 使用后端API提供图片 - 需要正确处理路径编码
            // 先按 / 分割，对每个部分单独编码，再用 / 连接
            const pathParts = resolvedPath.split('/');
            const encodedPath = pathParts.map(part => encodeURIComponent(part)).join('/');
            imageSrc = `${API_BASE_URL}/api/assets/${encodedPath}`;
          }
          
          return (
            <img 
              src={imageSrc} 
              alt={alt} 
              {...props} 
              style={{ maxWidth: '100%' }} 
              onError={(e) => {
                // 图片加载失败时显示替代文本
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent && !parent.querySelector('.img-error')) {
                  const errorDiv = document.createElement('div');
                  errorDiv.className = 'img-error p-2 bg-yellow-900/20 border border-yellow-500/50 rounded text-yellow-300 text-sm';
                  errorDiv.textContent = `⚠️ 图片加载失败: ${alt || src}`;
                  parent.appendChild(errorDiv);
                }
              }}
            />
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
    );
  } catch (error) {
    // 捕获渲染错误
    setRenderError(error instanceof Error ? error.message : '未知渲染错误');
    return null;
  }
}, (prevProps, nextProps) => {
  // 只有当content或currentFilename改变时才重新渲染
  return prevProps.content === nextProps.content && 
         prevProps.currentFilename === nextProps.currentFilename;
});

MarkdownPreview.displayName = 'MarkdownPreview';

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
  onFolderClick,
  onMove,
  onRename,
  draggedItem,
  setDraggedItem,
  dropTarget,
  setDropTarget
}: { 
  node: FileNode; 
  depth?: number; 
  currentFilename: string | null;
  onFileClick: (path: string) => void;
  onDelete: (node: FileNode) => void;
  onFolderClick?: (path: string) => void;
  onMove?: (source: string, destination: string) => void;
  onRename?: (node: FileNode) => void;
  draggedItem?: string | null;
  setDraggedItem?: (path: string | null) => void;
  dropTarget?: string | null;
  setDropTarget?: (path: string | null) => void;
}) => {
  // 默认折叠文件夹，避免初始加载时全部展开
  const [isOpen, setIsOpen] = useState(false);
  
  // 判断是否是 .trash 文件夹
  const isTrashFolder = node.name === '.trash' && node.type === 'folder';
  // 判断是否在 .trash 文件夹内
  const isInsideTrash = node.path.startsWith('.trash/') || node.path === '.trash';

  // 拖拽事件处理
  const handleDragStart = (e: React.DragEvent) => {
    if (isInsideTrash) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem?.(node.path);
  };

  const handleDragEnd = () => {
    setDraggedItem?.(null);
    setDropTarget?.(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (node.type !== 'folder' || isInsideTrash) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget?.(node.path);
  };

  const handleDragLeave = () => {
    setDropTarget?.(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (sourcePath && node.type === 'folder' && sourcePath !== node.path && !isInsideTrash) {
      // 防止移动到自己的子目录
      if (!node.path.startsWith(sourcePath + '/')) {
        onMove?.(sourcePath, node.path);
      }
    }
    setDraggedItem?.(null);
    setDropTarget?.(null);
  };

  const isDragOver = dropTarget === node.path && node.type === 'folder';
  const isDragging = draggedItem === node.path;

  if (node.type === 'folder') {
    // 文件夹样式 - 玻璃态设计
    const folderBaseStyle = isTrashFolder 
      ? 'mx-1 my-0.5 rounded-lg bg-gradient-to-r from-red-500/10 to-red-900/5 backdrop-blur-sm border border-red-500/20 shadow-lg shadow-red-900/10 hover:from-red-500/15 hover:to-red-900/10 hover:border-red-400/30' 
      : isInsideTrash
        ? 'mx-1 my-0.5 rounded-md bg-red-950/10 hover:bg-red-900/15 border-l-2 border-red-500/30'
        : isDragOver
          ? 'mx-1 my-0.5 rounded-md bg-blue-500/20 border-2 border-blue-400 border-dashed'
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
      <div className={isDragging ? 'opacity-50' : ''}>
        <div 
          className={`flex items-center justify-between group px-3 py-2 text-sm cursor-pointer select-none transition-all duration-200 ${folderBaseStyle}`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          draggable={!isInsideTrash}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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
          <div className="flex items-center gap-1">
            {!isInsideTrash && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRename?.(node); }}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all duration-200"
                title="重命名"
              >
                <PencilIcon />
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(node); }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
              title={isInsideTrash ? "永久删除" : "移至回收站"}
            >
              <TrashIcon />
            </button>
          </div>
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
                onMove={onMove}
                onRename={onRename}
                draggedItem={draggedItem}
                setDraggedItem={setDraggedItem}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 文件样式 - 玻璃态设计
  const isSelected = currentFilename === node.path;
  const isImage = node.fileType === 'image';
  const isMarkdown = node.fileType === 'markdown';
  
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

  // 根据文件类型设置不同的图标颜色
  const fileIconStyle = isSelected
    ? 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]'
    : isInsideTrash
      ? 'text-red-400/40'
      : isImage
        ? 'text-purple-400 group-hover:text-purple-300'
        : isMarkdown
          ? 'text-green-400 group-hover:text-green-300'
          : 'text-slate-500 group-hover:text-slate-400';

  // 根据文件类型选择图标
  const renderFileIcon = () => {
    if (isImage) return <ImageIcon />;
    if (isMarkdown) return <MarkdownIcon />;
    return <FileIcon />;
  };

  return (
    <div 
      className={`flex items-center justify-between group px-3 py-2 text-sm cursor-pointer select-none transition-all duration-200 ${fileBaseStyle} ${isDragging ? 'opacity-50' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 12}px` }}
      draggable={!isInsideTrash}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onFileClick(node.path)}
    >
      <div className="flex items-center gap-2.5 truncate">
        <span className={`transition-all duration-200 ${fileIconStyle}`}>{renderFileIcon()}</span>
        <span className={`truncate ${fileTextStyle}`}>{node.name}</span>
        {isImage && (
          <span className="text-[10px] text-purple-300/70 bg-purple-500/15 px-1.5 py-0.5 rounded-full">
            图片
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!isInsideTrash && (
          <button 
            onClick={(e) => { e.stopPropagation(); onRename?.(node); }}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all duration-200"
            title="重命名"
          >
            <PencilIcon />
          </button>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(node); }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          title={isInsideTrash ? "永久删除" : "移至回收站"}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
};

// --- Main Application Component ---
export default function App() {
  // --- State: Layout & Resizing ---
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
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
  const [previewContent, setPreviewContent] = useState<string>(""); // 用于防抖的预览内容
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // --- State: Drag & Drop ---
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // --- State: Rename Modal ---
  const [renameNode, setRenameNode] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // --- State: Undo/Redo History ---
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const lastContentRef = useRef<string>(""); // 用于跟踪上一次内容，避免重复记录
  
  // 用于防抖更新的refs
  const previewUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const undoStackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- 新的状态管理 ---
  const [config, setConfig] = useState<AppConfig | null>(null); // 初始为null，表示正在加载
  const [isPathSet, setIsPathSet] = useState(false);
  const [postsDetected, setPostsDetected] = useState<boolean | null>(null);
  const [postsPath, setPostsPath] = useState<string | null>(null);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>(""); // 用户当前选中的文件夹路径
  
  // View Modes: 'edit' | 'split'
  const [viewMode, setViewMode] = useState<'edit' | 'split'>('edit');
  // Scroll sync toggle
  const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(true);
  // Cross-pane highlight state
  const [crossHighlight, setCrossHighlight] = useState<{ text: string; source: 'editor' | 'preview' | null }>({ text: '', source: null });

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
  const previewRef = useRef<HTMLDivElement>(null);
  const scrollSyncSourceRef = useRef<'editor' | 'preview' | null>(null);

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

  // 初始化时同步预览内容
  useEffect(() => {
    setPreviewContent(editorContent);
  }, [currentFilename]); // 当文件改变时同步

  // 清理定时器
  useEffect(() => {
    return () => {
      if (previewUpdateTimerRef.current) clearTimeout(previewUpdateTimerRef.current);
      if (undoStackTimerRef.current) clearTimeout(undoStackTimerRef.current);
    };
  }, []);
  const handleEditorChange = useCallback((newContent: string) => {
    // 立即更新编辑器内容，保持输入流畅
    setEditorContent(newContent);
    setSaveStatus('unsaved');
    
    // 防抖更新预览内容（300ms延迟）
    if (previewUpdateTimerRef.current) {
      clearTimeout(previewUpdateTimerRef.current);
    }
    previewUpdateTimerRef.current = setTimeout(() => {
      setPreviewContent(newContent);
    }, 300);
    
    // 防抖更新撤销栈（1000ms延迟，避免每次按键都记录）
    if (lastContentRef.current !== newContent) {
      if (undoStackTimerRef.current) {
        clearTimeout(undoStackTimerRef.current);
      }
      undoStackTimerRef.current = setTimeout(() => {
        setUndoStack(prev => {
          // 限制历史栈大小为100条
          const newStack = [...prev, lastContentRef.current];
          return newStack.slice(-100);
        });
        setRedoStack([]); // 新的编辑会清空重做栈
        lastContentRef.current = newContent;
      }, 1000);
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const previousContent = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    
    // 将当前内容推入重做栈
    setRedoStack(prev => [...prev, editorContent]);
    setUndoStack(newUndoStack);
    setEditorContent(previousContent);
    setPreviewContent(previousContent); // 同步更新预览
    lastContentRef.current = previousContent;
    setSaveStatus('unsaved');
  }, [undoStack, editorContent]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const nextContent = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    
    // 将当前内容推入撤回栈
    setUndoStack(prev => [...prev, editorContent]);
    setRedoStack(newRedoStack);
    setEditorContent(nextContent);
    setPreviewContent(nextContent); // 同步更新预览
    lastContentRef.current = nextContent;
    setSaveStatus('unsaved');
  }, [redoStack, editorContent]);

  const handleSave = useCallback(async () => {
    if (!currentFilename) return;
    
    setSaveStatus('saving');
    try {
      await realFileService.savePostContent(currentFilename, editorContent);
      setSaveStatus('saved');
    } catch (e) {
      console.error('Failed to save file:', e);
      setSaveStatus('unsaved');
      alert('保存失败，请重试');
    }
  }, [currentFilename, editorContent]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S 或 Cmd+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
      
      // Ctrl+Z 或 Cmd+Z 撤回
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Ctrl+Shift+Z 或 Cmd+Shift+Z 或 Ctrl+Y 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, handleUndo, handleRedo]);

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
        const newWidth = Math.max(0, Math.min(800, startRightWidth - (e.clientX - startX)));
        // 当宽度小于100时自动隐藏右侧面板
        if (newWidth < 100) {
          setIsRightPanelOpen(false);
          setRightWidth(360); // 重置为默认宽度，下次打开时使用
        } else {
          setRightWidth(newWidth);
        }
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
      const [mdFiles, folders, imageFiles] = await Promise.all([
        realFileService.getFiles(),
        realFileService.getFolders(),
        realFileService.getImages()
      ]);
      // 合并Markdown文件和图片文件
      const allFiles = [...mdFiles, ...imageFiles];
      setFileList(allFiles);
      setFolderList(folders);
      setFileTree(buildFileTree(allFiles, folders));
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

  // --- Move Handler ---
  const handleMove = async (source: string, destination: string) => {
    try {
      const result = await realFileService.moveItem(source, destination);
      // 如果移动的是当前打开的文件，更新currentFilename
      if (currentFilename === source) {
        setCurrentFilename(result.new_path);
      } else if (currentFilename?.startsWith(source + '/')) {
        // 如果移动的是包含当前文件的文件夹
        const newPath = currentFilename.replace(source, result.new_path);
        setCurrentFilename(newPath);
      }
      await refreshFileSystem();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || '移动失败';
      alert(`移动失败: ${detail}`);
    }
  };

  // --- Rename Handlers ---
  const handleRenameStart = (node: FileNode) => {
    setRenameNode(node);
    setRenameValue(node.name);
  };

  const handleRenameConfirm = async () => {
    if (!renameNode || !renameValue.trim()) {
      setRenameNode(null);
      return;
    }
    
    const newName = renameValue.trim();
    if (newName === renameNode.name) {
      setRenameNode(null);
      return;
    }

    try {
      const result = await realFileService.renameItem(renameNode.path, newName);
      // 如果重命名的是当前打开的文件，更新currentFilename
      if (currentFilename === renameNode.path) {
        setCurrentFilename(result.new_path);
      } else if (currentFilename?.startsWith(renameNode.path + '/')) {
        // 如果重命名的是包含当前文件的文件夹
        const newPath = currentFilename.replace(renameNode.path, result.new_path);
        setCurrentFilename(newPath);
      }
      await refreshFileSystem();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || '重命名失败';
      alert(`重命名失败: ${detail}`);
    } finally {
      setRenameNode(null);
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
      setPreviewContent(content); // 同步更新预览内容
      // 重置撤回/重做历史
      setUndoStack([]);
      setRedoStack([]);
      lastContentRef.current = content;
      setSaveStatus('saved');
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

    // 检查文件名称中是否包含空格
    if (filename.includes(' ')) {
      alert('⚠️ 文件名不能包含空格\n\n请使用下划线或连字符来替代空格，例如：\n- my_post.md\n- my-post.md');
      return;
    }

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

    // 检查文件夹名称中是否包含空格
    if (folderPath.includes(' ')) {
      alert('⚠️ 文件夹名称不能包含空格\n\n请使用下划线或连字符来替代空格，例如：\n- my_folder\n- my-folder');
      return;
    }

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

  // --- 图片上传 ---
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // 用 ref 跟踪最新的 editorContent，避免闭包问题
  const editorContentRef = useRef(editorContent);
  useEffect(() => {
    editorContentRef.current = editorContent;
  }, [editorContent]);

  // 获取当前md文件对应的图片存储文件夹路径
  const getImageFolderForCurrentFile = (): string => {
    if (!currentFilename) return '';
    // 例如: posts/hello.md -> posts/hello
    const withoutExt = currentFilename.replace(/\.md$/i, '');
    return withoutExt;
  };

  // 处理编辑器中粘贴/拖拽图片的上传
  const handleEditorImageUpload = async (files: File[], cursorPosition: number) => {
    if (!currentFilename) {
      alert('请先打开一个Markdown文件');
      return;
    }

    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setIsUploading(true);
    const targetFolder = getImageFolderForCurrentFile();
    const folderName = currentFilename.replace(/\.md$/i, '').split('/').pop() || '';
    
    try {
      // 检查是否有文件名包含空格
      const filesWithSpaces = imageFiles.filter(f => {
        let fileName = f.name;
        if (!fileName || fileName === 'image.png' || fileName.startsWith('blob')) {
          return false; // 自动生成的文件名不会有空格
        }
        return fileName.includes(' ');
      });
      
      if (filesWithSpaces.length > 0) {
        const fileNames = filesWithSpaces.map(f => f.name).join('、');
        alert(`⚠️ 文件名包含空格\n\n文件名: ${fileNames}\n\n编辑区显示可能异常，已自动将空格替换为下划线。建议避免在文件名中使用空格。`);
      }
      
      // 收集所有要插入的markdown文本
      const results: string[] = [];
      
      for (const file of imageFiles) {
        // 为粘贴的截图生成文件名
        let fileName = file.name;
        if (!fileName || fileName === 'image.png' || fileName.startsWith('blob')) {
          const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
          const random = Math.random().toString(36).substring(2, 6);
          fileName = `image-${timestamp}-${random}.png`;
        } else {
          // 将文件名中的空格替换为下划线
          fileName = fileName.replace(/\s+/g, '_');
        }
        
        // 创建带有正确文件名的新File对象
        const renamedFile = new File([file], fileName, { type: file.type });
        
        try {
          const result = await realFileService.uploadImage(renamedFile, targetFolder);
          // 使用简短路径 ./image.png，Hexo能识别，本地预览时会自动转换
          const relativePath = `./${result.filename}`;
          results.push(`![${result.filename}](${relativePath})`);
        } catch (e: any) {
          console.error('图片上传失败:', e);
          results.push(`<!-- 上传失败: ${fileName} -->`);
        }
      }
      
      // 一次性在光标位置插入所有结果
      if (results.length > 0 && editorRef.current) {
        const currentContent = editorContentRef.current;
        const before = currentContent.substring(0, cursorPosition);
        const after = currentContent.substring(cursorPosition);
        const insertText = '\n' + results.join('\n') + '\n';
        const newContent = before + insertText + after;
        
        handleEditorChange(newContent);
        
        // 设置光标位置
        setTimeout(() => {
          if (editorRef.current) {
            const newPos = cursorPosition + insertText.length;
            editorRef.current.selectionStart = editorRef.current.selectionEnd = newPos;
            editorRef.current.focus();
          }
        }, 0);
      }
      
      // 刷新文件系统
      await refreshFileSystem();
    } finally {
      setIsUploading(false);
    }
  };

  // 处理粘贴事件
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault(); // 阻止默认粘贴行为
      const cursorPos = editorRef.current?.selectionStart || 0;
      await handleEditorImageUpload(imageFiles, cursorPos);
    }
    // 如果没有图片，让默认的文本粘贴继续
  }, [currentFilename]);

  // 处理拖放事件
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const cursorPos = editorRef.current?.selectionStart || 0;
      await handleEditorImageUpload(imageFiles, cursorPos);
    }
  }, [handleEditorImageUpload]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    // 检查是否有图片文件
    const hasImage = Array.from(e.dataTransfer?.types || []).includes('Files');
    if (hasImage) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  // --- Cross-pane highlight & scroll sync helpers ---
  const normalizeSelectionText = useCallback((text: string) => text.replace(/\s+/g, ' ').trim(), []);

  const clearPreviewHighlights = useCallback(() => {
    if (!previewRef.current) return;
    const highlighted = previewRef.current.querySelectorAll('span.cross-highlight');
    highlighted.forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(span.textContent || ''), span);
      parent.normalize();
    });
  }, []);

  const applyPreviewHighlight = useCallback((text: string) => {
    clearPreviewHighlights();
    if (!previewRef.current) return;
    const targetText = normalizeSelectionText(text);
    if (!targetText) return;

    const walker = document.createTreeWalker(previewRef.current, NodeFilter.SHOW_TEXT, null);
    const needle = targetText.toLowerCase();
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const haystack = node.data.toLowerCase();
      const idx = haystack.indexOf(needle);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + targetText.length);
        const span = document.createElement('span');
        span.className = 'cross-highlight bg-amber-500/60 text-gray-900 rounded px-0.5 shadow-sm';
        range.surroundContents(span);
        return;
      }
    }
  }, [clearPreviewHighlights, normalizeSelectionText]);

  const highlightEditorFromPreview = useCallback((text: string) => {
    const editor = editorRef.current;
    const targetText = normalizeSelectionText(text);
    if (!editor || !targetText) return;
    const lowerContent = editor.value.toLowerCase();
    const idx = lowerContent.indexOf(targetText.toLowerCase());
    if (idx === -1) return;
    try {
      editor.focus({ preventScroll: true } as any);
    } catch {
      // ignore focus errors in older browsers
    }
    editor.setSelectionRange(idx, idx + targetText.length);

    // Keep viewport roughly aligned when同步滚动开启
    if (isScrollSyncEnabled && viewMode === 'split') {
      const editorScrollable = Math.max(editor.scrollHeight - editor.clientHeight, 1);
      const approxRatio = idx / Math.max(editor.value.length, 1);
      editor.scrollTop = approxRatio * editorScrollable;
    }
  }, [isScrollSyncEnabled, normalizeSelectionText, viewMode]);

  const handleEditorSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const { selectionStart, selectionEnd, value } = editor;
    if (selectionEnd <= selectionStart) {
      if (crossHighlight.text) setCrossHighlight({ text: '', source: null });
      return;
    }
    const selected = normalizeSelectionText(value.substring(selectionStart, selectionEnd));
    if (selected.length < 2) {
      if (crossHighlight.text) setCrossHighlight({ text: '', source: null });
      return;
    }
    setCrossHighlight({ text: selected, source: 'editor' });
  }, [crossHighlight.text, normalizeSelectionText]);

  const handlePreviewSelection = useCallback(() => {
    if (!previewRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (crossHighlight.text) setCrossHighlight({ text: '', source: null });
      return;
    }
    const range = selection.getRangeAt(0);
    if (!previewRef.current.contains(range.commonAncestorContainer)) return;
    const selected = normalizeSelectionText(selection.toString());
    if (selected.length < 2) {
      if (crossHighlight.text) setCrossHighlight({ text: '', source: null });
      return;
    }
    setCrossHighlight({ text: selected, source: 'preview' });
  }, [crossHighlight.text, normalizeSelectionText]);

  const handleEditorScroll = useCallback(() => {
    if (!isScrollSyncEnabled || viewMode !== 'split') return;
    if (scrollSyncSourceRef.current === 'preview') return;
    const editor = editorRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;
    scrollSyncSourceRef.current = 'editor';
    const ratio = editor.scrollTop / Math.max(editor.scrollHeight - editor.clientHeight, 1);
    preview.scrollTop = ratio * Math.max(preview.scrollHeight - preview.clientHeight, 1);
    window.requestAnimationFrame(() => { scrollSyncSourceRef.current = null; });
  }, [isScrollSyncEnabled, viewMode]);

  const handlePreviewScroll = useCallback(() => {
    if (!isScrollSyncEnabled || viewMode !== 'split') return;
    if (scrollSyncSourceRef.current === 'editor') return;
    const editor = editorRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;
    scrollSyncSourceRef.current = 'preview';
    const ratio = preview.scrollTop / Math.max(preview.scrollHeight - preview.clientHeight, 1);
    editor.scrollTop = ratio * Math.max(editor.scrollHeight - editor.clientHeight, 1);
    window.requestAnimationFrame(() => { scrollSyncSourceRef.current = null; });
  }, [isScrollSyncEnabled, viewMode]);

  // 应用跨区高亮
  useEffect(() => {
    if (viewMode !== 'split') {
      clearPreviewHighlights();
      return;
    }
    if (!crossHighlight.text) {
      clearPreviewHighlights();
      return;
    }
    applyPreviewHighlight(crossHighlight.text);
    if (crossHighlight.source === 'preview') {
      highlightEditorFromPreview(crossHighlight.text);
    }
  }, [applyPreviewHighlight, clearPreviewHighlights, crossHighlight, highlightEditorFromPreview, viewMode]);

  const handleImportImage = () => {
    imageInputRef.current?.click();
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const targetFolder = currentFolder || '';
    
    try {
      const uploadPromises = Array.from(files).map(file => 
        realFileService.uploadImage(file, targetFolder)
      );
      
      const results = await Promise.allSettled(uploadPromises);
      
      // 统计成功和失败数量
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        alert(`上传完成: ${succeeded} 成功, ${failed} 失败`);
      }
      
      // 刷新文件系统以显示新上传的图片
      await refreshFileSystem();
    } catch (e: any) {
      alert(`上传失败: ${e?.message || e}`);
    } finally {
      setIsUploading(false);
      // 清空input以便再次选择相同文件
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
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
              <button 
                onClick={handleImportImage} 
                disabled={isUploading}
                className={`p-1.5 hover:bg-purple-500/20 rounded-md text-slate-400 hover:text-purple-300 hover:shadow-[0_0_8px_rgba(168,85,247,0.3)] transition-all duration-200 ${isUploading ? 'opacity-50 cursor-wait' : ''}`} 
                title={isUploading ? '上传中...' : '导入图片'}
              >
                <ImagePlusIcon />
              </button>
              <button onClick={refreshFileSystem} className="p-1.5 hover:bg-green-500/20 rounded-md text-slate-400 hover:text-green-300 hover:shadow-[0_0_8px_rgba(34,197,94,0.3)] transition-all duration-200" title="刷新">
                <RefreshIcon />
              </button>
              <button onClick={() => setShowTrash(true)} className="p-1.5 hover:bg-red-500/20 rounded-md text-slate-400 hover:text-red-300 hover:shadow-[0_0_8px_rgba(239,68,68,0.3)] transition-all duration-200" title="回收站">
                <TrashIcon />
              </button>
            </div>
            {/* 隐藏的图片上传input */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageFileChange}
              className="hidden"
            />
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
                onMove={handleMove}
                onRename={handleRenameStart}
                draggedItem={draggedItem}
                setDraggedItem={setDraggedItem}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
               />
             ))}

             {/* Rename Modal */}
             <ConfirmModal
               open={!!renameNode}
               title="重命名"
               message={renameNode ? `将 "${renameNode.name}" 重命名为:` : undefined}
               confirmText="确定"
               cancelText="取消"
               onCancel={() => setRenameNode(null)}
               onConfirm={handleRenameConfirm}
             >
               <input
                 type="text"
                 value={renameValue}
                 onChange={(e) => setRenameValue(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') handleRenameConfirm();
                   if (e.key === 'Escape') setRenameNode(null);
                 }}
                 className="w-full mt-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500"
                 autoFocus
               />
             </ConfirmModal>

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
              onClick={() => setIsScrollSyncEnabled(prev => !prev)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 mr-2
                ${isScrollSyncEnabled ? 'bg-emerald-700 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              title="切换预览/编辑同步滚动"
            >
              <EyeIcon /> {isScrollSyncEnabled ? '同步开' : '同步关'}
            </button>

            <button 
              onClick={handleSave}
              disabled={!currentFilename || saveStatus === 'saving'}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors
                ${!currentFilename 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : saveStatus === 'saving'
                    ? 'bg-yellow-700 text-white cursor-wait'
                    : saveStatus === 'unsaved'
                      ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-sm'
                      : 'bg-green-700 hover:bg-green-600 text-white shadow-sm'}
              `}
              title={saveStatus === 'unsaved' ? '有未保存的更改 (Ctrl+S)' : saveStatus === 'saving' ? '保存中...' : '已保存'}
            >
              <SaveIcon />
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Save*' : 'Saved'}
            </button>

            {/* Right Panel Toggle - 放在最右边，靠近AI面板 */}
            <button 
              onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} 
              className={`p-1.5 rounded transition-colors ${!isRightPanelOpen ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              title="Toggle AI Assistant"
            >
              <SidebarIcon />
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
                    ref={previewRef}
                    className="h-full bg-[#0d1117] overflow-y-auto border-r border-gray-800"
                    style={{ width: `${splitRatio * 100}%` }}
                    onScroll={handlePreviewScroll}
                    onMouseUp={handlePreviewSelection}
                    onKeyUp={handlePreviewSelection}
                    onTouchEnd={handlePreviewSelection}
                  >
                     <div className="p-8 prose prose-invert prose-sm max-w-none">
                       {/* 添加额外保护层 */}
                       <ErrorBoundary 
                         fallback={
                           <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 text-red-300">
                             <div className="font-bold mb-2">⚠️ 预览渲染失败</div>
                             <div className="text-sm">Markdown 内容可能包含不支持的语法或错误的公式</div>
                           </div>
                         }
                       >
                         {previewContent ? (
                           <MarkdownPreview content={previewContent} currentFilename={currentFilename} />
                         ) : (
                           <div className="text-gray-500 text-center py-8">预览区域为空</div>
                         )}
                       </ErrorBoundary>
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
                  onChange={(e) => handleEditorChange(e.target.value)}
                  onPaste={handlePaste}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onScroll={handleEditorScroll}
                  onSelect={handleEditorSelection}
                  onKeyUp={handleEditorSelection}
                  onMouseUp={handleEditorSelection}
                  className={`w-full h-full p-6 bg-[#0d1117] text-gray-300 font-mono text-sm resize-none outline-none focus:ring-0 leading-relaxed ${isUploading ? 'opacity-70' : ''}`}
                  spellCheck={false}
                  placeholder={currentFilename ? "开始写作... (可直接粘贴或拖入图片)" : "Select a file to start writing..."}
                />
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <div className="bg-gray-800 px-4 py-2 rounded-lg text-blue-300 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                      上传图片中...
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Resizer: Center <-> Right */}
      {isRightPanelOpen && <ResizerVertical onMouseDown={(e) => handleResizeStart(e, 'right')} />}

      {/* 3. RIGHT COLUMN: AI Assistant (Resizable) */}
      {isRightPanelOpen && (
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
                  <ReactMarkdown 
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {msg.text}
                  </ReactMarkdown>
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
      )}
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