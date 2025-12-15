import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
// import { mockFileService } from './services/mockFileService'; // Using realFileService instead for real filesystem operations
import { realFileService, AppConfig } from './services/realFileService';
import { createChatSession, sendMessageToGemini } from './services/geminiService';
import { ChatMessage, Role } from './types';
import { Chat } from "@google/genai";
import { 
  SaveIcon, SendIcon, RefreshIcon, PlusIcon, ArrowLeftIcon, FileIcon, EyeIcon, 
  EditIcon, SplitIcon, SidebarIcon, GripHorizontalIcon, FolderIcon, FolderOpenIcon, 
  TrashIcon, FilePlusIcon, FolderPlusIcon 
} from './components/Icon';
import ConfirmModal from './components/ConfirmModal';
import TrashView from './components/TrashView';

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
  onDelete
}: { 
  node: FileNode; 
  depth?: number; 
  currentFilename: string | null;
  onFileClick: (path: string) => void;
  onDelete: (node: FileNode) => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (node.type === 'folder') {
    return (
      <div>
        <div 
          className="flex items-center justify-between group px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer select-none"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center gap-2 truncate">
            {isOpen ? <FolderOpenIcon /> : <FolderIcon />}
            <span className="truncate">{node.name}</span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
            title="Delete Folder"
          >
            <TrashIcon />
          </button>
        </div>
        {isOpen && node.children && (
          <div>
            {node.children.map(child => (
              <FileTreeNode 
                key={child.path} 
                node={child} 
                depth={depth + 1} 
                currentFilename={currentFilename}
                onFileClick={onFileClick}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`
        flex items-center justify-between group px-2 py-1 text-sm rounded-r cursor-pointer select-none transition-colors
        ${currentFilename === node.path 
          ? 'bg-blue-900/30 text-blue-400 border-l-2 border-blue-500' 
          : 'text-gray-400 hover:bg-gray-800 hover:text-white border-l-2 border-transparent'}
      `}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => onFileClick(node.path)}
    >
      <div className="flex items-center gap-2 truncate">
        <FileIcon />
        <span className="truncate">{node.name}</span>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(node); }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
        title="Delete File"
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
  
  // View Modes: 'edit' | 'split'
  const [viewMode, setViewMode] = useState<'edit' | 'split'>('edit');

  // --- State: AI Chat ---
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [draftResponse, setDraftResponse] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatSessionRef = useRef<Chat | null>(null);

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
        // 使用加载的apiKey初始化聊天
        const apiKey = savedConfig.providers[savedConfig.llm_provider]?.api_key;
        if (apiKey) {
          chatSessionRef.current = createChatSession(apiKey);
        }
        // 立即刷新文件系统
        refreshFileSystem();
      }
    } catch (error) {
      console.error("Failed to load initial config from backend.", error);
      alert("Could not connect to backend to load configuration.");
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
    } catch (e) {
      console.error("Failed to refresh file system", e);
    }
  };

// App.tsx - 替换掉旧的 handleSetup

  const handleSetup = async () => {
    if (!config) return; // 如果配置还未加载，则不执行任何操作

    try {
      await realFileService.saveConfig(config);
      setIsPathSet(true);
    
      // 使用新的apiKey重新初始化聊天
      const apiKey = config.providers[config.llm_provider]?.api_key;
      if (apiKey) {
         chatSessionRef.current = createChatSession(apiKey);
      }

      refreshFileSystem();
    } catch (error: any) {
      const detail = error.response?.data?.detail || "Is the backend running?";
      alert(`Failed to save configuration: ${detail}`);
      console.error(error);
    }
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
    const filename = window.prompt("Enter new file path (e.g. folder/new-post.md):");
    // 如果用户未提供路径则直接返回
    if (!filename || filename.trim() === '') return;

    try {
      await realFileService.createPost(filename);
      // 创建成功后刷新文件系统
      await refreshFileSystem();
      // 自动选中并打开新创建的文件
      await handleFileClick(filename);
    } catch (e: any) {
      // 提供清晰的错误提示
      alert(`Failed to create file: ${e.message}`);
      console.error(e);
    }
  };

  const handleCreateFolder = async () => {
    const folderPath = window.prompt("Enter new folder path (e.g. my-folder or nested/folder):");
    // 如果用户未提供路径则直接返回
    if (!folderPath || folderPath.trim() === '') return;

    try {
      await realFileService.createFolder(folderPath);
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
    // Open confirmation modal; actual delete happens in performDelete
    setPendingDelete(node);
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
    
      if (!chatSessionRef.current) {
      const apiKey = config?.providers[config.llm_provider]?.api_key;
      if (apiKey) {
        chatSessionRef.current = createChatSession(apiKey);
      } else {
        setChatHistory(prev => [...prev, { role: Role.USER, text: chatInput }]);
        setChatHistory(prev => [...prev, { role: Role.MODEL, text: "Please set your Gemini API Key in the setup screen or reload." }]);
        setChatInput("");
        return;
      }
    }

    const userMsg: ChatMessage = { role: Role.USER, text: chatInput };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput("");
    setIsAiThinking(true);
    try {
      const responseText = await sendMessageToGemini(chatSessionRef.current, userMsg.text);
      setChatHistory(prev => [...prev, { role: Role.MODEL, text: responseText }]);
      setDraftResponse(responseText);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: Role.MODEL, text: "Sorry, I encountered an error." }]);
    } finally {
      setIsAiThinking(false);
      scrollToBottom();
    }
  };

  const handleNewTopic = () => {
    const apiKey = config?.providers[config.llm_provider]?.api_key;
    if (apiKey) {
      chatSessionRef.current = createChatSession(apiKey);
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
          <h1 className="text-2xl font-bold mb-6 text-blue-400">Hexo Copilot Setup</h1>
          <div className="space-y-4">
            {/* Hexo Path Input */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">Hexo Blog Path (Absolute)</label>
              <input 
                type="text" 
                value={config.hexo_path || ""} 
                onChange={(e) => setConfig(prev => ({...prev!, hexo_path: e.target.value}))}
                className="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-blue-500 outline-none"
                placeholder="e.g., D:/Blog/my-hexo-site"
              />
            </div>

            {/* LLM Provider Selector */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">AI Provider</label>
              <select 
                value={config.llm_provider}
                onChange={(e) => setConfig(prev => ({...prev!, llm_provider: e.target.value as 'gemini' | 'openai'}))}
                className="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-blue-500 outline-none"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI (or compatible)</option>
              </select>
            </div>
          
           {/* API Key Input */}
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
              Save and Start Copilot
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- View: Main Layout ---
  return (
    <div className={`flex h-screen w-screen bg-gray-900 text-gray-200 overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      
      {/* 1. LEFT COLUMN: File Tree (Collapsible & Resizable) */}
      {isLeftPanelOpen && (
        <div 
          style={{ width: leftWidth }} 
          className="flex flex-col border-r border-gray-800 bg-gray-900 flex-shrink-0 transition-[width] duration-0 ease-linear"
        >
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-bold text-gray-100 flex items-center gap-2">
              <span className="text-blue-500 font-mono">Hexo</span> Copilot
            </h2>
            <div className="flex gap-1">
              <button onClick={handleCreateFolder} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors" title="New Folder">
                <FolderPlusIcon />
              </button>
              <button onClick={handleCreateFile} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors" title="New File">
                <FilePlusIcon />
              </button>
              <button onClick={refreshFileSystem} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors" title="Refresh">
                <RefreshIcon />
              </button>
              <button onClick={() => setShowTrash(true)} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors" title="Trash">
                <TrashIcon />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
             {fileTree.map(node => (
               <FileTreeNode 
                key={node.path} 
                node={node} 
                currentFilename={currentFilename}
                onFileClick={handleFileClick}
                onDelete={handleDelete}
               />
             ))}

             {/* Confirmation modal for destructive actions */}
             <ConfirmModal
               open={!!pendingDelete}
               title="Confirm Deletion"
               message={pendingDelete ? `Are you sure you want to delete '${pendingDelete.name}' (${pendingDelete.type})?` : undefined}
               strictLabel={strictDeleteMode && pendingDelete ? pendingDelete.name : undefined}
               confirmText="Delete"
               cancelText="Cancel"
               onCancel={() => setPendingDelete(null)}
               onConfirm={() => pendingDelete && performDelete(pendingDelete)}
             />

             <TrashView open={showTrash} onClose={() => setShowTrash(false)} onChanged={() => { refreshFileSystem(); }} />
             {fileList.length === 0 && folderList.length === 0 && <div className="text-center text-gray-500 text-sm mt-10">Empty directory</div>}
          </div>
          <div className="p-3 border-t border-gray-800 text-xs text-gray-600 text-center">
            {fileList.length} files, {folderList.length} folders
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
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-gray-900 flex-shrink-0">
          <span className="font-semibold text-gray-200">AI Assistant</span>
          <button 
            onClick={handleNewTopic}
            className="text-xs flex items-center gap-1 text-gray-400 hover:text-white px-2 py-1 hover:bg-gray-800 rounded transition-colors"
          >
            <PlusIcon /> New Chat
          </button>
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
    </div>
  );
}