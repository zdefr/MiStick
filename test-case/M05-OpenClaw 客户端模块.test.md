# OpenClaw 客户端模块测试用例 (M05)

## 测试范围

OpenClaw 客户端模块负责与 WSL 中运行的 OpenClaw AI Agent 服务通信，发送自然语言指令，接收执行结果。

**优先级：** P2 (v2.0 增强版功能)

## 测试用例思维导图

```
OpenClaw 客户端模块测试用例
├── OpenClawClient 类测试
│   ├── connect()
│   │   ├── ✓ HTTP 状态检测成功
│   │   ├── ✓ 服务不可用时返回 false
│   │   └── ✓ 成功后建立 WebSocket 连接
│   ├── disconnect()
│   │   ├── ✓ 关闭 WebSocket
│   │   └── ✓ 清除重连定时器
│   ├── sendMessage()
│   │   ├── ✓ 发送消息并接收回复
│   │   ├── ✓ 服务未连接时自动连接
│   │   └── ✓ 超时抛出 TimeoutError
│   ├── getStatus()
│   │   └── ✓ 返回 Agent 在线状态/模型信息
│   ├── getHistory()
│   │   └── ✓ 返回执行历史列表
│   └── WebSocket 测试
│       ├── ✓ 连接成功触发 ws:connected 事件
│       ├── ✓ 断开后自动重连 (5 秒间隔)
│       └── ✓ 接收推送消息并触发事件
│
├── 事件订阅测试
│   ├── subscribe()
│   │   └── ✓ 添加事件监听器
│   ├── unsubscribe()
│   │   └── ✓ 移除事件监听器
│   └── emit()
│       └── ✓ 触发所有监听器
│
├── 事件类型测试
│   ├── ✓ connected/disconnected
│   ├── ✓ tool:executing/completed/failed
│   └── ✓ message:new
│
└── IPC 接口测试
    ├── ✓ openclaw:sendMessage 发送指令
    ├── ✓ openclaw:getStatus 获取状态
    └── ✓ openclaw:getHistory 获取历史
```

## 详细测试用例

### OpenClawClient 类测试

| 测试 ID | 测试方法 | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|----------|--------|
| M05-001 | connect() | HTTP 状态检测成功 | 服务运行中 | 调用 connect() | 返回 true，connected=true | P0 |
| M05-002 | connect() | 服务不可用时返回 false | 服务未启动 | 调用 connect() | 返回 false，connected=false | P0 |
| M05-003 | connect() | 成功后建立 WebSocket 连接 | 服务运行中 | 调用 connect() | WebSocket 连接建立 | P0 |
| M05-004 | disconnect() | 关闭 WebSocket | 已连接 | 调用 disconnect() | WebSocket 关闭 | P0 |
| M05-005 | disconnect() | 清除重连定时器 | 重连中 | 调用 disconnect() | 定时器清除 | P0 |
| M05-006 | sendMessage() | 发送消息并接收回复 | 已连接 | 调用 sendMessage('hello') | 返回 AgentResponse | P0 |
| M05-007 | sendMessage() | 服务未连接时自动连接 | 未连接 | 调用 sendMessage() | 先连接再发送 | P0 |
| M05-008 | sendMessage() | 超时抛出 TimeoutError | 服务无响应 | 调用 sendMessage() | 抛出超时错误 | P0 |
| M05-009 | getStatus() | 返回 Agent 在线状态 | 服务运行中 | 调用 getStatus() | 返回 AgentStatus 对象 | P0 |
| M05-010 | getStatus() | 返回模型信息 | 服务运行中 | 调用 getStatus() | 包含 model 字段 | P1 |
| M05-011 | getHistory() | 返回执行历史列表 | 有历史记录 | 调用 getHistory(20) | 返回 20 条历史 | P1 |
| M05-012 | WebSocket | 连接成功触发 ws:connected | WebSocket 可用 | 连接 WebSocket | 触发 ws:connected 事件 | P1 |
| M05-013 | WebSocket | 断开后自动重连 | WebSocket 断开 | 等待自动重连 | 5 秒后尝试重连 | P1 |
| M05-014 | WebSocket | 接收推送消息并触发事件 | WebSocket 连接中 | 服务端推送消息 | 触发对应事件 | P1 |

### 事件订阅测试

| 测试 ID | 测试方法 | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|----------|--------|
| M05-015 | subscribe() | 添加事件监听器 | 无 | subscribe('connected', cb) | 监听器添加到列表 | P0 |
| M05-016 | unsubscribe() | 移除事件监听器 | 已订阅 | unsubscribe('connected', cb) | 监听器从列表移除 | P0 |
| M05-017 | emit() | 触发所有监听器 | 已订阅多个 | emit('connected', payload) | 所有回调被调用 | P0 |
| M05-018 | subscribe | 同一事件多个监听器 | 无 | 多次 subscribe 同一事件 | 所有回调都被触发 | P1 |

### 事件类型测试

| 测试 ID | 测试事件 | 触发时机 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|--------|
| M05-019 | connected | 连接成功 | 调用 connect() 成功 | 触发 connected 事件 | P0 |
| M05-020 | disconnected | 连接断开 | 服务停止 | 触发 disconnected 事件 | P0 |
| M05-021 | tool:executing | 工具开始执行 | Agent 调用工具 | 触发 tool:executing 事件 | P1 |
| M05-022 | tool:completed | 工具执行完成 | 工具执行成功 | 触发 tool:completed 事件 | P1 |
| M05-023 | tool:failed | 工具执行失败 | 工具执行失败 | 触发 tool:failed 事件 | P1 |
| M05-024 | message:new | 收到新消息 | Agent 回复消息 | 触发 message:new 事件 | P1 |

### IPC 接口测试

| 测试 ID | 测试方法 | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|----------|--------|
| M05-025 | openclaw:sendMessage | 发送指令 | 已连接 | invoke('openclaw:sendMessage', msg) | 返回 AgentResponse | P0 |
| M05-026 | openclaw:getStatus | 获取状态 | 服务运行中 | invoke('openclaw:getStatus') | 返回 AgentStatus | P0 |
| M05-027 | openclaw:getHistory | 获取历史 | 有历史记录 | invoke('openclaw:getHistory', 20) | 返回历史记录数组 | P1 |

## 异常场景测试

| 测试 ID | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|--------|
| M05-028 | 认证失败 (401) | Token 无效 | 调用 sendMessage() | 抛出 AuthError | P0 |
| M05-029 | 服务错误 (500) | 服务端异常 | 调用 sendMessage() | 抛出 ServiceError | P0 |
| M05-030 | 网络错误 | 网络断开 | 调用 connect() | 抛出 ConnectionError | P0 |
| M05-031 | WebSocket 连接失败 | WS 端口不可用 | 调用 connect() | 降级为 HTTP 轮询 | P2 |

## 性能测试用例

| 测试 ID | 测试场景 | 性能指标 | 测试方法 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|--------|
| M05-PERF-001 | 消息响应时间 | < 3 秒 | 发送消息并计时 | 响应时间 < 3 秒 | P1 |
| M05-PERF-002 | WebSocket 重连间隔 | 5 秒 | 断开后计时 | 5 秒后尝试重连 | P1 |
| M05-PERF-003 | 并发消息处理 | 无消息丢失 | 并发发送 10 条消息 | 所有消息都有响应 | P2 |

## 发现的问题

1. **WebSocket 依赖过强** - 设计强制依赖 WebSocket，但 OpenClaw 可能不支持 WS，应降级为 HTTP 轮询
2. **Session ID 存储位置不当** - 使用 `localStorage` 存储会话 ID，但 Electron 主进程无法访问 localStorage
3. **认证 Token 管理缺失** - Token 刷新/过期处理未设计

## 建议

1. 添加 WebSocket 不可用时的降级策略，使用 HTTP 轮询替代
2. Session ID 存储在配置文件中，由主进程管理
3. 补充 Token 刷新机制，Token 过期后自动重新认证
