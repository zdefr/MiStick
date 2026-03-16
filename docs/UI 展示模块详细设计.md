# UI 展示模块详细设计

## 1. 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | UI 展示模块 (UI Presentation Module) |
| 模块编号 | M03 |
| 优先级 | P0 |
| 关联文档 | [HLD.md](../HLD.md) |

---

## 2. 模块概述

### 2.1 职责

UI 展示模块负责便利贴窗口的渲染、设备卡片展示、用户交互响应和窗口管理。

### 2.2 功能范围

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 便利贴窗口 | 无边框窗口，置顶显示 | P0 |
| 窗口拖拽 | 鼠标拖拽移动窗口 | P0 |
| 设备卡片 | 展示设备信息和控制入口 | P0 |
| 开关控制 | 点击切换设备开关 | P0 |
| 亮度调节 | 滑块调节亮度 | P1 |
| 窗口置顶 | 始终置顶开关 | P0 |
| 透明度调节 | 窗口透明度设置 | P1 |
| 主题切换 | 浅色/深色主题 | P1 |
| 系统托盘 | 最小化到托盘 | P1 |

### 2.3 依赖关系

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
│  🏠 米家便利贴                              ─ □ ✕      │  ← 标题栏
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🛋️ 客厅                                  [刷新] 🔄    │  ← 房间分组
│  ┌───────────────────────────────────────────────────┐ │
│  │  💡 主灯                           [●] 开    >   │ │  ← 设备卡片
│  │      亮度：████████░░ 80%                         │ │
│  └───────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐ │
│  │  🔌 空调插座                       [○] 关    >   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  🛏️ 卧室                                                │
│  ┌───────────────────────────────────────────────────┐ │
│  │  💡 床头灯                         [●] 开    >   │ │
│  │      亮度：██████░░░░ 60%                         │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  💬 对 Agent 说："执行回家模式"          [发送]        │  ← 自然语言输入
└─────────────────────────────────────────────────────────┘
```

### 3.2 设备卡片详情界面

```
┌─────────────────────────────────────────────────────────┐
│  💡 主灯                                  [×]          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    ┌─────────┐                          │
│                    │   💡    │                          │
│                    │  主灯   │                          │
│                    └─────────┘                          │
│                                                         │
│         状态：● 开启                                    │
│         亮度：80%                                       │
│         色温：暖白                                      │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  亮度                                             │ │
│  │  ├───────┼───────┼───────┼───────┼───────┤       │ │
│  │  0      25      50      75     100     [%]       │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  色温                                             │ │
│  │  暖白 ◄───────┼───────┼───────► 冷白             │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│         [关闭]              [保存]                      │
└─────────────────────────────────────────────────────────┘
```

### 3.3 设置面板

```
┌─────────────────────────────────────────────────────────┐
│  设置                                      [×]         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  窗口设置                                               │
│  ┌───────────────────────────────────────────────────┐ │
│  │  窗口大小   ○ 小  ● 中  ○ 大                      │ │
│  │  透明度     [████████░░] 80%                      │ │
│  │  置顶       [✓] 始终置顶                          │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  外观设置                                               │
│  ┌───────────────────────────────────────────────────┐ │
│  │  主题       ○ 浅色  ● 深色                        │ │
│  │  字体大小   [14] px                               │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  OpenClaw 配置                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │  服务地址   http://localhost:8000                 │ │
│  │  API Key    ******************                    │ │
│  │  状态       ● 已连接                              │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│                    [保存]    [取消]                     │
└─────────────────────────────────────────────────────────┘
```

### 3.4 批处理脚本管理界面

```
┌─────────────────────────────────────────────────────────┐
│  批处理脚本                                [+] 添加    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  📝 home_mode.py                                  │ │
│  │     回家模式：开灯 + 开空调 + 开电视              │ │
│  │     状态：✅ 已注册到 OpenClaw                    │ │
│  │     最后执行：2026-03-17 10:30                    │ │
│  │     [测试运行]  [编辑]  [删除]                    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  📝 sleep_mode.py                                 │ │
│  │     睡眠模式：关闭所有设备                        │ │
│  │     状态：✅ 已注册到 OpenClaw                    │ │
│  │     最后执行：2026-03-16 23:00                    │ │
│  │     [测试运行]  [编辑]  [删除]                    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  📝 away_mode.py                                  │ │
│  │     离家模式：关灯 + 关空调 + 启动监控            │ │
│  │     状态：❌ 未注册                               │ │
│  │     [测试运行]  [注册]  [编辑]  [删除]            │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.5 自然语言控制台

```
┌─────────────────────────────────────────────────────────┐
│  💬 OpenClaw 智能控制                       [×]        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  [Agent] 🤖                                      │ │
│  │  你好，我可以帮你执行批处理操作。                │ │
│  │  试试说"执行回家模式"                            │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  [用户] 👤                                       │ │
│  │  执行回家模式                                    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  [Agent] 🤖                                      │ │
│  │  正在调用 home_mode.py...                        │ │
│  │  ✅ 回家模式执行完成                             │ │
│  │     - 客厅灯：已打开                            │ │
│  │     - 空调：已打开 (26°C)                       │ │
│  │     - 电视：已打开                              │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  > 输入指令...                        [发送]          │ │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 组件设计

### 4.1 组件树结构

```
App
├── StickyWindow (便利贴窗口)
│   ├── TitleBar (标题栏)
│   │   ├── Logo
│   │   ├── Title
│   │   └── WindowControls (最小化/置顶/关闭)
│   ├── DeviceList (设备列表)
│   │   ├── RoomGroup (房间分组) × N
│   │   │   ├── RoomHeader
│   │   │   └── DeviceCard (设备卡片) × N
│   │   │       ├── DeviceIcon
│   │   │       ├── DeviceName
│   │   │       ├── DeviceStatus
│   │   │       ├── ToggleSwitch
│   │   │       └── ExpandPanel (展开面板)
│   │   │           ├── BrightnessSlider
│   │   │           └── ColorTempSlider
│   ├── AgentInput (Agent 输入框)
│   └── Footer (底部栏)
│       ├── RefreshButton
│       └── SettingsButton
└── SettingsModal (设置弹窗)
    ├── WindowSettings
    ├── AppearanceSettings
    └── OpenClawSettings
```

### 4.2 核心组件说明

#### 4.2.1 StickyWindow

便利贴主窗口组件。

```typescript
interface StickyWindowProps {
  alwaysOnTop: boolean;
  opacity: number;
  theme: 'light' | 'dark';
}

// 功能
- 无边框窗口
- 拖拽移动
- 置顶控制
- 透明度控制
```

#### 4.2.2 DeviceCard

设备卡片组件。

```typescript
interface DeviceCardProps {
  device: Device;
  onToggle: (deviceId: string) => void;
  onBrightnessChange: (deviceId: string, level: number) => void;
  onClick: (deviceId: string) => void;
}

// 功能
- 显示设备信息
- 开关切换
- 展开详情
```

#### 4.2.3 ToggleSwitch

开关切换组件。

```typescript
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}
```

#### 4.2.4 BrightnessSlider

亮度调节滑块。

```typescript
interface BrightnessSliderProps {
  value: number;
  onChange: (value: number) => void;
  onChangeComplete?: (value: number) => void;  // 拖拽结束触发
  min?: number;
  max?: number;
  step?: number;
}
```

#### 4.2.5 AgentInput

自然语言输入框。

```typescript
interface AgentInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

---

## 5. 状态管理

### 5.1 Zustand Store

```typescript
// stores/deviceStore.ts
import { create } from 'zustand';

interface DeviceState {
  devices: Device[];
  rooms: Room[];
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchDevices: () => Promise<void>;
  updateDevice: (deviceId: string, updates: Partial<Device>) => void;
  removeDevice: (deviceId: string) => void;
  addRoom: (room: Room) => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  rooms: [],
  loading: false,
  error: null,
  
  fetchDevices: async () => {
    set({ loading: true });
    try {
      const devices = await ipcRenderer.invoke('device:getAll');
      set({ devices, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
  
  updateDevice: (deviceId, updates) => {
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, ...updates } : d
      ),
    }));
  },
  
  removeDevice: (deviceId) => {
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== deviceId),
    }));
  },
  
  addRoom: (room) => {
    set((state) => ({
      rooms: [...state.rooms, room],
    }));
  },
}));
```

### 5.2 配置 Store

```typescript
// stores/configStore.ts
interface ConfigState {
  windowSettings: {
    width: number;
    height: number;
    alwaysOnTop: boolean;
    opacity: number;
  };
  theme: 'light' | 'dark';
  openclaw: {
    enabled: boolean;
    url: string;
    token?: string;
  };
  
  updateSettings: (settings: Partial<ConfigState>) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}
```

### 5.3 Agent Store

```typescript
// stores/agentStore.ts
interface Message {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface AgentState {
  messages: Message[];
  isConnected: boolean;
  isProcessing: boolean;
  
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => void;
}
```

---

## 6. 窗口管理

### 6.1 Electron 主进程窗口配置

```typescript
// main/window.ts
import { BrowserWindow, screen } from 'electron';

export function createStickyWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  const window = new BrowserWindow({
    width: 400,
    height: 600,
    x: width - 420,  // 靠右显示
    y: 100,
    frame: false,     // 无边框
    transparent: true, // 透明背景
    alwaysOnTop: true, // 置顶
    opacity: 0.9,      // 透明度
    resizable: false,
    minimizable: true,
    maximizable: false,
    closable: true,
    skipTaskbar: true, // 不显示在任务栏
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  
  return window;
}
```

### 6.2 拖拽实现

```typescript
// components/TitleBar.tsx
const TitleBar: React.FC = () => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    ipcRenderer.send('window:start-drag');
  };
  
  return (
    <div 
      className="title-bar" 
      onMouseDown={handleMouseDown}
      style={{ WebkitAppRegion: 'drag' }}
    >
      <span>🏠 米家便利贴</span>
      <div className="window-controls">
        <button onClick={() => ipcRenderer.send('window:minimize')}>─</button>
        <button onClick={() => ipcRenderer.send('window:toggle-ontop')}>□</button>
        <button onClick={() => ipcRenderer.send('window:close')}>✕</button>
      </div>
    </div>
  );
};
```

### 6.3 IPC 通信

```typescript
// main/ipc.ts
import { ipcMain, BrowserWindow } from 'electron';

export function setupWindowIPC(window: BrowserWindow) {
  // 开始拖拽
  ipcMain.on('window:start-drag', () => {
    window.setIgnoreMouseEvents(false);
  });
  
  // 最小化
  ipcMain.on('window:minimize', () => {
    window.minimize();
    window.hide();
  });
  
  // 切换置顶
  ipcMain.on('window:toggle-ontop', () => {
    const isOnTop = window.isAlwaysOnTop();
    window.setAlwaysOnTop(!isOnTop);
  });
  
  // 关闭
  ipcMain.on('window:close', () => {
    window.close();
  });
  
  // 更新透明度
  ipcMain.handle('window:set-opacity', (event, opacity: number) => {
    window.setOpacity(opacity);
  });
}
```

---

## 7. 主题设计

### 7.1 浅色主题

```css
/* themes/light.css */
:root[data-theme='light'] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-card: #fafafa;
  --text-primary: #333333;
  --text-secondary: #666666;
  --text-hint: #999999;
  --border-color: #e0e0e0;
  --accent-color: #0078d4;
  --success-color: #107c10;
  --error-color: #d13438;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

### 7.2 深色主题

```css
/* themes/dark.css */
:root[data-theme='dark'] {
  --bg-primary: #1f1f1f;
  --bg-secondary: #2d2d2d;
  --bg-card: #333333;
  --text-primary: #ffffff;
  --text-secondary: #cccccc;
  --text-hint: #888888;
  --border-color: #404040;
  --accent-color: #4fc3f7;
  --success-color: #81c784;
  --error-color: #e57373;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
```

---

## 8. 响应式设计

### 8.1 窗口尺寸

| 尺寸 | 宽度 | 高度 | 适用场景 |
|------|------|------|----------|
| 小 | 300px | 500px | 小屏幕，简洁模式 |
| 中 | 400px | 600px | 默认尺寸 |
| 大 | 500px | 700px | 大屏幕，完整功能 |

### 8.2 卡片布局

```css
.device-card {
  /* 小尺寸 */
  @media (max-width: 320px) {
    padding: 8px;
    font-size: 12px;
  }
  
  /* 中尺寸 */
  @media (min-width: 321px) and (max-width: 480px) {
    padding: 12px;
    font-size: 14px;
  }
  
  /* 大尺寸 */
  @media (min-width: 481px) {
    padding: 16px;
    font-size: 16px;
  }
}
```

---

## 9. 性能优化

### 9.1 虚拟列表

```typescript
// 使用 react-window 渲染大型设备列表
import { FixedSizeList } from 'react-window';

const DeviceList: React.FC<{ devices: Device[] }> = ({ devices }) => {
  return (
    <FixedSizeList
      height={400}
      itemCount={devices.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <DeviceCard key={devices[index].id} device={devices[index]} style={style} />
      )}
    </FixedSizeList>
  );
};
```

### 9.2 防抖处理

```typescript
// 亮度滑块防抖
const BrightnessSlider: React.FC<BrightnessSliderProps> = ({ onChange, onChangeComplete }) => {
  const handleChange = useCallback(
    debounce((value: number) => {
      onChangeComplete?.(value);
    }, 300),
    [onChangeComplete]
  );
  
  return (
    <Slider
      onChange={onChange}
      onChangeCommitted={handleChange}
    />
  );
};
```

### 9.3 图片懒加载

```typescript
const DeviceIcon: React.FC<{ type: DeviceType }> = ({ type }) => {
  const [src, setSrc] = useState('');
  
  useEffect(() => {
    // 懒加载图标
    import(`../assets/icons/${type}.svg`).then((module) => {
      setSrc(module.default);
    });
  }, [type]);
  
  return <img src={src} alt={type} />;
};
```

---

## 10. 测试要点

### 10.1 组件测试

| 测试项 | 测试内容 |
|--------|----------|
| DeviceCard | 渲染、开关切换 |
| ToggleSwitch | 状态切换 |
| BrightnessSlider | 值变化 |
| AgentInput | 消息发送 |

### 10.2 集成测试

| 测试项 | 测试内容 |
|--------|----------|
| 窗口拖拽 | 移动正常 |
| 主题切换 | 样式更新 |
| 透明度调节 | 窗口透明度变化 |

### 10.3 E2E 测试

| 测试项 | 测试内容 |
|--------|----------|
| 完整流程 | 启动→加载设备→控制→查看状态 |

---

## 11. 附录

### 11.1 设备图标映射

| 设备类型 | 图标 |
|----------|------|
| Light | 💡 |
| Switch | 🔌 |
| Socket | 🔋 |
| Curtain | 🪟 |
| AirConditioner | ❄️ |
| Sensor | 📡 |
| Gateway | 🏠 |

---

**文档结束**
