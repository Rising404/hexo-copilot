import { FileService } from "../types";

const DELAY = 200;

// Keys for localStorage
const STORE_FILES = "hexo-posts";
const STORE_FOLDERS = "hexo-folders";

// Helper to access local storage for Files
const getFilesStore = (): Record<string, string> => {
  const stored = localStorage.getItem(STORE_FILES);
  if (!stored) {
    // Default initial files
    const defaults = {
      "welcome/hello-world.md": `---
title: Hello World
date: 2023-10-27 10:00:00
tags: [hexo, blogging]
---

Welcome to my new Hexo blog!`,
      "about.md": "# About Me\n\nI am a blogger."
    };
    localStorage.setItem(STORE_FILES, JSON.stringify(defaults));
    return defaults;
  }
  return JSON.parse(stored);
};

// Helper to access local storage for Folders
const getFoldersStore = (): string[] => {
  const stored = localStorage.getItem(STORE_FOLDERS);
  if (!stored) {
    // Default initial folders
    const defaults = ["welcome", "tech", "tech/react"];
    localStorage.setItem(STORE_FOLDERS, JSON.stringify(defaults));
    return defaults;
  }
  return JSON.parse(stored);
};

const saveFilesStore = (data: Record<string, string>) => {
  localStorage.setItem(STORE_FILES, JSON.stringify(data));
};

const saveFoldersStore = (data: string[]) => {
  localStorage.setItem(STORE_FOLDERS, JSON.stringify(data));
};

export const mockFileService: FileService = {
  getFiles: async () => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    const files = getFilesStore();
    return Object.keys(files).sort();
  },

  getFolders: async () => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    const folders = getFoldersStore();
    return folders.sort();
  },

  getPostContent: async (filename: string) => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    const files = getFilesStore();
    return files[filename] || "";
  },

  savePostContent: async (filename: string, content: string) => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    const files = getFilesStore();
    files[filename] = content;
    saveFilesStore(files);
  },

  createPost: async (filename: string) => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    const files = getFilesStore();
    if (files[filename]) {
      throw new Error("File already exists");
    }
    
    // Auto-create parent folders if they don't exist
    const parts = filename.split('/');
    if (parts.length > 1) {
      const folders = getFoldersStore();
      let currentPath = "";
      let changed = false;
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!folders.includes(currentPath)) {
          folders.push(currentPath);
          changed = true;
        }
      }
      if (changed) saveFoldersStore(folders);
    }

    files[filename] = `---
title: New Post
date: ${new Date().toISOString()}
---

Content...`;
    saveFilesStore(files);
  },

  createFolder: async (path: string) => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    const folders = getFoldersStore();
    if (folders.includes(path)) {
      throw new Error("Folder already exists");
    }
    folders.push(path);
    saveFoldersStore(folders);
  },

  deletePost: async (filename: string) => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    const files = getFilesStore();
    if (files[filename]) {
      delete files[filename];
      saveFilesStore(files);
    }
  },

  deleteFolder: async (path: string) => {
    await new Promise(resolve => setTimeout(resolve, DELAY));
    
    // 1. Remove the folder and all sub-folders
    let folders = getFoldersStore();
    folders = folders.filter(f => f !== path && !f.startsWith(path + '/'));
    saveFoldersStore(folders);

    // 2. Remove all files inside this folder
    const files = getFilesStore();
    let filesChanged = false;
    Object.keys(files).forEach(f => {
      if (f.startsWith(path + '/')) {
        delete files[f];
        filesChanged = true;
      }
    });
    if (filesChanged) saveFilesStore(files);
  },

  setHexoPath: async (path: string) => {
    console.log(`Hexo path set to: ${path}`);
    localStorage.setItem("hexo-path", path);
  }
};