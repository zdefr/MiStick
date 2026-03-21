# 米家桌面便利贴 - 概要设计文档 (HLD)

## 1. 文档信息

| 项目 | 内容 |
|------|------|
| 产品名称 | 米家桌面便利贴 (Mijia Desktop Sticky) |
| 版本 | v1.1 |
| 文档类型 | 概要设计 (High-Level Design) |
| 关联 PRD | [PRD.md](./PRD.md) |
| 更新日期 | 2026-03-21 |

---

## 2. 引言

### 2.1 编写目的

本文档用于明确米家桌面便利贴首期版本的实现边界、系统架构、模块职责和关键接口，作为详细设计和开发落地的基线文档。

### 2.2 当前范围

当前版本仅覆盖以下内容：
- 米家账号登录与登录态保持
- 从米家云端同步设备列表与房间信息
- 便利贴形态的设备展示与基础控制
- 本地配置、缓存与日志能力

当前版本明确不包含：
- OpenClaw 智能控制
- 批处理脚本管理
- 自然语言交互

### 2.3 术语定义

| 术语 | 定义 |
|------|------|
| HLD | High-Level Design，概要设计 |
| LLD | Low-Level Design，详细设计 |
| IPC | Electron 主进程与渲染进程之间的进程间通信 |
| Control Context | 设备控制所需的上下文信息，如 IP、Token、协议类型等 |

---

## 3. 系统概述

### 3.1 系统目标

构建一个运行在 Windows 桌面上的轻量级米家设备控制工具，具备：
1. **米家账号登录与登录态保持** - 用户登录后可复用会话
2. **云端设备同步能力** - 从米家云端同步设备清单并缓存到本地
3. **基础设备控制能力** - 对开关类和调节类设备提供快捷控制入口
4. **便利贴形态 UI** - 桌面常驻、可置顶、拖拽、透明度可调

### 3.2 用户特征

- 拥有米家智能家居设备的 Windows 用户
- 希望在桌面快速查看和控制设备
- 接受首期版本以设备快捷控制为核心，不引入复杂自动化能力

### 3.3 设计约束与依赖

| 依赖项 | 说明 |
|--------|------|
| Electron 28 + React 18 + TypeScript | 桌面端主技术栈 |
| 米家账号体系 | 登录、登录态保持、云端设备同步 |
| 本地设备控制适配层 | 为 M02 提供设备状态查询与控制能力 |
| SQLite + JSON 文件 | 本地缓存、日志与配置持久化 |

### 3.4 范围约束

- M01 负责“账号登录后的云端设备同步与缓存”，不承担自动化能力。
- M02 负责设备控制，控制所需 `Control Context` 可由缓存数据或后续适配层补充，不要求 M01 在首期完成所有控制上下文发现逻辑。
- OpenClaw 相关模块不进入当前开发计划，也不进入当前 HLD 的接口和 UI 设计。

---

## 4. 系统架构

### 4.1 整体架构图

```
┌────────────────────────────────────────────────────────────────────┐
│                         Windows 桌面应用                           │
│                  Electron + React + TypeScript                     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Renderer (UI)                            │  │
│  │  - 登录入口   - 设备列表   - 设备卡片   - 设置面板           │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
│                                 │ IPC                              │
│  ┌──────────────────────────────▼───────────────────────────────┐  │
│  │                      Main Process                            │  │
│  │  - 窗口管理   - 配置管理   - 设备管理   - 设备控制协调        │  │
│  └───────────────┬──────────────────────────┬───────────────────┘  │
│                  │                          │                      │
│                  ▼                          ▼                      │
│        ┌──────────────────┐        ┌──────────────────┐           │
│        │ 云端同步适配层   │        │ 本地控制适配层   │           │
│        │ MiHome Cloud     │        │ Python/HTTP      │           │
│        └────────┬─────────┘        └────────┬─────────┘           │
│                 │                           │                     │
└─────────────────┼───────────────────────────┼─────────────────────┘
                  │                           │
                  ▼                           ▼
        ┌──────────────────┐        ┌──────────────────┐
        │ 米家云端服务     │        │ 米家设备 / 网关  │
        └──────────────────┘        └──────────────────┘
```

### 4.2 分层说明

| 层级 | 组件 | 职责 |
|------|------|------|
| 表现层 | Renderer UI | 登录、设备展示、用户交互、设置 |
| 应用层 | Electron Main | IPC 聚合、窗口管理、业务编排 |
| 集成层 | Cloud Sync Adapter | 米家登录、会话管理、设备云端同步 |
| 集成层 | Device Control Adapter | 设备状态查询、控制指令执行 |
| 持久化层 | Config / SQLite / Logs | 配置、设备缓存、日志 |

### 4.3 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 桌面框架 | Electron 28 | Windows 桌面应用容器 |
| 前端 | React 18 + TypeScript | UI 与交互 |
| 状态管理 | Zustand | 轻量状态管理 |
| 构建工具 | Vite + electron-builder | 构建与打包 |
| 配置存储 | JSON 文件 | 用户可读可改的配置 |
| 缓存/日志 | SQLite | 设备缓存、日志索引 |
| 设备控制适配 | Python + FastAPI | 为 M02 提供本地控制接口 |

### 4.4 部署架构

```
Windows Host
├── Electron App
│   ├── Main Process
│   ├── Preload
│   └── Renderer Process
├── AppData
│   ├── config.json
│   ├── devices.db
│   └── logs.db
└── Local Device Control Service (optional process)
    └── FastAPI + control adapter
```

---

## 5. 模块划分

### 5.1 模块总览

| 模块编号 | 模块名称 | 优先级 | 说明 |
|----------|----------|--------|------|
| M01 | 设备管理模块 | P0 | 米家登录态复用、云端同步、设备缓存 |
| M02 | 设备控制模块 | P0 | 设备状态查询、开关与调节控制 |
| M03 | UI 展示模块 | P0 | 便利贴窗口、设备卡片、设置界面 |
| M04 | 配置管理模块 | P0 | 配置读写、Token 加密、备份恢复 |
| M07 | 日志服务模块 | P1 | 应用日志与控制日志 |

### 5.2 模块关系

```
                    ┌─────────────┐
                    │  UI 展示模块 │
                    │    M03      │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌────────────────┐ ┌───────────────┐ ┌──────────────┐
│ 设备管理模块   │ │ 设备控制模块  │ │配置管理模块  │
│    M01         │ │    M02        │ │    M04       │
└───────┬────────┘ └───────┬───────┘ └──────┬───────┘
        │                  │                 │
        ▼                  ▼                 ▼
┌──────────────┐   ┌────────────────┐   ┌──────────────┐
│米家云同步层  │   │本地控制适配层  │   │本地持久化层  │
└──────────────┘   └────────────────┘   └──────────────┘
```

### 5.3 模块职责简述

#### M01 - 设备管理模块
- 读取米家登录态
- 发起云端同步
- 维护设备和房间缓存
- 为 UI 提供设备元数据

#### M02 - 设备控制模块
- 查询设备状态
- 下发控制指令
- 处理控制结果与错误反馈
- 管理控制适配器调用

#### M03 - UI 展示模块
- 管理便利贴窗口与交互
- 渲染设备卡片和分组列表
- 展示登录态和同步状态
- 提供设置入口

#### M04 - 配置管理模块
- 管理配置文件读写
- 对登录 Token 进行加密存储
- 管理配置备份与恢复
- 为其他模块提供配置访问接口

#### M07 - 日志服务模块
- 记录应用日志与控制日志
- 支持错误追踪与导出

---

## 6. 接口设计

### 6.1 内部接口 (Renderer ↔ Main)

| 接口名 | 方向 | 说明 |
|--------|------|------|
| `auth:login` | R→M | 米家账号登录 |
| `auth:logout` | R→M | 清理登录态 |
| `device:getAll` | R→M | 获取本地缓存设备列表 |
| `device:syncFromCloud` | R→M | 从云端刷新设备列表 |
| `device:control` | R→M | 控制设备 |
| `device:getStatus` | R→M | 查询设备状态 |
| `config:get` | R→M | 获取配置项 |
| `config:set` | R→M | 更新配置项 |

### 6.2 外部接口抽象

#### 6.2.1 米家云同步适配层

当前 HLD 只定义能力抽象，不在此文档中固化具体 HTTP 端点：

| 能力 | 输入 | 输出 |
|------|------|------|
| `login` | 账号、密码 / 登录凭证 | 会话信息 |
| `getHomes` | 会话信息 | 家庭列表 |
| `getDevices` | 会话信息、家庭 ID | 设备列表 |
| `getRooms` | 会话信息、家庭 ID | 房间列表 |
| `refreshSession` | 当前会话 | 新会话 / 刷新结果 |

#### 6.2.2 本地控制适配层

| 能力 | 输入 | 输出 |
|------|------|------|
| `getStatus` | deviceId, controlContext | 设备状态 |
| `control` | deviceId, action, payload, controlContext | 控制结果 |
| `batchControl` | commands[] | 批量控制结果 |

### 6.3 接口约束

- 云端同步返回的是“设备元数据”，不要求首期同时返回完整控制上下文。
- 控制上下文允许为空；当某设备暂无控制条件时，UI 应展示为“可见但不可控”或“仅展示状态”。
- 具体第三方接口签名由适配层实现细化，不直接在 HLD 中写死。

---

## 7. 数据设计

### 7.1 核心实体

```typescript
interface Device {
  id: string;
  name: string;
  model: string;
  type: string;
  homeId: string;
  roomId?: string;
  roomName?: string;
  online?: boolean;
  isControllable: boolean;
  controlContext?: {
    ip?: string;
    token?: string;
    protocol?: string;
  };
  status?: DeviceStatus;
  syncedAt: string;
}

interface DeviceStatus {
  power?: boolean;
  brightness?: number;
  colorTemp?: number;
  lastUpdate: string;
}

interface UserConfig {
  version: string;
  miHome: {
    accountId?: string;
    token?: string;
    tokenExpiry?: string;
    region: 'cn' | 'de' | 'us';
  };
  window: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    alwaysOnTop: boolean;
    opacity: number;
    skipTaskbar: boolean;
  };
}
```

### 7.2 存储方案

| 数据类型 | 存储方式 | 位置 |
|----------|----------|------|
| 用户配置 | JSON 文件 | `%APPDATA%/mijia-sticky/config.json` |
| 设备缓存 | SQLite | `%APPDATA%/mijia-sticky/devices.db` |
| 日志数据 | SQLite | `%APPDATA%/mijia-sticky/logs.db` |

### 7.3 设备缓存表结构

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  type TEXT NOT NULL,
  home_id TEXT NOT NULL,
  room_id TEXT,
  room_name TEXT,
  online INTEGER,
  is_controllable INTEGER NOT NULL DEFAULT 0,
  control_context TEXT,
  status TEXT,
  synced_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_devices_home_id ON devices(home_id);
CREATE INDEX idx_devices_room_id ON devices(room_id);
CREATE INDEX idx_devices_type ON devices(type);
```

---

## 8. 非功能设计

| 项目 | 目标 |
|------|------|
| 单次设备同步 | 正常情况下 < 5 秒 |
| 单次控制响应 | 正常情况下 < 2 秒 |
| 安全性 | Token 加密存储，配置文件保留用户可编辑性 |
| 可维护性 | 云端同步与本地控制通过适配层解耦 |
| 可扩展性 | 后续可追加更多控制适配器 |

---

## 9. 开发计划

| 阶段 | 内容 | 周期 | 交付 |
|------|------|------|------|
| Phase 1 | 工程脚手架 + M04 配置管理 | 1 周 | 可启动桌面应用、可读写配置 |
| Phase 2 | M01 米家登录与云端同步 | 1.5 周 | 可登录并同步设备列表 |
| Phase 3 | M02 基础设备控制 | 1.5 周 | 开关/亮度/色温控制可用 |
| Phase 4 | M03 便利贴 UI 完善 | 1 周 | 可置顶、拖拽、设置面板 |
| Phase 5 | M07 日志服务 | 0.5 周 | 关键操作日志可查询 |

**总计：** 5.5 周左右

---

## 10. 风险与应对

| 风险 | 说明 | 应对 |
|------|------|------|
| 米家云接入不稳定 | 登录与同步能力依赖外部服务 | 通过适配层封装并保留重试/刷新机制 |
| 控制上下文不完整 | 某些设备只有元数据，没有直接控制条件 | 允许设备展示但控制能力降级 |
| 配置损坏 | 用户可手工编辑配置文件 | 增加配置校验与自动备份 |
| 本地服务不可用 | 控制适配层未启动或异常 | UI 展示错误状态并允许重试 |

---

## 11. 文档修订历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-03-17 | - | 初始版本 |
| v1.1 | 2026-03-21 | - | 移除 OpenClaw 范围，明确首期为米家登录/云端同步/基础控制 |

---

**文档结束**
