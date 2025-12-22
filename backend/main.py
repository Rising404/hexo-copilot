# backend/main.py

import os
import shutil
import json
import datetime
import mimetypes
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# --- 1. 配置管理 (新增) ---
# 定义配置文件的路径
CONFIG_FILE = "config.json"

def load_config() -> Dict[str, Any]:
    """加载配置文件，如果不存在则创建一个默认的。"""
    if not os.path.exists(CONFIG_FILE):
        default_config = {
            "hexo_path": None,
            "llm_provider": "openai",
            "providers": {
                "openai": {"api_key": None, "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
                "claude": {"api_key": None, "base_url": "https://api.anthropic.com", "model": "claude-3-5-sonnet-20241022"},
                "gemini": {"api_key": None, "base_url": "https://generativelanguage.googleapis.com/v1beta", "model": "gemini-2.0-flash-exp"},
                "qwen": {"api_key": None, "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen-plus"},
                "deepseek": {"api_key": None, "base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat"}
            }
        }
        save_config(default_config)
        return default_config
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        # 如果文件损坏或为空，也返回一个默认配置
        return {"hexo_path": None, "llm_provider": "openai", "providers": {}}


def save_config(config: Dict[str, Any]):
    """将配置字典保存到JSON文件。"""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

# --- 2. 动态路径初始化 (修改) ---
# 应用启动时，从配置文件加载配置
app_config = load_config()
# 不再硬编码，而是从加载的配置中读取路径
HEXO_BASE_PATH = app_config.get("hexo_path") 
# 直接使用用户指定的路径作为工作目录，不强制要求source/_posts
POSTS_PATH = HEXO_BASE_PATH if HEXO_BASE_PATH and os.path.isdir(HEXO_BASE_PATH) else None


# --- FastAPI 应用实例 (无变化) ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. 新增Pydantic模型用于配置API (新增) ---
class ProviderDetails(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None

class ConfigModel(BaseModel):
    hexo_path: Optional[str] = None
    llm_provider: str
    providers: Dict[str, ProviderDetails]

# --- Pydantic 模型 (无变化) ---
class PostContent(BaseModel):
    content: str
class NewPost(BaseModel):
    filename: str
class NewFolder(BaseModel):
    path: str
class MoveItem(BaseModel):
    source: str
    destination: str
class RenameItem(BaseModel):
    old_path: str
    new_name: str

# --- 4. 新增配置API Endpoints (新增) ---
@app.post("/api/config")
async def update_config(config_data: ConfigModel):
    """接收前端发来的配置，并保存到文件。"""
    global app_config, HEXO_BASE_PATH, POSTS_PATH
    
    # 将接收到的Pydantic模型转换为字典
    app_config = config_data.dict()
    save_config(app_config)
    
    # 动态更新全局路径变量，以便文件操作API能立即使用新路径
    new_path = app_config.get("hexo_path")
    if not new_path or not os.path.exists(new_path):
        # 保存配置但提示路径不存在
        HEXO_BASE_PATH = None
        POSTS_PATH = None
        raise HTTPException(status_code=400, detail=f"Invalid path provided: {new_path}")

    # Path exists; accept it as a workspace root and always scan from root recursively
    HEXO_BASE_PATH = new_path
    POSTS_PATH = HEXO_BASE_PATH  # Always use workspace root

    # Check if it's a Hexo structure (just for reporting, doesn't affect scanning)
    candidate = os.path.join(HEXO_BASE_PATH, "source", "_posts")
    is_hexo = os.path.isdir(candidate)
    
    return {
        "status": "Configuration saved. Scanning from workspace root.",
        "posts_path": POSTS_PATH,
        "is_hexo": is_hexo
    }

@app.get("/api/config", response_model=ConfigModel)
async def get_config():
    """让前端可以获取当前保存的配置。"""
    return app_config

# --- 辅助函数 (无变化) ---
def get_all_md_files(root_dir):
    md_files = []
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith(".md"):
                relative_path = os.path.relpath(os.path.join(dirpath, filename), root_dir)
                md_files.append(relative_path.replace("\\", "/"))
    return md_files

def get_all_folders(root_dir):
    folders = []
    for dirpath, _, _ in os.walk(root_dir):
        if dirpath != root_dir:
            relative_path = os.path.relpath(dirpath, root_dir)
            folders.append(relative_path.replace("\\", "/"))
    return folders

# 图片文件扩展名
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'}

def get_all_files(root_dir, extensions=None):
    """获取所有文件，可选择按扩展名过滤"""
    files = []
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if extensions is None or any(filename.lower().endswith(ext) for ext in extensions):
                relative_path = os.path.relpath(os.path.join(dirpath, filename), root_dir)
                files.append(relative_path.replace("\\", "/"))
    return files

def get_image_files(root_dir):
    """获取所有图片文件"""
    return get_all_files(root_dir, IMAGE_EXTENSIONS)

# --- 5. 文件操作API Endpoints (逻辑微调) ---
# 主要修改：在每个接口的开头都检查POSTS_PATH是否有效
@app.get("/api/posts", response_model=List[str])
async def list_posts():
    if not POSTS_PATH or not os.path.exists(POSTS_PATH):
        return []  # 路径未配置或不存在时返回空列表
    return get_all_md_files(POSTS_PATH)

@app.get("/api/folders", response_model=List[str])
async def list_folders():
    if not POSTS_PATH or not os.path.exists(POSTS_PATH):
        return []  # 路径未配置或不存在时返回空列表
    return get_all_folders(POSTS_PATH)

@app.get("/api/images", response_model=List[str])
async def list_images():
    """获取所有图片文件"""
    if not POSTS_PATH or not os.path.exists(POSTS_PATH):
        return []
    return get_image_files(POSTS_PATH)

# ... (从这里开始，剩下的所有文件操作API的代码和你的原始文件完全一样) ...
# ... 你只需把你的原始文件从 @app.get("/api/posts/{filename:path}") 到结尾的所有内容复制粘贴到这里即可 ...
# ... 为确保完整性，我还是帮你把它们都列出来 ...

# 重要：/api/posts/new 必须在 /api/posts/{filename:path} 之前定义，否则会被错误匹配
@app.post("/api/posts/new")
async def create_post(post: NewPost):
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="工作目录未配置，请先在Settings中设置路径")

    # Basic validation: non-empty filename
    if not post.filename or not post.filename.strip():
        raise HTTPException(status_code=400, detail="文件名不能为空")

    # Normalize the filename
    normalized_filename = post.filename.strip().replace('\\', '/')
    
    # Prevent path traversal
    root = os.path.normpath(os.path.abspath(POSTS_PATH))
    target = os.path.normpath(os.path.abspath(os.path.join(POSTS_PATH, normalized_filename)))
    if not (target == root or target.startswith(root + os.sep)):
        raise HTTPException(status_code=400, detail="无效的文件路径")

    filepath = target
    if os.path.exists(filepath):
        raise HTTPException(status_code=409, detail="文件已存在")

    # Ensure parent folder exists
    parent_dir = os.path.dirname(filepath)
    if parent_dir and parent_dir != root:
        os.makedirs(parent_dir, exist_ok=True)

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("---\ntitle: New Post\ndate: {}\n---\n\n".format(datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')))
        return {"status": "File created", "path": os.path.relpath(filepath, POSTS_PATH).replace('\\', '/')}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建文件失败: {str(e)}")

@app.post("/api/folders/new")
async def create_folder(folder: NewFolder):
    if not POSTS_PATH: raise HTTPException(status_code=404, detail="Hexo path not configured.")
    folderpath = os.path.join(POSTS_PATH, folder.path)
    if os.path.exists(folderpath):
        raise HTTPException(status_code=409, detail="Folder already exists")
    os.makedirs(folderpath)
    return {"status": "Folder created"}


@app.post("/api/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Form(default="")
):
    """上传图片文件到指定文件夹"""
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="工作目录未配置")
    
    # 验证文件类型
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")
    
    filename = file.filename.strip()
    # 将文件名中的空格替换为下划线
    filename = filename.replace(' ', '_')
    
    ext = os.path.splitext(filename)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的图片格式: {ext}，支持: {', '.join(IMAGE_EXTENSIONS)}")
    
    # 构建目标路径
    folder = folder.strip().replace('\\', '/')
    if folder:
        target_dir = os.path.normpath(os.path.join(POSTS_PATH, folder))
    else:
        target_dir = POSTS_PATH
    
    # 安全检查
    root = os.path.normpath(os.path.abspath(POSTS_PATH))
    if not (target_dir == root or target_dir.startswith(root + os.sep)):
        raise HTTPException(status_code=400, detail="无效的文件夹路径")
    
    # 确保目标文件夹存在
    os.makedirs(target_dir, exist_ok=True)
    
    filepath = os.path.join(target_dir, filename)
    
    # 如果文件已存在，直接返回已存在的路径，不重复上传
    if os.path.exists(filepath):
        relative_path = os.path.relpath(filepath, POSTS_PATH).replace('\\', '/')
        return {"status": "exists", "path": relative_path, "filename": filename}
    
    try:
        contents = await file.read()
        with open(filepath, "wb") as f:
            f.write(contents)
        
        relative_path = os.path.relpath(filepath, POSTS_PATH).replace('\\', '/')
        return {"status": "uploaded", "path": relative_path, "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")

@app.get("/api/posts/{filename:path}", response_model=str)
async def get_post(filename: str):
    if not POSTS_PATH: raise HTTPException(status_code=404, detail="Hexo path not configured.")
    filepath = os.path.join(POSTS_PATH, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/posts/{filename:path}")
async def save_post(filename: str, post: PostContent):
    if not POSTS_PATH: raise HTTPException(status_code=404, detail="Hexo path not configured.")
    filepath = os.path.join(POSTS_PATH, filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(post.content)
    return {"status": "File saved"}
    
def ensure_trash_dir():
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Hexo path not configured.")
    trash_root = os.path.join(POSTS_PATH, ".trash")
    os.makedirs(trash_root, exist_ok=True)
    return trash_root


def move_to_trash_item(relative_path: str):
    """Move a file or folder (relative to POSTS_PATH) into a timestamped folder under .trash and return the trash-relative path."""
    trash_root = ensure_trash_dir()
    timestamp = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    src = os.path.join(POSTS_PATH, relative_path)
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Item not found")
    dest = os.path.join(trash_root, timestamp, relative_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.move(src, dest)
    return os.path.join(timestamp, relative_path).replace("\\", "/")


@app.delete("/api/posts/{filename:path}")
async def delete_post(filename: str):
    """Soft-delete (move to .trash)."""
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Hexo path not configured.")
    # Move the file to trash
    trash_path = move_to_trash_item(filename)
    return {"status": "moved to trash", "trash_path": trash_path}


@app.delete("/api/folders/{path:path}")
async def delete_folder(path: str):
    """Soft-delete folder (move to .trash)."""
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Hexo path not configured.")
    folderpath = os.path.join(POSTS_PATH, path)
    if not os.path.exists(folderpath):
        raise HTTPException(status_code=404, detail="Folder not found")
    # Move the whole folder to trash preserving its relative path under a timestamped folder
    trash_path = move_to_trash_item(path)
    return {"status": "moved to trash", "trash_path": trash_path}


@app.get("/api/trash", response_model=List[str])
async def list_trash():
    if not POSTS_PATH or not os.path.exists(POSTS_PATH):
        return []  # 路径未配置时返回空列表
    trash_root = os.path.join(POSTS_PATH, ".trash")
    if not os.path.exists(trash_root):
        return []
    items: List[str] = []
    for dirpath, dirnames, filenames in os.walk(trash_root):
        for d in dirnames:
            rel = os.path.relpath(os.path.join(dirpath, d), trash_root)
            items.append(rel.replace("\\", "/") + "/")
        for f in filenames:
            rel = os.path.relpath(os.path.join(dirpath, f), trash_root)
            items.append(rel.replace("\\", "/"))
    items.sort()
    return items


class TrashItem(BaseModel):
    path: str


@app.post("/api/trash/restore")
async def restore_trash(item: TrashItem):
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Hexo path not configured.")
    trash_root = os.path.join(POSTS_PATH, ".trash")
    src = os.path.join(trash_root, item.path)
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Trash item not found")

    # Determine original relative path (strip first timestamp segment)
    parts = item.path.split('/', 1)
    if len(parts) == 1:
        rel = parts[0]
    else:
        rel = parts[1]

    dest = os.path.join(POSTS_PATH, rel)
    if os.path.exists(dest):
        raise HTTPException(status_code=409, detail="Target already exists")

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.move(src, dest)

    # Cleanup empty timestamp folder if it's empty now
    parent_ts = os.path.join(trash_root, parts[0])
    if os.path.isdir(parent_ts) and not any(os.scandir(parent_ts)):
        os.rmdir(parent_ts)

    return {"status": "restored", "path": rel}


@app.delete("/api/trash/{path:path}")
async def delete_trash(path: str):
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Hexo path not configured.")
    trash_root = os.path.join(POSTS_PATH, ".trash")
    target = os.path.join(trash_root, path)
    if not os.path.exists(target):
        raise HTTPException(status_code=404, detail="Trash item not found")
    if os.path.isdir(target):
        shutil.rmtree(target)
    else:
        os.remove(target)
    return {"status": "deleted"}


@app.delete("/api/trash")
async def empty_trash():
    """清空整个回收站"""
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Hexo path not configured.")
    trash_root = os.path.join(POSTS_PATH, ".trash")
    if os.path.exists(trash_root):
        shutil.rmtree(trash_root)
        os.makedirs(trash_root, exist_ok=True)  # 重新创建空的.trash文件夹
    return {"status": "trash emptied"}


@app.post("/api/posts/init")
async def init_posts_folder():
    """Create source/_posts under the configured HEXO_BASE_PATH if possible."""
    if not HEXO_BASE_PATH:
        raise HTTPException(status_code=404, detail="Workspace path not configured.")
    target = os.path.join(HEXO_BASE_PATH, "source", "_posts")
    try:
        os.makedirs(target, exist_ok=True)
        return {"status": "created", "posts_path": target}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create posts folder: {e}")


# --- 6. 移动和重命名API ---
@app.post("/api/move")
async def move_item(item: MoveItem):
    """移动文件或文件夹到新位置"""
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Workspace path not configured.")
    
    source_path = os.path.normpath(os.path.join(POSTS_PATH, item.source))
    dest_folder = os.path.normpath(os.path.join(POSTS_PATH, item.destination))
    
    # 安全检查：确保路径在工作目录内
    root = os.path.normpath(os.path.abspath(POSTS_PATH))
    if not source_path.startswith(root + os.sep) and source_path != root:
        raise HTTPException(status_code=400, detail="Invalid source path")
    if not dest_folder.startswith(root + os.sep) and dest_folder != root:
        raise HTTPException(status_code=400, detail="Invalid destination path")
    
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Source not found")
    if not os.path.isdir(dest_folder):
        raise HTTPException(status_code=400, detail="Destination is not a folder")
    
    # 获取源文件/文件夹名称
    item_name = os.path.basename(source_path)
    new_path = os.path.join(dest_folder, item_name)
    
    # 检查目标是否已存在
    if os.path.exists(new_path):
        raise HTTPException(status_code=409, detail=f"目标位置已存在同名项目 '{item_name}'，无法移动")
    
    # 防止移动到自己的子目录
    if os.path.isdir(source_path) and new_path.startswith(source_path + os.sep):
        raise HTTPException(status_code=400, detail="无法将文件夹移动到自身内部")
    
    try:
        shutil.move(source_path, new_path)
        new_relative = os.path.relpath(new_path, POSTS_PATH).replace("\\", "/")
        return {"status": "moved", "new_path": new_relative}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to move: {str(e)}")


@app.post("/api/rename")
async def rename_item(item: RenameItem):
    """重命名文件或文件夹"""
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Workspace path not configured.")
    
    old_path = os.path.normpath(os.path.join(POSTS_PATH, item.old_path))
    
    # 安全检查
    root = os.path.normpath(os.path.abspath(POSTS_PATH))
    if not old_path.startswith(root + os.sep) and old_path != root:
        raise HTTPException(status_code=400, detail="Invalid path")
    
    if not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="Item not found")
    
    # 验证新名称
    new_name = item.new_name.strip()
    if not new_name or '/' in new_name or '\\' in new_name:
        raise HTTPException(status_code=400, detail="Invalid new name")
    
    # 构建新路径
    parent_dir = os.path.dirname(old_path)
    new_path = os.path.join(parent_dir, new_name)
    
    if os.path.exists(new_path):
        raise HTTPException(status_code=409, detail="An item with this name already exists")
    
    try:
        os.rename(old_path, new_path)
        new_relative = os.path.relpath(new_path, POSTS_PATH).replace("\\", "/")
        return {"status": "renamed", "new_path": new_relative}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename: {str(e)}")


# --- 7. 静态资源API（用于Markdown图片加载）---
@app.get("/api/assets/{filepath:path}")
async def get_asset(filepath: str):
    """提供静态资源文件（图片等）"""
    if not POSTS_PATH:
        raise HTTPException(status_code=404, detail="Workspace path not configured.")
    
    # URL解码路径
    from urllib.parse import unquote
    filepath = unquote(filepath)
    
    asset_path = os.path.normpath(os.path.join(POSTS_PATH, filepath))
    
    # 安全检查 - 确保路径在工作目录内
    root = os.path.normpath(os.path.abspath(POSTS_PATH))
    asset_abs = os.path.normpath(os.path.abspath(asset_path))
    if not (asset_abs.startswith(root + os.sep) or asset_abs == root):
        raise HTTPException(status_code=400, detail=f"Invalid path: {filepath}")
    
    if not os.path.exists(asset_path):
        raise HTTPException(status_code=404, detail=f"Asset not found: {filepath}")
    
    if os.path.isdir(asset_path):
        raise HTTPException(status_code=400, detail="Cannot serve directory")
    
    # 获取MIME类型
    mime_type, _ = mimetypes.guess_type(asset_path)
    if mime_type is None:
        mime_type = "application/octet-stream"
    
    return FileResponse(asset_path, media_type=mime_type)
