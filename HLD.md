# 米家桌面便利贴 - 概要设计文档 (HLD)

## 1. 文档信息

| 项目 | 内容 |
|------|------|
| 产品名称 | 米家桌面便利贴 (Mijia Desktop Sticky) |
| 版本 | v1.2 |
| 文档类型 | 概要设计 (High-Level Design) |
| 关联 PRD | [PRD.md](./PRD.md) |
| 更新日期 | 2026-03-21 |

---

## 2. 引言

### 2.1 编写目的

本文档用于明确米家桌面便利贴首期版本的实现边界、系统架构、模块职责和关键接口，作为详细设计和开发落地的基线文档。

### 2.2 当前范围

当前版本仅覆盖以下内容：
- 米家扫码登录与登录态保持
- 从米家云端同步家庭、房间和设备信息
- 便利贴形态的设备展示与基础控制
- 本地配置、缓存与日志能力

当前版本明确不包含：
- OpenClaw 智能控制
- 批处理脚本管理
- 自然语言交互

### 2.3 当前技术路线结论

- 首期不再依赖小米官方个人开发者接入能力。
- `mijia-api` 已通过本仓库 demo 验证：可完成扫码登录、会话复用、设备同步和基础云端控制。
- `python-miio` 保留为本地控制补充路线，用于局域网低延迟控制或云控不可用时的回退。
- 首期默认控制策略为“云端优先，本地回退”。

### 2.4 术语定义

| 术语 | 定义 |
|------|------|
| HLD | High-Level Design，概要设计 |
| LLD | Low-Level Design，详细设计 |
| IPC | Electron 主进程与渲染进程之间的进程间通信 |
| MiHome Bridge Service | 基于 `mijia-api` 的 Python/FastAPI 服务，负责扫码登录、会话复用、云端同步与云端控制 |
| Local Control Service | 基于 `python-miio` 的 Python/FastAPI 服务，负责局域网设备控制与状态查询 |
| Control Capability | 设备的可控能力描述，包含云控、本地控制及推荐路由 |

---

## 3. 系统概述

### 3.1 系统目标

构建一个运行在 Windows 桌面上的轻量级米家设备控制工具，具备：
1. **扫码登录与会话复用** - 首次扫码登录，后续自动复用认证信息
2. **云端设备同步能力** - 从米家云端同步家庭、房间和设备清单并缓存到本地
3. **基础设备控制能力** - 优先通过云端控制已支持设备，必要时回退到本地控制
4. **便利贴形态 UI** - 桌面常驻、可置顶、拖拽、透明度可调

### 3.2 用户特征

- 拥有米家智能家居设备的 Windows 用户
- 希望在桌面快速查看和控制设备
- 接受首期版本以设备快捷控制为核心，不引入复杂自动化能力

### 3.3 设计约束与依赖

| 依赖项 | 说明 |
|--------|------|
| Electron 28 + React 18 + TypeScript | 桌面端主技术栈 |
| MiHome Bridge Service | 负责扫码登录、认证复用、设备同步与云控 |
| Local Control Service | 负责 `python-miio` 本地控制能力 |
| SQLite + JSON 文件 | 本地缓存、日志与配置持久化 |

### 3.4 范围约束

- M01 负责扫码登录、认证状态复用、云端设备同步与缓存。
- M02 负责控制路由决策，优先云控，必要时回退本地控制。
- M04 不直接管理 `mijia-api` 认证文件内容，只管理配置和认证文件路径元数据。
- OpenClaw 相关模块不进入当前开发计划，也不进入当前 HLD 的接口和 UI 设计。

---

## 4. 系统架构

### 4.1 整体架构图

```text
┌────────────────────────────────────────────────────────────────────┐
│                         Windows 桌面应用                           │
│                  Electron + React + TypeScript                     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Renderer (UI)                            │  │
│  │  - 扫码登录   - 设备列表   - 设备卡片   - 设置面板           │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
│                                 │ IPC                              │
│  ┌──────────────────────────────▼───────────────────────────────┐  │
│  │                      Main Process                            │  │
│  │  - 窗口管理   - 配置管理   - 设备管理   - 控制路由协调        │  │
│  └───────────────┬──────────────────────────┬───────────────────┘  │
│                  │                          │                      │
│                  ▼                          ▼                      │
│        ┌──────────────────┐        ┌──────────────────┐           │
│        │ MiHome Bridge    │        │ Local Control    │           │
│        │ Python/HTTP      │        │ Python/HTTP      │           │
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
| 表现层 | Renderer UI | 扫码登录、设备展示、用户交互、设置 |
| 应用层 | Electron Main | IPC 聚合、窗口管理、业务编排、控制路由 |
| 集成层 | MiHome Bridge Adapter | 扫码登录、会话管理、设备云端同步、云端控制 |
| 集成层 | Local Control Adapter | 本地状态查询、本地控制指令执行 |
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
| 云端桥接 | Python + FastAPI + `mijia-api` | 扫码登录、会话复用、设备同步、云控 |
| 本地控制 | Python + FastAPI + `python-miio` | 本地局域网控制补充能力 |

### 4.4 部署架构

```text
Windows Host
├── Electron App
│   ├── Main Process
│   ├── Preload
│   └── Renderer Process
├── AppData
│   ├── config.json
│   ├── devices.db
│   ├── logs.db
│   └── mihome-auth.json
├── MiHome Bridge Service
│   └── FastAPI + mijia-api
└── Local Control Service (optional)
    └── FastAPI + python-miio
```

---

## 5. 模块划分

### 5.1 模块总览

| 模块编号 | 模块名称 | 优先级 | 说明 |
|----------|----------|--------|------|
| M01 | 设备管理模块 | P0 | 扫码登录、会话复用、云端同步、设备缓存 |
| M02 | 设备控制模块 | P0 | 云控优先、本地回退的状态查询与控制 |
| M03 | UI 展示模块 | P0 | 便利贴窗口、扫码登录弹窗、设备卡片、设置界面 |
| M04 | 配置管理模块 | P0 | 配置读写、认证路径元数据、备份恢复 |
| M07 | 日志服务模块 | P1 | 应用日志与控制日志 |

### 5.2 模块关系

```text
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
│MiHome Bridge │   │本地控制适配层  │   │本地持久化层  │
└──────────────┘   └────────────────┘   └──────────────┘
```

### 5.3 模块职责简述

#### M01 - 设备管理模块
- 发起二维码登录
- 轮询登录结果并复用认证状态
- 同步家庭、房间和设备元数据
- 为 UI 与 M02 提供统一设备模型

#### M02 - 设备控制模块
- 查询设备状态
- 按能力与优先级选择云控或本地控制路径
- 下发控制指令
- 处理控制结果与错误反馈

#### M03 - UI 展示模块
- 管理便利贴窗口与交互
- 渲染二维码登录、设备卡片和分组列表
- 展示登录态和同步状态
- 提供设置入口

#### M04 - 配置管理模块
- 管理配置文件读写
- 管理认证文件路径与服务配置
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
| `auth:startQrLogin` | R→M | 启动二维码登录 |
| `auth:pollQrLogin` | R→M | 轮询二维码登录状态 |
| `auth:logout` | R→M | 清理登录态 |
| `device:getAll` | R→M | 获取本地缓存设备列表 |
| `device:syncFromCloud` | R→M | 从云端刷新设备列表 |
| `device:control` | R→M | 控制设备 |
| `device:getStatus` | R→M | 查询设备状态 |
| `config:get` | R→M | 获取配置项 |
| `config:set` | R→M | 更新配置项 |

### 6.2 外部接口抽象

#### 6.2.1 MiHome Bridge Service

| 能力 | 输入 | 输出 |
|------|------|------|
| `startQrLogin` | region | loginTicket, qrCodeData |
| `pollQrLogin` | loginTicket | pending / success / expired |
| `getHomes` | session | Home[] |
| `getRooms` | session, homeId | Room[] |
| `getDevices` | session, homeId | CloudDevice[] |
| `control` | cloudContext, action, payload | CommandResult |
| `getStatus` | cloudContext | DeviceStatus |

#### 6.2.2 Local Control Service

| 能力 | 输入 | 输出 |
|------|------|------|
| `getStatus` | deviceId, localContext | DeviceStatus |
| `control` | deviceId, action, payload, localContext | CommandResult |
| `healthCheck` | - | boolean |

### 6.3 接口约束

- M01 同步返回的是“统一设备元数据 + 能力描述”，不要求所有设备都具备完整本地控制上下文。
- M02 默认优先走云端控制；仅当设备明确支持本地控制且云控不可用或不适配时，才回退到本地控制。
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
  controlCapability: {
    cloud: boolean;
    local: boolean;
    preferred: 'cloud' | 'local' | 'none';
  };
  controlContext?: {
    cloud?: {
      did: string;
      props?: Record<string, { siid: number; piid: number }>;
      actions?: Record<string, { siid: number; aiid: number }>;
    };
    local?: {
      ip?: string;
      token?: string;
      protocol?: string;
    };
  };
  status?: DeviceStatus;
  syncedAt: string;
}

interface DeviceStatus {
  power?: boolean;
  brightness?: number;
  colorTemp?: number;
  online?: boolean;
  lastUpdate: string;
}

interface UserConfig {
  version: string;
  miHome: {
    provider: 'mijia-api';
    accountId?: string;
    authStoragePath: string;
    region: 'cn' | 'de' | 'us';
    lastLoginAt?: string;
  };
  services: {
    mihomeBridge: {
      baseUrl: string;
      timeoutMs: number;
    };
    localControl: {
      enabled: boolean;
      baseUrl: string;
      timeoutMs: number;
    };
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
| 米家认证文件 | JSON 文件 | `%APPDATA%/mijia-sticky/mihome-auth.json` |
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
  control_capability TEXT NOT NULL,
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
| 单次控制响应 | 云控正常情况下 < 3 秒，本地控制 < 2 秒 |
| 安全性 | 配置可编辑，认证文件与敏感登录态不明文外露 |
| 可维护性 | 云端桥接与本地控制通过适配层解耦 |
| 可扩展性 | 后续可追加更多控制适配器或替换桥接实现 |

---

## 9. 开发计划

| 阶段 | 内容 | 周期 | 交付 |
|------|------|------|------|
| Phase 1 | 工程脚手架 + M04 配置管理 | 1 周 | 可启动桌面应用、可读写配置 |
| Phase 2 | M01 扫码登录与云端同步 | 1.5 周 | 可扫码登录、复用会话、同步设备列表 |
| Phase 3 | M02 云控优先的基础控制 | 1.5 周 | 开关/亮度控制可用 |
| Phase 4 | M02 本地回退能力 + M03 UI 完善 | 1.5 周 | 云控失败时可回退到本地控制 |
| Phase 5 | M07 日志服务 | 0.5 周 | 关键操作日志可查询 |

**总计：** 6 周左右

### 9.1 建议实施顺序

当前建议按下面的顺序推进，这样能最快形成可运行闭环，并把最高风险前置暴露：

1. 先做工程骨架和 M04
   - 搭 `packages/desktop-app`
   - 确认 Electron 窗口、preload、IPC 白名单、基础状态管理
   - 落 `config.json`、默认配置、备份恢复、服务地址配置
   - 先把 mihomeBridge / localControl 的 URL、超时和 `authStoragePath` 固定下来

2. 再做 MiHome Bridge Service 与 M01 最小闭环
   - 搭 `packages/mihome-bridge-service`
   - 先实现 `startQrLogin`、`pollQrLogin`、会话复用、获取 `homes/devices`
   - Electron 侧先跑通“扫码登录 -> 同步设备 -> 写 SQLite 缓存”
   - 这个阶段先不追求所有设备都能控制，只追求登录和同步可靠

3. 接着做 M03 的最小可用界面
   - 先实现扫码登录弹窗、同步按钮、设备列表空态/加载态/错误态
   - 用真实 M01 数据把首屏跑通
   - 先不做复杂细节，只保证“能登录、能看到设备”

4. 然后做 M02 的云控主链路
   - 先接 MiHome Bridge 的云端控制接口
   - 优先覆盖灯、插座、开关三类设备
   - 先实现 `turnOn` / `turnOff` / `setBrightness`
   - 这个阶段目标是“至少一批真实设备能被成功控制”

5. 最后补 M02 的本地回退与 M07
   - 搭 `packages/local-control-service`
   - 接入 `python-miio` 做本地回退与状态查询
   - 补日志、错误追踪、服务健康检查和配置联动

### 9.2 首期代码落地结构

首期代码按“桌面壳 / 模块服务 / 共享契约”三层落地，当前建议目录如下：

```text
packages/
└── desktop-app/
    └── src/
        ├── main/
        │   ├── ipc/
        │   ├── modules/
        │   │   ├── config/
        │   │   ├── mihome-session/
        │   │   ├── device-sync/
        │   │   └── device-control/
        │   └── window/
        ├── preload/
        ├── renderer/
        └── shared/
            ├── config/
            ├── contracts/
            └── mihome/
```

当前约束如下：

- `shared/` 只放跨进程共享的类型、Schema 和 IPC 契约，不放 Electron 运行时代码。
- `main/modules/*` 每个模块都单独维护 `IO.md`，明确文件输入输出、进程内输入输出和 IPC 边界。
- `renderer/` 不直接拼装桥接层请求，只消费 preload 暴露的白名单 API。
- `main/ipc/` 只做通道注册和参数校验，不直接承载业务逻辑。
- 桥接服务接入时优先实现各模块的 `Port` 接口，避免 `mijia-api` 或 `python-miio` 细节泄漏到 UI 与业务编排层。
### 9.3 里程碑定义

| 里程碑 | 通过标准 |
|--------|----------|
| Milestone A | 应用能启动，配置可读写，窗口行为正常 |
| Milestone B | 可以扫码登录，并在重启后复用登录态 |
| Milestone C | 可以同步家庭/房间/设备，并在 UI 中展示 |
| Milestone D | 至少一类真实设备可以通过云控成功开关 |
| Milestone E | 云控失败时，部分设备可通过本地回退继续控制 |

### 9.4 当前建议的首个开发模块

如果现在立刻开工，我建议先做 `M04 配置管理模块`，但不是孤立地做，而是和工程骨架一起做。

原因：
- 它是所有后续模块的公共前置条件，尤其是服务地址、认证文件路径、刷新策略都会依赖它。
- 风险低，适合先把项目结构、类型定义、IPC 约定、文件落盘路径统一下来。
- 做完 M04 之后，M01 和 M02 都能直接接入，不会反复返工配置模型。

做完 M04 后，下一跳就直接进入 `MiHome Bridge Service + M01`，不要先去做复杂 UI，也不要先做本地回退。

---

## 10. 风险与应对

| 风险 | 说明 | 应对 |
|------|------|------|
| `mijia-api` 稳定性变化 | 登录与同步能力依赖社区实现与米家接口变化 | 通过桥接服务封装并保留版本锁定、回归脚本 |
| `mijia-api` 许可证风险 | GPL-3.0 对正式产品集成有影响 | 首期继续验证，正式发布前完成许可证决策 |
| 设备能力映射不完整 | 某些设备只能同步，不能直接控制 | 允许展示但降级为不可控 |
| 本地控制覆盖率有限 | 并非所有设备都支持 `python-miio` | 仅将其作为补充和回退方案 |
| 配置与认证文件损坏 | 用户可手工编辑配置，认证文件可能失效 | 增加配置校验、认证重登和自动备份 |

---

## 11. 文档修订历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-03-17 | - | 初始版本 |
| v1.1 | 2026-03-21 | - | 移除 OpenClaw 范围，明确首期为米家登录/云端同步/基础控制 |
| v1.2 | 2026-03-21 | - | 基于 `mijia-api` 验证结果，收束为“云控优先、本地回退”路线 |

---

**文档结束**


