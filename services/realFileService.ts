// services/realFileService.ts

import axios from 'axios';
import { FileService } from '../types'; // 假设你的 types.ts 在上一级目录

// 你的Python FastAPI后端将运行在这个地址
const API_BASE_URL = 'http://127.0.0.1:8000';

// 创建一个axios实例，用于后续所有请求
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 定义一个与后端Pydantic模型匹配的配置类型
// 这有助于在TypeScript中获得类型安全
export interface AppConfig {
  hexo_path: string | null;
  llm_provider: 'gemini' | 'openai';
  providers: {
    gemini: { api_key: string | null };
    openai: { api_key: string | null };
  };
}

// ----------------------------------------------------
// 这是升级后的 realFileService
// ----------------------------------------------------
export const realFileService = { // 注意：这里不再显式声明类型为 FileService，因为它现在包含了额外的配置方法

  // --- 新增：配置管理 ---
  
  /**
   * 从后端获取当前保存的配置
   */
  getConfig: async (): Promise<AppConfig> => {
    const response = await apiClient.get<AppConfig>('/api/config');
    return response.data;
  },

  /**
   * 将新的配置对象发送到后端进行保存
   * @param config - 完整的配置对象
   */
  saveConfig: async (config: AppConfig): Promise<any> => {
    const resp = await apiClient.post('/api/config', config);
    return resp.data;
  },

  // --- 文件操作 (与之前相同) ---

  getFiles: async (): Promise<string[]> => {
    try {
      const response = await apiClient.get<string[]>('/api/posts');
      return response.data;
    } catch (error: any) {
      console.error('Failed to get files:', error);
      // 静默返回空数组，不弹窗打扰用户
      return [];
    }
  },

  getFolders: async (): Promise<string[]> => {
    try {
      const response = await apiClient.get<string[]>('/api/folders');
      return response.data;
    } catch (error) {
      console.error('Failed to get folders:', error);
      return []; // 不重复弹窗
    }
  },

  getPostContent: async (filename: string): Promise<string> => {
    const response = await apiClient.get<string>(`/api/posts/${encodeURIComponent(filename)}`);
    return response.data;
  },

  savePostContent: async (filename:string, content: string): Promise<void> => {
    await apiClient.post(`/api/posts/${encodeURIComponent(filename)}`, { content });
  },

  createPost: async (filename: string): Promise<void> => {
    // Basic client-side validation and normalization to reduce backend 422s
    const name = filename?.toString().trim();
    if (!name) throw new Error('Filename is empty');
    // Normalize Windows backslashes to forward slashes
    const normalized = name.replace(/\\/g, '/');
    // Ensure extension
    const finalName = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
    await apiClient.post('/api/posts/new', { filename: finalName });
  },

  createFolder: async (path: string): Promise<void> => {
    await apiClient.post('/api/folders/new', { path });
  },
  
  deletePost: async (filename: string): Promise<void> => {
    await apiClient.delete(`/api/posts/${encodeURIComponent(filename)}`);
  },

  deleteFolder: async (path: string): Promise<void> => {
    await apiClient.delete(`/api/folders/${encodeURIComponent(path)}`);
  },

  // --- Trash Management ---
  listTrash: async (): Promise<string[]> => {
    try {
      const response = await apiClient.get<string[]>('/api/trash');
      return response.data;
    } catch (error: any) {
      console.error('Failed to list trash:', error);
      return [];
    }
  },

  restoreTrash: async (path: string): Promise<void> => {
    await apiClient.post('/api/trash/restore', { path });
  },

  permanentDelete: async (path: string): Promise<void> => {
    await apiClient.delete(`/api/trash/${encodeURIComponent(path)}`);
  },

  emptyTrash: async (): Promise<void> => {
    await apiClient.delete('/api/trash');
  },

  initPostsFolder: async (): Promise<any> => {
    const resp = await apiClient.post('/api/posts/init');
    return resp.data;
  },

  /**
   * 批量恢复：并发执行恢复请求，并返回每项的结果信息。
   * 可传入可选的 AbortSignal 用于取消操作，以及可选的 progress 回调用于前端展示进度。
   */
  restoreTrashBatch: async (
    paths: string[],
    options?: { signal?: AbortSignal; onProgress?: (completed: number, total: number, item?: string, ok?: boolean) => void }
  ): Promise<Array<{ path: string; ok: boolean; status?: number; error?: string }>> => {
    const total = paths.length;
    let completed = 0;
    const promises = paths.map(async (p) => {
      try {
        const resp = await apiClient.post('/api/trash/restore', { path: p }, { signal: options?.signal });
        completed += 1;
        options?.onProgress?.(completed, total, p, true);
        return { path: p, ok: true, status: resp.status };
      } catch (err: any) {
        completed += 1;
        options?.onProgress?.(completed, total, p, false);
        return { path: p, ok: false, status: err?.response?.status, error: err?.message || String(err) };
      }
    });

    return Promise.all(promises);
  },

  /**
   * 批量永久删除：并发执行删除请求，返回每项结果。
   */
  permanentDeleteBatch: async (
    paths: string[],
    options?: { signal?: AbortSignal; onProgress?: (completed: number, total: number, item?: string, ok?: boolean) => void }
  ): Promise<Array<{ path: string; ok: boolean; status?: number; error?: string }>> => {
    const total = paths.length;
    let completed = 0;
    const promises = paths.map(async (p) => {
      try {
        const resp = await apiClient.delete(`/api/trash/${encodeURIComponent(p)}`, { signal: options?.signal });
        completed += 1;
        options?.onProgress?.(completed, total, p, true);
        return { path: p, ok: true, status: resp.status };
      } catch (err: any) {
        completed += 1;
        options?.onProgress?.(completed, total, p, false);
        return { path: p, ok: false, status: err?.response?.status, error: err?.message || String(err) };
      }
    });

    return Promise.all(promises);
  },
  
  // setHexoPath 函数已被移除，由 saveConfig 替代
};