# UI 展示模块详细设计

## 1. 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | UI 展示模块 (UI Presentation Module) |
| 模块编号 | M03 |
| 优先级 | P0 |
| 关联文档 | [HLD.md](../HLD.md) |
| 版本 | v1.1 |
| 更新日期 | 2026-03-21 |

---

## 2. 模块概述

### 2.1 职责

UI 展示模块负责便利贴窗口渲染、登录入口展示、设备列表与设备卡片交互、设置面板和窗口管理。

### 2.2 首期范围

**首期必须实现：**
- 便利贴主窗口
- 米家登录入口与登录状态展示
- 设备列表与房间分组展示
- 设备卡片基础控制
- 设置面板（窗口、主题、刷新间隔）
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
| 设备卡片 | 展示设备信息和控制入口 | P0 |
| 开关控制 | 点击切换设备开关 | P0 |
| 亮度/色温调节 | 详情面板调节 | P1 |
| 设置面板 | 主题、透明度、自动刷新等 | P0 |
| 系统托盘 | 最小化到托盘 | P1 |

### 2.4 依赖关系

```
┌─────────────────┐
│     用户        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  UI 展示模块    │
│    (M03)        │
└────────┬────────┘
         │
    ┌────┴────┬────────────┐
    │         │            │
    ▼         ▼            ▼
┌─────────┐ ┌──────────┐ ┌──────────┐
│设备管理 │ │设备控制  │ │配置管理  │
│(M01)    │ │(M02)     │ │(M04)     │
└─────────┘ └──────────┘ └──────────┘
```

---

## 3. 界面设计

### 3.1 便利贴主界面

```
┌─────────────────────────────────────────────────────────┐
│  米家便利贴                                 ─ □ ✕      │
├─────────────────────────────────────────────────────────┤
│  账号状态：已登录 / 未登录                              │
│  [登录] [同步] [设置]                                   │
├─────────────────────────────────────────────────────────┤
│  客厅                                        [刷新]     │
│  ┌───────────────────────────────────────────────────┐ │
│  │  主灯                          [●] 开        >   │ │
│  │  在线 · 亮度 80%                                   │ │
│  └───────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐ │
│  │  插座                          [○] 关        >   │ │
│  │  在线 · 可控制                                     │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  卧室                                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │  床头灯                        [●] 开        >   │ │
│  │  离线 · 最近同步 10:30                            │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 设备详情面板

```
┌─────────────────────────────────────────────────────────┐
│  主灯                                       [×]        │
├─────────────────────────────────────────────────────────┤
│  状态：开启                                             │
│  房间：客厅                                             │
│  型号：yeelink.light.xxx                                │
│                                                         │
│  亮度： [──────────●────] 80%                           │
│  色温： [──────●────────] 暖白                          │
│                                                         │
│  [关闭]                                  [保存]        │
└─────────────────────────────────────────────────────────┘
```

### 3.3 设置面板

```
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
│                              [保存]   [取消]           │
└─────────────────────────────────────────────────────────┘
```

### 3.4 登录弹窗

```
┌─────────────────────────────────────────────────────────┐
│  米家登录                                     [×]      │
├─────────────────────────────────────────────────────────┤
│  账号： [____________________________]                  │
│  密码： [____________________________]                  │
│  区域： [中国大陆 v]                                    │
│                                                         │
│  登录失败时展示错误提示                                 │
│                                                         │
│                              [登录]   [取消]           │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 组件设计

### 4.1 组件树结构

```
App
├── StickyWindow
│   ├── TitleBar
│   │   ├── Title
│   │   └── WindowControls
│   ├── SessionBanner
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
└── LoginModal
```

### 4.2 核心组件说明

#### 4.2.1 StickyWindow

```typescript
interface StickyWindowProps {
  alwaysOnTop: boolean;
  opacity: number;
  theme: 'light' | 'dark' | 'system';
}
```

职责：
- 承载整个便利贴布局
- 响应窗口拖拽、置顶和透明度配置

#### 4.2.2 SessionBanner

```typescript
interface SessionBannerProps {
  loggedIn: boolean;
  accountId?: string;
  lastSyncAt?: string;
  onLogin: () => void;
  onSync: () => void;
}
```

职责：
- 展示登录态
- 提供登录/重新登录入口
- 提供同步入口

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

#### 4.2.4 SettingsModal

```typescript
interface SettingsModalProps {
  config: AppConfig;
  onSave: (patch: Partial<AppConfig>) => Promise<void>;
}
```

#### 4.2.5 LoginModal

```typescript
interface LoginModalProps {
  visible: boolean;
  loading: boolean;
  onSubmit: (payload: LoginRequest) => Promise<void>;
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
  tokenExpiry?: string;
  loginLoading: boolean;
  error: string | null;
  login: (payload: LoginRequest) => Promise<void>;
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

### 6.3 IPC 约定

- 所有主进程能力通过 preload 暴露到渲染进程。
- 渲染进程不直接访问 Node API。
- IPC 仅暴露白名单接口：登录、同步、控制、配置读取与保存。

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
- 设备卡片优先展示可操作信息，不堆叠开发态字段。
- 未登录和同步失败态需要明显但不过度惊扰用户。

---

## 8. 测试要点

### 8.1 组件测试

| 测试项 | 内容 |
|--------|------|
| SessionBanner | 登录态展示与按钮交互 |
| DeviceCard | 可控/不可控状态渲染 |
| SettingsModal | 配置变更与校验 |
| LoginModal | 表单校验与错误提示 |

### 8.2 集成测试

| 测试项 | 内容 |
|--------|------|
| 登录→同步→渲染 | 完整首期主流程 |
| 设置保存→窗口生效 | 配置联动 |
| 控制设备→状态刷新 | 控制后 UI 更新 |
| 托盘最小化 | 窗口管理行为 |

### 8.3 E2E 测试

| 场景 | 说明 |
|------|------|
| 首次启动未登录 | 展示登录入口与空态 |
| 登录成功后同步设备 | 列表正确展示 |
| 修改透明度与主题 | 重启后保持 |

---

## 9. 文档修订历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-03-17 | - | 初始版本 |
| v1.1 | 2026-03-21 | - | 移除 OpenClaw/Agent/批处理相关界面与状态设计，收敛为首期可实现 UI |

---

**文档结束**
