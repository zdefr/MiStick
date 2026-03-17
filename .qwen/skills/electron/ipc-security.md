# IPC Communication & Security

## Type-Safe IPC Setup

### Shared Types

```typescript
// src/shared/ipc-types.ts
export interface IpcChannels {
  'dialog:openFile': { args: []; return: string | null };
  'dialog:saveFile': { args: [content: string]; return: boolean };
  // 预定义查询接口 - 避免 SQL 注入风险
  'db:items:getAll': { args: []; return: unknown[] };
  'db:items:getById': { args: [id: number]; return: unknown | null };
  'db:items:create': { args: [data: { name: string; description?: string }]; return: unknown };
  'db:items:update': { args: [id: number, data: { name?: string; description?: string }]; return: boolean };
  'db:items:delete': { args: [id: number]; return: boolean };
  'app:getVersion': { args: []; return: string };
}

export type IpcChannel = keyof IpcChannels;
```

### Preload Script

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannels, IpcChannel } from '../shared/ipc-types';

type IpcApi = {
  [K in IpcChannel]: (...args: IpcChannels[K]['args']) => Promise<IpcChannels[K]['return']>;
};

const electronAPI: IpcApi = {
  'dialog:openFile': () => ipcRenderer.invoke('dialog:openFile'),
  'dialog:saveFile': (content) => ipcRenderer.invoke('dialog:saveFile', content),
  // 预定义数据库操作 - 避免 SQL 注入
  'db:items:getAll': () => ipcRenderer.invoke('db:items:getAll'),
  'db:items:getById': (id) => ipcRenderer.invoke('db:items:getById', id),
  'db:items:create': (data) => ipcRenderer.invoke('db:items:create', data),
  'db:items:update': (id, data) => ipcRenderer.invoke('db:items:update', id, data),
  'db:items:delete': (id) => ipcRenderer.invoke('db:items:delete', id),
  'app:getVersion': () => ipcRenderer.invoke('app:getVersion'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Event subscriptions
contextBridge.exposeInMainWorld('electronEvents', {
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  onUpdateAvailable: (callback: (version: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string) => callback(version);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
});
```

### Type Declarations

```typescript
// src/preload/types.d.ts
import type { IpcChannels, IpcChannel } from '../shared/ipc-types';

type IpcApi = {
  [K in IpcChannel]: (...args: IpcChannels[K]['args']) => Promise<IpcChannels[K]['return']>;
};

interface ElectronEvents {
  onMenuAction: (callback: (action: string) => void) => () => void;
  onUpdateAvailable: (callback: (version: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IpcApi;
    electronEvents: ElectronEvents;
  }
}
```

### Main Process Handlers

```typescript
// src/main/ipc/index.ts
import { ipcMain, dialog, app } from 'electron';
import { db } from '../database';

export function registerIpcHandlers() {
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_event, content: string) => {
    const result = await dialog.showSaveDialog({});
    if (result.canceled || !result.filePath) return false;
    await fs.promises.writeFile(result.filePath, content, 'utf-8');
    return true;
  });

  // 预定义数据库操作 - 使用参数化查询，完全避免 SQL 注入
  ipcMain.handle('db:items:getAll', async () => {
    return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
  });

  ipcMain.handle('db:items:getById', async (_event, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid item ID');
    }
    return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  });

  ipcMain.handle('db:items:create', async (_event, data: { name: string; description?: string }) => {
    // 验证输入
    if (!data || typeof data.name !== 'string' || data.name.trim() === '') {
      throw new Error('Invalid item data: name is required');
    }
    const stmt = db.prepare('INSERT INTO items (name, description) VALUES (?, ?)');
    const result = stmt.run(data.name.trim(), data.description?.trim() ?? null);
    return db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:items:update', async (_event, id: number, data: { name?: string; description?: string }) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid item ID');
    }
    if (!data || (data.name === undefined && data.description === undefined)) {
      throw new Error('No data to update');
    }
    const updates: string[] = [];
    const values: (string | null)[] = [];
    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name.trim());
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description.trim());
    }
    values.push(id);
    const stmt = db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
  });

  ipcMain.handle('db:items:delete', async (_event, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid item ID');
    }
    const stmt = db.prepare('DELETE FROM items WHERE id = ?');
    return stmt.run(id).changes > 0;
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
}
```

### IPC Patterns Summary

| Pattern | Main Process | Preload | Renderer | Use Case |
|---------|--------------|---------|----------|----------|
| Request/Response | `ipcMain.handle()` | `ipcRenderer.invoke()` | `await window.electronAPI.method()` | Data queries, dialogs |
| One-way (R→M) | `ipcMain.on()` | `ipcRenderer.send()` | `window.electronAPI.notify()` | Fire-and-forget events |
| Push (M→R) | `webContents.send()` | `ipcRenderer.on()` | `window.electronEvents.onX()` | Menu actions, updates |

---

## Security Configuration

### Secure BrowserWindow

```typescript
// src/main/window.ts
import { BrowserWindow, app } from 'electron';
import path from 'path';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // Security defaults (Electron 20+)
      contextIsolation: true,      // Isolate preload from renderer
      nodeIntegration: false,      // No Node.js in renderer
      sandbox: true,               // OS-level sandboxing
      webSecurity: true,           // Same-origin policy (NEVER disable)
      allowRunningInsecureContent: false,
      enableWebSQL: false,
      experimentalFeatures: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Content Security Policy - 严格限制，移除 'unsafe-inline'
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self'",  // 移除 'unsafe-inline'，使用外部样式表或 nonce
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "connect-src 'self' https://api.example.com wss://api.example.com",
          "frame-src 'none'",
          "object-src 'none'",
        ].join('; '),
      },
    });
  });

  // Prevent navigation to external URLs
  win.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });

  // Prevent new window creation
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}
```

### Security Checklist

```markdown
## Pre-Production Security Audit

### Process Isolation
- [ ] `contextIsolation: true` - Preload runs in isolated context
- [ ] `nodeIntegration: false` - No Node.js APIs in renderer
- [ ] `sandbox: true` - OS-level process sandboxing
- [ ] `webSecurity: true` - Same-origin policy enforced

### IPC Security
- [ ] Never expose raw `ipcRenderer` to renderer
- [ ] Validate ALL inputs in `ipcMain.handle()` handlers
- [ ] Use typed channels with strict parameter validation
- [ ] Sanitize file paths to prevent directory traversal
- [ ] Rate-limit expensive IPC operations

### Content Security
- [ ] CSP headers configured and restrictive
- [ ] No `eval()` or `new Function()` with user input
- [ ] No `innerHTML` with unsanitized user content
- [ ] HTTPS only for external resources

### External Interactions
- [ ] Validate URLs before `shell.openExternal()`
- [ ] Whitelist allowed external protocols
- [ ] Block navigation to untrusted origins

### Sensitive Data
- [ ] Use `safeStorage` API for credentials
- [ ] Never store tokens in localStorage
- [ ] Clear sensitive data on logout
- [ ] Encrypt local databases if containing PII

### Updates & Distribution
- [ ] Code signing enabled for all platforms
- [ ] Hardened runtime on macOS
- [ ] Auto-updater verifies signatures
```
