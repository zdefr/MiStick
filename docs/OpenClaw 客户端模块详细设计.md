# OpenClaw 客户端模块详细设计

## 1. 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | OpenClaw 客户端模块 (OpenClaw Client Module) |
| 模块编号 | M05 |
| 优先级 | P1 |
| 关联文档 | [HLD.md](../HLD.md) |

---

## 2. 模块概述

### 2.1 职责

OpenClaw 客户端模块负责与 WSL 中运行的 OpenClaw AI Agent 服务通信，发送自然语言指令，接收执行结果。

### 2.2 功能范围

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 服务连接 | 连接 OpenClaw 服务 | P0 |
| 状态检测 | 检测服务连接状态 | P0 |
| 指令发送 | 发送自然语言指令 | P0 |
| 结果接收 | 接收 Agent 响应 | P0 |
| 历史查询 | 查询执行历史 | P1 |
| WebSocket 订阅 | 订阅实时状态推送 | P1 |

### 2.3 依赖关系

```
┌─────────────────┐
│  UI 展示模块    │
│    (M03)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OpenClaw 客户端  │
│    (M05)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WSL OpenClaw   │
│   Service       │
└─────────────────┘
```

---

## 3. 类设计

### 3.1 类图

```
┌─────────────────────────────────────────────────────────┐
│                  OpenClawClient                         │
├─────────────────────────────────────────────────────────┤
│ - baseUrl: string                                       │
│ - apiToken: string | null                               │
│ - ws: WebSocket | null                                  │
│ - connected: boolean                                    │
│ - listeners: Map<string, Function[]>                    │
├─────────────────────────────────────────────────────────┤
│ + constructor(config: OpenClawConfig)                   │
│ + connect(): Promise<boolean>                           │
│ + disconnect(): void                                    │
│ + isConnected(): boolean                                │
│ + sendMessage(message: string): Promise<AgentResponse>  │
│ + getStatus(): Promise<AgentStatus>                     │
│ + getHistory(limit: number): Promise<ExecutionHistory[]>│
│ + subscribe(event: string, callback: Function): void    │
│ + unsubscribe(event: string, callback: Function): void  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  OpenClawConfig                         │
├─────────────────────────────────────────────────────────┤
│ - url: string                                           │
│ - token?: string                                        │
│ - autoConnect: boolean                                  │
│ - reconnectInterval: number                             │
│ - timeout: number                                       │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心类说明

#### 3.2.1 OpenClawClient

OpenClaw 客户端主类。

```typescript
class OpenClawClient {
  private baseUrl: string;
  private apiToken: string | null;
  private ws: WebSocket | null;
  private connected: boolean = false;
  private listeners: Map<string, Function[]> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  constructor(config: OpenClawConfig) {
    this.baseUrl = config.url;
    this.apiToken = config.token || null;
    
    if (config.autoConnect) {
      this.connect();
    }
  }
  
  /**
   * 连接到 OpenClaw 服务
   */
  async connect(): Promise<boolean> {
    try {
      // 测试 HTTP 连接
      const response = await fetch(`${this.baseUrl}/api/status`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      this.connected = true;
      this.emit('connected', { url: this.baseUrl });
      
      // 建立 WebSocket 连接
      this.connectWebSocket();
      
      return true;
    } catch (error) {
      this.connected = false;
      this.emit('disconnected', { error: error.message });
      return false;
    }
  }
  
  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
  }
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected;
  }
  
  /**
   * 发送消息给 Agent
   */
  async sendMessage(message: string): Promise<AgentResponse> {
    if (!this.connected) {
      await this.connect();
    }
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        session_id: this.getSessionId(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data as AgentResponse;
  }
  
  /**
   * 获取 Agent 状态
   */
  async getStatus(): Promise<AgentStatus> {
    const response = await fetch(`${this.baseUrl}/api/status`, {
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  }
  
  /**
   * 获取执行历史
   */
  async getHistory(limit: number = 20): Promise<ExecutionHistory[]> {
    const response = await fetch(
      `${this.baseUrl}/api/history?limit=${limit}`,
      {
        headers: this.getAuthHeaders(),
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  }
  
  /**
   * 订阅事件
   */
  subscribe(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }
  
  /**
   * 取消订阅
   */
  unsubscribe(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
  
  /**
   * 建立 WebSocket 连接
   */
  private connectWebSocket(): void {
    const wsUrl = this.baseUrl.replace('http', 'ws') + '/api/ws';
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.emit('ws:connected');
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit(data.event, data.payload);
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket closed, reconnecting...');
      this.emit('ws:disconnected');
      this.scheduleReconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('ws:error', error);
    };
  }
  
  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }
    
    this.reconnectTimer = setInterval(async () => {
      const success = await this.connect();
      if (success) {
        clearInterval(this.reconnectTimer!);
        this.reconnectTimer = null;
      }
    }, 5000);  // 5 秒重连一次
  }
  
  /**
   * 获取认证头
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }
    return headers;
  }
  
  /**
   * 获取/创建会话 ID
   */
  private getSessionId(): string {
    let sessionId = localStorage.getItem('openclaw_session_id');
    if (!sessionId) {
      sessionId = generateUUID();
      localStorage.setItem('openclaw_session_id', sessionId);
    }
    return sessionId;
  }
  
  /**
   * 触发事件监听器
   */
  private emit(event: string, payload?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(payload));
    }
  }
}
```

### 3.3 数据结构

#### 3.3.1 AgentResponse

```typescript
interface AgentResponse {
  reply: string;              // Agent 回复文本
  tool_called?: string;       // 调用的工具名称
  tool_args?: Record<string, any>; // 工具参数
  status: 'success' | 'failed' | 'pending';
  session_id: string;         // 会话 ID
  timestamp: Date;
}
```

#### 3.3.2 AgentStatus

```typescript
interface AgentStatus {
  online: boolean;            // 是否在线
  model: string;              // 使用的模型
  version: string;            // OpenClaw 版本
  tools_registered: number;   // 已注册工具数
  busy: boolean;              // 是否忙碌
  last_activity?: Date;       // 最后活动时间
}
```

#### 3.3.3 ExecutionHistory

```typescript
interface ExecutionHistory {
  id: string;
  message: string;            // 用户消息
  response: string;           // Agent 回复
  tool_called?: string;       // 调用的工具
  status: 'success' | 'failed';
  timestamp: Date;
  duration_ms?: number;       // 执行耗时
}
```

---

## 4. 接口设计

### 4.1 OpenClaw API

#### 4.1.1 发送消息

```http
POST /api/chat
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "message": "执行回家模式",
  "session_id": "uuid-xxx"
}

Response:
{
  "reply": "回家模式执行完成",
  "tool_called": "home_mode",
  "tool_args": {},
  "status": "success",
  "session_id": "uuid-xxx",
  "timestamp": "2026-03-17T10:30:00Z"
}
```

#### 4.1.2 获取状态

```http
GET /api/status
Authorization: Bearer {token}

Response:
{
  "online": true,
  "model": "gpt-3.5-turbo",
  "version": "1.0.0",
  "tools_registered": 5,
  "busy": false,
  "last_activity": "2026-03-17T10:30:00Z"
}
```

#### 4.1.3 获取历史

```http
GET /api/history?limit=20
Authorization: Bearer {token}

Response:
[
  {
    "id": "hist_001",
    "message": "执行回家模式",
    "response": "回家模式执行完成",
    "tool_called": "home_mode",
    "status": "success",
    "timestamp": "2026-03-17T10:30:00Z",
    "duration_ms": 1500
  }
]
```

#### 4.1.4 WebSocket 推送

```javascript
// 连接 WebSocket
ws://localhost:8000/api/ws

// 推送消息格式
{
  "event": "tool:executing",
  "payload": {
    "tool": "home_mode",
    "status": "running"
  }
}

// 事件类型
- connected        // 连接成功
- disconnected     // 连接断开
- tool:executing   // 工具执行中
- tool:completed   // 工具执行完成
- tool:failed      // 工具执行失败
- message:new      // 新消息
```

---

## 5. 流程设计

### 5.1 连接流程

```
┌─────────┐    ┌──────────────┐    ┌─────────────┐
│ 应用启动 │    │OpenClawClient│    │OpenClaw 服务│
└────┬────┘    └──────┬───────┘    └──────┬──────┘
     │                │                   │
     │ autoConnect    │                   │
     │───────────────>│                   │
     │                │                   │
     │                │ GET /api/status   │
     │                │──────────────────>│
     │                │                   │
     │                │<──────────────────│
     │                │ 200 OK            │
     │                │                   │
     │                │ WebSocket 连接    │
     │                │──────────────────>│
     │                │                   │
     │<───────────────│                   │
     │ connected      │                   │
     │                │                   │
```

### 5.2 消息发送流程

```
┌─────────┐    ┌──────────────┐    ┌─────────────┐
│  用户   │    │OpenClawClient│    │OpenClaw 服务│
└────┬────┘    └──────┬───────┘    └──────┬──────┘
     │                │                   │
     │ 输入指令       │                   │
     │───────────────>│                   │
     │                │                   │
     │                │ POST /api/chat    │
     │                │──────────────────>│
     │                │                   │
     │                │                   │ 解析意图
     │                │                   │
     │                │                   │ 调用工具
     │                │                   │
     │                │<──────────────────│
     │                │ response          │
     │                │                   │
     │<───────────────│                   │
     │ 显示结果       │                   │
     │                │                   │
```

### 5.3 WebSocket 事件推送流程

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│OpenClaw 服务│    │OpenClawClient│    │   UI 界面    │
└──────┬──────┘    └──────┬───────┘    └──────┬──────┘
       │                 │                   │
       │ 工具执行开始    │                   │
       │ WS push         │                   │
       │────────────────>│                   │
       │                 │ emit              │
       │                 │──────────────────>│
       │                 │ 显示"执行中..."   │
       │                 │                   │
       │ 工具执行完成    │                   │
       │ WS push         │                   │
       │────────────────>│                   │
       │                 │ emit              │
       │                 │──────────────────>│
       │                 │ 显示执行结果      │
       │                 │                   │
```

---

## 6. 事件设计

### 6.1 事件类型

| 事件名 | 触发时机 |  payload |
|--------|----------|----------|
| connected | 连接成功 | { url: string } |
| disconnected | 连接断开 | { error?: string } |
| ws:connected | WebSocket 连接成功 | - |
| ws:disconnected | WebSocket 断开 | - |
| ws:error | WebSocket 错误 | { error: Error } |
| tool:executing | 工具开始执行 | { tool: string, args: any } |
| tool:completed | 工具执行完成 | { tool: string, result: any } |
| tool:failed | 工具执行失败 | { tool: string, error: string } |
| message:new | 收到新消息 | { message: string, from: 'user' | 'agent' } |

### 6.2 事件订阅示例

```typescript
// 订阅连接事件
client.subscribe('connected', () => {
  console.log('OpenClaw 已连接');
  updateConnectionStatus('connected');
});

client.subscribe('disconnected', ({ error }) => {
  console.log('OpenClaw 断开连接:', error);
  updateConnectionStatus('disconnected');
});

// 订阅工具执行事件
client.subscribe('tool:executing', ({ tool, args }) => {
  console.log(`正在执行 ${tool}...`, args);
  addLog(`正在执行 ${tool}...`);
});

client.subscribe('tool:completed', ({ tool, result }) => {
  console.log(`${tool} 执行完成`, result);
  addLog(`${tool} 执行完成`);
});

client.subscribe('tool:failed', ({ tool, error }) => {
  console.error(`${tool} 执行失败:`, error);
  addLog(`${tool} 执行失败：${error}`);
});
```

---

## 7. 异常处理

### 7.1 异常类型

| 异常 | 触发条件 | 处理方式 |
|------|----------|----------|
| ConnectionError | 无法连接服务 | 显示错误，尝试重连 |
| TimeoutError | 请求超时 | 重试 2 次，失败后提示 |
| AuthError | 认证失败 | 提示检查 Token |
| ServiceError | 服务端错误 | 显示错误信息 |

### 7.2 错误码定义

```typescript
enum OpenClawErrorCode {
  SUCCESS = 0,
  CONNECTION_ERROR = 5001,
  TIMEOUT = 5002,
  AUTH_ERROR = 5003,
  SERVICE_ERROR = 5004,
  TOOL_NOT_FOUND = 5005,
  EXECUTION_FAILED = 5006
}
```

### 7.3 重试机制

```typescript
async function sendWithRetry(
  message: string,
  maxRetries = 2
): Promise<AgentResponse> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.sendMessage(message);
    } catch (error) {
      if (error.code === OpenClawErrorCode.TIMEOUT) {
        if (i === maxRetries - 1) {
          throw error;
        }
        await sleep(1000 * (i + 1));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Unexpected error');
}
```

---

## 8. 配置设计

### 8.1 OpenClaw 配置

```typescript
interface OpenClawConfig {
  url: string;                // 服务地址
  token?: string;             // API Token
  autoConnect: boolean;       // 自动连接
  reconnectInterval: number;  // 重连间隔 (ms)
  timeout: number;            // 请求超时 (ms)
  wsEnabled: boolean;         // 启用 WebSocket
}

// 默认配置
const defaultConfig: OpenClawConfig = {
  url: 'http://localhost:8000',
  token: undefined,
  autoConnect: true,
  reconnectInterval: 5000,
  timeout: 10000,
  wsEnabled: true,
};
```

---

## 9. 测试要点

### 9.1 单元测试

| 测试项 | 测试内容 |
|--------|----------|
| connect | 连接服务 |
| disconnect | 断开连接 |
| sendMessage | 发送消息 |
| getStatus | 获取状态 |
| getHistory | 获取历史 |
| subscribe/unsubscribe | 事件订阅 |

### 9.2 集成测试

| 测试项 | 测试内容 |
|--------|----------|
| 连接→发送→接收 | 完整流程 |
| WebSocket 事件 | 实时推送 |
| 异常场景 | 断线重连 |

---

## 10. 附录

### 10.1 OpenClaw 工具注册示例

```yaml
# openclaw.yaml
tools:
  - name: home_mode
    description: 回家模式 - 开灯、开空调、开电视
    command: python C:\\mijia-scripts\\home_mode.py
    
  - name: sleep_mode
    description: 睡眠模式 - 关闭所有设备
    command: python C:\\mijia-scripts\\sleep_mode.py
    
  - name: away_mode
    description: 离家模式 - 关灯、关空调、启动监控
    command: python C:\\mijia-scripts\\away_mode.py
```

### 10.2 使用示例

```typescript
// 初始化客户端
const client = new OpenClawClient({
  url: 'http://localhost:8000',
  token: 'your-api-token',
  autoConnect: true,
});

// 订阅事件
client.subscribe('connected', () => {
  console.log('✅ OpenClaw 已连接');
});

client.subscribe('tool:completed', ({ tool, result }) => {
  console.log(`✅ ${tool} 执行完成`, result);
});

// 发送消息
async function executeHomeMode() {
  try {
    const response = await client.sendMessage('执行回家模式');
    console.log(response.reply);
  } catch (error) {
    console.error('执行失败:', error);
  }
}
```

---

**文档结束**
