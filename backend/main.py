import os
import shutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

# --- 配置 ---
# !!! 重要：请将这里的路径修改为你自己电脑上Hexo博客的根目录 !!!
HEXO_BASE_PATH = "D:/path/to/your/hexo-blog" # Windows示例
# HEXO_BASE_PATH = "/Users/yourname/hexo-blog" # macOS/Linux示例

POSTS_PATH = os.path.join(HEXO_BASE_PATH, "source", "_posts")

app = FastAPI()

# --- CORS 中间件 ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # 允许你的React前端访问
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic 模型 ---
class PostContent(BaseModel):
    content: str

class NewPost(BaseModel):
    filename: str

class NewFolder(BaseModel):
    path: str

# --- 辅助函数 ---
def get_all_md_files(root_dir):
    md_files = []
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith(".md"):
                # 获取相对路径
                relative_path = os.path.relpath(os.path.join(dirpath, filename), root_dir)
                md_files.append(relative_path.replace("\\", "/")) # 统一使用 / 作为路径分隔符
    return md_files

def get_all_folders(root_dir):
    folders = []
    for dirpath, _, _ in os.walk(root_dir):
        if dirpath != root_dir:
            relative_path = os.path.relpath(dirpath, root_dir)
            folders.append(relative_path.replace("\\", "/"))
    return folders
    
# --- API Endpoints ---
@app.get("/api/posts", response_model=List[str])
async def list_posts():
    if not os.path.exists(POSTS_PATH):
        raise HTTPException(status_code=404, detail="Posts directory not found. Check HEXO_BASE_PATH.")
    return get_all_md_files(POSTS_PATH)

@app.get("/api/folders", response_model=List[str])
async def list_folders():
    if not os.path.exists(POSTS_PATH):
         raise HTTPException(status_code=404, detail="Posts directory not found.")
    return get_all_folders(POSTS_PATH)

@app.get("/api/posts/{filename:path}", response_model=str)
async def get_post(filename: str):
    filepath = os.path.join(POSTS_PATH, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/posts/{filename:path}")
async def save_post(filename: str, post: PostContent):
    filepath = os.path.join(POSTS_PATH, filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(post.content)
    return {"status": "File saved"}

@app.post("/api/posts/new")
async def create_post(post: NewPost):
    filepath = os.path.join(POSTS_PATH, post.filename)
    if os.path.exists(filepath):
        raise HTTPException(status_code=409, detail="File already exists")
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("---\ntitle: New Post\ndate: {}\n---\n\n".format("2025-01-01 00:00:00"))
    return {"status": "File created"}

@app.post("/api/folders/new")
async def create_folder(folder: NewFolder):
    folderpath = os.path.join(POSTS_PATH, folder.path)
    if os.path.exists(folderpath):
        raise HTTPException(status_code=409, detail="Folder already exists")
    os.makedirs(folderpath)
    return {"status": "Folder created"}
    
@app.delete("/api/posts/{filename:path}")
async def delete_post(filename: str):
    filepath = os.path.join(POSTS_PATH, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    os.remove(filepath)
    return {"status": "File deleted"}

@app.delete("/api/folders/{path:path}")
async def delete_folder(path: str):
    folderpath = os.path.join(POSTS_PATH, path)
    if not os.path.exists(folderpath):
        raise HTTPException(status_code=404, detail="Folder not found")
    shutil.rmtree(folderpath)
    return {"status": "Folder deleted"}
