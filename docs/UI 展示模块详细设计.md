# UI 展示模块详细设计

## 1. 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | UI 展示模块 (UI Presentation Module) |
| 模块编号 | M03 |
| 优先级 | P0 |
| 关联文档 | [HLD.md](../HLD.md) |
| 版本 | v1.2 |
| 更新日期 | 2026-03-21 |

---

## 2. 模块概述

### 2.1 职责

UI 展示模块负责便利贴窗口渲染、扫码登录入口展示、设备列表与设备卡片交互、设置面板和窗口管理。

### 2.2 首期范围

**首期必须实现：**
- 便利贴主窗口
- 米家扫码登录入口与登录状态展示
- 二维码登录弹窗与轮询状态
- 设备列表与房间分组展示
- 设备卡片基础控制
- 设置面板（窗口、主题、刷新间隔、服务状态）
- 系统托盘与窗口置顶

**首期明确不做：**
- OpenClaw 设置
- 批处理脚本管理界面
- 自然语言控制台
- Agent 输入框与消息会话

### 2.3 功能范围

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 便利贴窗口 | 无边框、可置顶、可拖拽 | P0 |
| 登录状态展示 | 未登录提示、已登录状态、重新登录入口 | P0 |
| 二维码登录弹窗 | 展示二维码与轮询进度 | P0 |
| 设备卡片 | 展示设备信息和控制入口 | P0 |
| 开关控制 | 点击切换设备开关 | P0 |
| 亮度/色温调节 | 详情面板调节 | P1 |
| 设置面板 | 主题、透明度、自动刷新、服务状态 | P0 |
| 系统托盘 | 最小化到托盘 | P1 |

---

## 3. 界面设计

### 3.1 便利贴主界面

```text
┌─────────────────────────────────────────────────────────┐
│  米家便利贴                                 ─ □ ✕      │
├─────────────────────────────────────────────────────────┤
│  账号状态：已登录 / 未登录                              │
│  [扫码登录] [同步] [设置]                               │
│  云控：正常 / 异常   控制能力：可控 / 仅展示            │
├─────────────────────────────────────────────────────────┤
│  客厅                                        [刷新]     │
│  ┌───────────────────────────────────────────────────┐ │
│  │  主灯                        [●] 开          >   │ │
│  │  在线 · 云控优先                                  │ │
│  └───────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐ │
│  │  插座                        [○] 关          >   │ │
│  │  在线 · 可云控                                    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  卧室                                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │  传感器                      [不可控]        >    │ │
│  │  在线 · 仅展示状态                                │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 设备详情面板

```text
┌─────────────────────────────────────────────────────────┐
│  主灯                                       [×]        │
├─────────────────────────────────────────────────────────┤
│  状态：开启                                             │
│  房间：客厅                                             │
│  型号：yeelink.light.xxx                                │
│  控制路径：云端控制 / 仅展示                           │
│                                                         │
│  亮度： [──────────●────] 80%                           │
│  色温： [──────●────────] 暖白                          │
│                                                         │
│  [关闭]                                  [保存]        │
└─────────────────────────────────────────────────────────┘
```

### 3.3 设置面板

```text
┌─────────────────────────────────────────────────────────┐
│  设置                                       [×]        │
├─────────────────────────────────────────────────────────┤
│  窗口设置                                               │
│  - 窗口大小：小 / 中 / 大                               │
│  - 透明度：80% - 100%                                   │
│  - 始终置顶：开 / 关                                    │
│                                                         │
│  外观设置                                               │
│  - 主题：浅色 / 深色 / 跟随系统                         │
│  - 字体大小：12 - 24                                    │
│                                                         │
│  设备刷新                                               │
│  - 自动刷新：开 / 关                                    │
│  - 刷新间隔：30 - 3600 秒                               │
│                                                         │
│  服务状态                                               │
│  - 云控桥接：正常 / 异常                                │
│  - 控制能力：可控 / 仅展示                              │
│                                                         │
│                              [保存]   [取消]           │
└─────────────────────────────────────────────────────────┘
```

### 3.4 二维码登录弹窗

```text
┌─────────────────────────────────────────────────────────┐
│  米家扫码登录                                 [×]      │
├─────────────────────────────────────────────────────────┤
│  请使用米家 App 扫描下方二维码                          │
│                                                         │
│             [ QR Code / Data URL Image ]                │
│                                                         │
│  状态：等待扫码 / 已扫码确认中 / 已过期                 │
│                                                         │
│                    [刷新二维码] [取消]                 │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 组件设计

### 4.1 组件树结构

```text
App
├── StickyWindow
│   ├── TitleBar
│   ├── SessionBanner
│   ├── ServiceStatusBar
│   ├── Toolbar
│   │   ├── LoginButton
│   │   ├── SyncButton
│   │   └── SettingsButton
│   ├── DeviceList
│   │   ├── RoomGroup × N
│   │   │   └── DeviceCard × N
│   └── Footer
├── DeviceDetailDrawer
├── SettingsModal
└── QrLoginModal
```

### 4.2 核心组件说明

#### 4.2.1 SessionBanner

```typescript
interface SessionBannerProps {
  loggedIn: boolean;
  accountId?: string;
  lastSyncAt?: string;
  onOpenLogin: () => void;
  onSync: () => void;
}
```

职责：
- 展示登录态
- 提供扫码登录/重新登录入口
- 提供同步入口

#### 4.2.2 ServiceStatusBar

```typescript
interface ServiceStatusBarProps {
  cloudReady: boolean;
  localFallbackEnabled: boolean;
}
```

职责：
- 展示云控桥接服务状态
- 展示云控服务是否可用

#### 4.2.3 DeviceCard

```typescript
interface DeviceCardProps {
  device: Device;
  onToggle: (deviceId: string, nextPower: boolean) => void;
  onOpenDetail: (deviceId: string) => void;
}
```

职责：
- 展示设备状态与基础控制
- 在设备不可控时展示禁用态
- 标明“云控可用”“仅展示”状态

#### 4.2.4 QrLoginModal

```typescript
interface QrLoginModalProps {
  visible: boolean;
  qrCodeData?: string;
  status: 'idle' | 'pending' | 'scanned' | 'expired' | 'failed';
  error?: string;
  onRefresh: () => Promise<void>;
  onCancel: () => void;
}
```

---

## 5. 状态管理

### 5.1 Device Store

```typescript
interface DeviceState {
  devices: Device[];
  rooms: Room[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  fetchDevices: () => Promise<void>;
  syncDevices: (force?: boolean) => Promise<void>;
  updateDeviceStatus: (deviceId: string, patch: Partial<DeviceStatus>) => void;
}
```

### 5.2 Session Store

```typescript
interface SessionState {
  loggedIn: boolean;
  accountId?: string;
  qrCodeData?: string;
  loginStatus: 'idle' | 'pending' | 'scanned' | 'expired' | 'failed';
  error: string | null;
  startQrLogin: () => Promise<void>;
  pollQrLogin: (ticketId: string) => Promise<void>;
  logout: () => Promise<void>;
}
```

### 5.3 Config Store

```typescript
interface ConfigState {
  windowSettings: {
    width: number;
    height: number;
    alwaysOnTop: boolean;
    opacity: number;
  };
  theme: 'light' | 'dark' | 'system';
  refreshInterval: number;
  autoRefresh: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (patch: Partial<AppConfig>) => Promise<void>;
}
```

---

## 6. 窗口管理

### 6.1 Electron 主进程窗口配置

```typescript
export function createStickyWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}
```

### 6.2 窗口交互要求

- 标题栏支持拖拽窗口。
- 设置中切换“始终置顶”后立即同步到主进程。
- 关闭窗口时默认最小化到托盘，避免误退出。
- 登录弹窗使用模态层，不额外打开独立窗口。

### 6.3 IPC 约定

- 所有主进程能力通过 preload 暴露到渲染进程。
- 渲染进程不直接访问 Node API。
- IPC 白名单接口覆盖：扫码登录、轮询登录、同步、控制、配置读取与保存。

---

## 7. 主题与样式

### 7.1 主题变量

```css
:root {
  --bg: rgba(255, 248, 220, 0.92);
  --panel: rgba(255, 255, 255, 0.82);
  --text: #2c241b;
  --muted: #7a6a55;
  --accent: #e0a100;
  --border: rgba(92, 72, 42, 0.12);
}
```

### 7.2 视觉要求

- 便利贴整体保持轻量、温暖、非工具台式布局。
- 登录前允许看到空态框架和扫码入口，不必整屏空白。
- 不可控设备必须有明显禁用提示。
- 设备控制路径状态只做轻提示，不干扰主操作。

---

## 8. 文档修订历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-03-17 | - | 初始版本 |
| v1.1 | 2026-03-21 | - | 剔除 OpenClaw/Agent 相关首期 UI |
| v1.2 | 2026-03-21 | - | 登录交互改为扫码流程，补充云控状态展示 |
| v1.3 | 2026-03-29 | - | 删除本地回退展示口径，收束为纯云控方案 |

---

**文档结束**
