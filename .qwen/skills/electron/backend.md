# Backend Integration Patterns

## Pattern 1: Embedded Express Server

```typescript
// src/main/backend/server.ts
import express, { Express } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { app as electronApp } from 'electron';

let server: Server | null = null;
let serverPort: number = 0;

export async function startEmbeddedServer(): Promise<number> {
  const app: Express = express();

  app.use(cors({ origin: 'file://' }));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: electronApp.getVersion() });
  });

  app.get('/api/data', async (req, res) => {
    const data = await getDataFromDatabase();
    res.json(data);
  });

  return new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      if (typeof address === 'object' && address) {
        serverPort = address.port;
        console.log(`Embedded server running on port ${serverPort}`);
        resolve(serverPort);
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
  });
}

export function stopEmbeddedServer(): void {
  server?.close();
}
```

---

## Pattern 2: Local SQLite Database

```typescript
// src/main/database/index.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export function initDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'app.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations();
  return db;
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = db.prepare('SELECT name FROM migrations').all() as { name: string }[];
  const appliedSet = new Set(applied.map(m => m.name));

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (!appliedSet.has(file)) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    }
  }
}

// Repository pattern
export const itemsRepo = {
  getAll(): Item[] {
    return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
  },
  getById(id: number): Item | undefined {
    return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
  },
  create(data: Omit<Item, 'id'>): Item {
    const stmt = db.prepare('INSERT INTO items (name, description) VALUES (?, ?)');
    const result = stmt.run(data.name, data.description);
    return this.getById(result.lastInsertRowid as number)!;
  },
  delete(id: number): boolean {
    return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
  },
};
```

---

## Pattern 3: External API Communication

```typescript
// src/preload/api.ts
import { contextBridge } from 'electron';

// API 配置 - 通过环境变量或配置文件注入，避免硬编码
interface ApiConfig {
  baseUrl: string;
  timeout: number;
  allowedHosts: string[];
}

// 从配置加载（可以是环境变量、配置文件或 IPC 获取）
const API_CONFIG: ApiConfig = {
  baseUrl: process.env.API_URL || 'https://api.example.com',
  timeout: 30000,
  allowedHosts: [
    'https://api.example.com',
    'https://api-backup.example.com',
  ],
};

function validateApiUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    return API_CONFIG.allowedHosts.includes(origin);
  } catch {
    return false;
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const fullUrl = `${API_CONFIG.baseUrl}${endpoint}`;
  
  // 验证 URL 在白名单中
  if (!validateApiUrl(fullUrl)) {
    throw new Error(`API URL ${fullUrl} 不在允许列表中`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

  try {
    const response = await fetch(fullUrl, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

contextBridge.exposeInMainWorld('api', {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, data: unknown) => apiRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  put: <T>(endpoint: string, data: unknown) => apiRequest<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
  // 允许运行时更新配置（通过 IPC 从主进程获取）
  updateConfig: (newConfig: Partial<ApiConfig>) => {
    Object.assign(API_CONFIG, newConfig);
  },
});
```

---

## Pattern 4: Offline-First with Sync

```typescript
// src/renderer/services/sync-manager.ts
interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entity: string;
  data: unknown;
  timestamp: number;
  retries: number;
}

class SyncManager {
  private queue: SyncQueueItem[] = [];
  private isOnline = navigator.onLine;
  private isSyncing = false;

  constructor() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    this.loadQueue();
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.processQueue();
  }

  async enqueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    this.queue.push({
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0,
    });
    await this.saveQueue();
    if (this.isOnline) this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isSyncing || this.queue.length === 0) return;
    this.isSyncing = true;

    while (this.queue.length > 0 && this.isOnline) {
      const item = this.queue[0];
      try {
        await this.syncItem(item);
        this.queue.shift();
        await this.saveQueue();
      } catch {
        item.retries++;
        if (item.retries >= 3) this.queue.shift();
        break;
      }
    }

    this.isSyncing = false;
  }
}

export const syncManager = new SyncManager();
```

---

## Pattern 5: Secure Token Storage

```typescript
// src/main/auth/token-store.ts
import { safeStorage } from 'electron';
import Store from 'electron-store';

const store = new Store({ name: 'auth' });

export const tokenStore = {
  setToken(token: string): void {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      store.set('accessToken', encrypted.toString('base64'));
    } else {
      store.set('accessToken', token);
    }
  },

  getToken(): string | null {
    const stored = store.get('accessToken') as string | undefined;
    if (!stored) return null;

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        return null;
      }
    }
    return stored;
  },

  clearToken(): void {
    store.delete('accessToken');
  },
};

// IPC handlers
ipcMain.handle('auth:getToken', () => tokenStore.getToken());
ipcMain.handle('auth:setToken', (_event, token: string) => tokenStore.setToken(token));
ipcMain.handle('auth:clearToken', () => tokenStore.clearToken());
```

---

## WebSocket Integration

```typescript
// src/preload/websocket.ts
import { contextBridge, ipcRenderer } from 'electron';

// 允许的 WebSocket 服务器白名单
const ALLOWED_WS_HOSTS = ['wss://api.example.com', 'wss://realtime.example.com'];

function validateWebSocketUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // 只允许 wss 协议（加密连接）
    if (parsedUrl.protocol !== 'wss:') {
      console.error('WebSocket 必须使用 wss 加密协议');
      return false;
    }
    // 验证主机在白名单中
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    if (!ALLOWED_WS_HOSTS.includes(origin)) {
      console.error(`WebSocket 主机 ${origin} 不在白名单中`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private handlers = new Map<string, Set<(data: unknown) => void>>();
  private expectedServerToken: string | null = null;

  connect(url: string, serverToken?: string): void {
    // 验证 URL
    if (!validateWebSocketUrl(url)) {
      throw new Error('无效的 WebSocket URL');
    }

    this.expectedServerToken = serverToken ?? null;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      ipcRenderer.send('ws:connected');
    };

    this.ws.onclose = () => {
      ipcRenderer.send('ws:disconnected');
      this.attemptReconnect(url);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      ipcRenderer.send('ws:error', error.message);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // 验证服务器令牌（可选的双向认证）
        if (this.expectedServerToken && message.serverToken !== this.expectedServerToken) {
          console.error('服务器令牌验证失败，可能是中间人攻击');
          this.ws?.close();
          return;
        }
        this.handlers.get(message.type)?.forEach(h => h(message.data));
      } catch (error) {
        console.error('WebSocket 消息解析失败:', error);
      }
    };
  }

  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(url), delay);
    }
  }

  subscribe(type: string, handler: (data: unknown) => void): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  send(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }
}

const wsManager = new WebSocketManager();

contextBridge.exposeInMainWorld('websocket', {
  connect: (url: string) => wsManager.connect(url),
  disconnect: () => wsManager.disconnect(),
  subscribe: (type: string, handler: (data: unknown) => void) => wsManager.subscribe(type, handler),
  send: (type: string, data: unknown) => wsManager.send(type, data),
});
```
