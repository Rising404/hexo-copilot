export interface Post {
  filename: string;
  content: string;
}

export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface ChatMessage {
  role: Role;
  text: string;
}

export interface FileService {
  getFiles: () => Promise<string[]>;
  getFolders: () => Promise<string[]>;
  getPostContent: (filename: string) => Promise<string>;
  savePostContent: (filename: string, content: string) => Promise<void>;
  createPost: (filename: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  deletePost: (filename: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  // Trash management
  listTrash?: () => Promise<string[]>;
  restoreTrash?: (path: string) => Promise<void>;
  permanentDelete?: (path: string) => Promise<void>;
  setHexoPath: (path: string) => Promise<void>;
}