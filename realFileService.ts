// services/realFileService.ts

import axios from 'axios';
import { FileService } from '../types';

// 你的Python FastAPI后端将运行在这个地址
const API_BASE_URL = 'http://127.0.0.1:8000';

// 创建一个axios实例，用于后续所有请求
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const realFileService: FileService = {
  // 设置Hexo路径
  setHexoPath: async (path: string) => {
    // 这个配置现在由后端处理，前端只需要发送一次
    // 注意：我们假设后端会记住这个路径
    console.log(`Hexo path will be handled by the backend: ${path}`);
    // 在实际应用中，你可能需要一个专门的API来让后端知道路径
    // 暂时我们让后端硬编码或通过其他方式配置路径
  },

  // 获取所有文件
  getFiles: async (): Promise<string[]> => {
    try {
      const response = await apiClient.get<string[]>('/api/posts');
      return response.data;
    } catch (error) {
      console.error('Failed to get files:', error);
      alert('Error: Could not connect to the backend server. Is it running?');
      return [];
    }
  },

  // 获取所有文件夹 (假设后端也有一个 /api/folders 接口)
  getFolders: async (): Promise<string[]> => {
     try {
      const response = await apiClient.get<string[]>('/api/folders');
      return response.data;
    } catch (error) {
      console.error('Failed to get folders:', error);
      // 不弹窗，避免重复报错
      return [];
    }
  },

  // 获取文件内容
  getPostContent: async (filename: string): Promise<string> => {
    const response = await apiClient.get<string>(`/api/posts/${encodeURIComponent(filename)}`);
    return response.data;
  },

  // 保存文件内容
  savePostContent: async (filename:string, content: string): Promise<void> => {
    await apiClient.post(`/api/posts/${encodeURIComponent(filename)}`, { content });
  },

  // 创建新文件
  createPost: async (filename: string): Promise<void> => {
    await apiClient.post('/api/posts/new', { filename });
  },

  // 创建新文件夹
  createFolder: async (path: string): Promise<void> => {
    await apiClient.post('/api/folders/new', { path });
  },
  
  // 删除文件
  deletePost: async (filename: string): Promise<void> => {
    await apiClient.delete(`/api/posts/${encodeURIComponent(filename)}`);
  },

  // 删除文件夹
  deleteFolder: async (path: string): Promise<void> => {
    await apiClient.delete(`/api/folders/${encodeURIComponent(path)}`);
  },
};