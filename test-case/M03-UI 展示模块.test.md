# UI 展示模块测试用例 (M03)

## 测试范围

UI 展示模块负责便利贴窗口的渲染、设备卡片展示、用户交互响应和窗口管理。

## 测试用例思维导图

```
UI 展示模块测试用例
├── 组件测试
│   ├── StickyWindow
│   │   ├── ✓ 渲染无边框窗口
│   │   ├── ✓ 应用 alwaysOnTop/opacity 配置
│   │   └── ✓ 响应拖拽移动
│   ├── DeviceCard
│   │   ├── ✓ 显示设备名称/状态/图标
│   │   ├── ✓ 点击开关切换状态
│   │   └── ✓ 展开面板显示亮度/色温滑块
│   ├── ToggleSwitch
│   │   ├── ✓ 点击切换 checked 状态
│   │   └── ✓ disabled 状态不可点击
│   ├── BrightnessSlider
│   │   ├── ✓ 拖拽改变亮度值
│   │   └── ✓ 防抖 (300ms) 后触发 onChangeComplete
│   └── AgentInput
│       ├── ✓ 输入消息并按 Enter 发送
│       └── ✓ 发送后清空输入框
│
├── 状态管理测试 (Zustand)
│   ├── deviceStore
│   │   ├── ✓ fetchDevices 加载设备列表
│   │   ├── ✓ updateDevice 更新设备状态
│   │   └── ✓ loading/error 状态管理
│   ├── configStore
│   │   └── ✓ updateSettings 更新配置
│   └── agentStore
│       ├── ✓ sendMessage 添加消息到列表
│       └── ✓ clearHistory 清空历史
│
├── 窗口管理测试
│   ├── ✓ 拖拽 TitleBar 移动窗口
│   ├── ✓ 点击最小化隐藏窗口
│   ├── ✓ 点击置顶切换 alwaysOnTop
│   └── ✓ 透明度调节实时更新
│
├── 主题测试
│   ├── ✓ 浅色主题应用正确 CSS 变量
│   └── ✓ 深色主题应用正确 CSS 变量
│
└── 性能测试
    ├── ✓ 50+ 设备列表使用虚拟滚动
    ├── ✓ 滑块拖拽 FPS > 50
    └── ✓ 启动时间 < 3 秒
```

## 详细测试用例

### 组件测试

| 测试 ID | 测试组件 | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|----------|--------|
| M03-001 | StickyWindow | 渲染无边框窗口 | 无 | 渲染 StickyWindow 组件 | 无边框，transparent=true | P0 |
| M03-002 | StickyWindow | 应用 alwaysOnTop 配置 | alwaysOnTop=true | 渲染组件 | 窗口置顶 | P0 |
| M03-003 | StickyWindow | 应用 opacity 配置 | opacity=0.8 | 渲染组件 | 窗口透明度 80% | P0 |
| M03-004 | StickyWindow | 响应拖拽移动 | 无 | 拖拽 TitleBar | 窗口跟随移动 | P0 |
| M03-005 | DeviceCard | 显示设备名称 | device.name='客厅灯' | 渲染 DeviceCard | 显示'客厅灯' | P0 |
| M03-006 | DeviceCard | 显示设备状态 | device.status.power=true | 渲染 DeviceCard | 显示 [●] 开 | P0 |
| M03-007 | DeviceCard | 显示设备图标 | device.type='light' | 渲染 DeviceCard | 显示💡图标 | P0 |
| M03-008 | DeviceCard | 点击开关切换状态 | 无 | 点击开关按钮 | 触发 onToggle 回调 | P0 |
| M03-009 | DeviceCard | 展开面板显示滑块 | 设备支持亮度 | 点击展开按钮 | 显示亮度滑块 | P1 |
| M03-010 | ToggleSwitch | 点击切换 checked 状态 | checked=false | 点击开关 | checked 变为 true | P0 |
| M03-011 | ToggleSwitch | disabled 状态不可点击 | disabled=true | 点击开关 | 无反应，不触发 onChange | P0 |
| M03-012 | BrightnessSlider | 拖拽改变亮度值 | value=50 | 拖拽滑块到 80 | 触发 onChange(80) | P0 |
| M03-013 | BrightnessSlider | 防抖后触发 onChangeComplete | 无 | 拖拽滑块后停止 | 300ms 后触发 onChangeComplete | P1 |
| M03-014 | AgentInput | 输入消息并按 Enter 发送 | 输入内容 | 按 Enter 键 | 触发 onSend 并清空输入框 | P1 |
| M03-015 | AgentInput | 发送后清空输入框 | 已输入内容 | 点击发送按钮 | 输入框清空 | P1 |

### 状态管理测试 (Zustand)

| 测试 ID | 测试 Store | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|------------|----------|----------|----------|----------|--------|
| M03-016 | deviceStore | fetchDevices 加载设备列表 | IPC 返回设备 | 调用 fetchDevices() | devices 数组更新 | P0 |
| M03-017 | deviceStore | updateDevice 更新设备状态 | 设备存在 | 调用 updateDevice(id, {power:true}) | 设备状态更新 | P0 |
| M03-018 | deviceStore | loading 状态管理 | 无 | 调用 fetchDevices() | loading=true→false | P0 |
| M03-019 | deviceStore | error 状态管理 | IPC 失败 | 调用 fetchDevices() | error 设置为错误信息 | P0 |
| M03-020 | configStore | updateSettings 更新配置 | 无 | 调用 updateSettings({theme:'dark'}) | theme 更新 | P0 |
| M03-021 | agentStore | sendMessage 添加消息 | 无 | 调用 sendMessage('hello') | messages 添加用户消息 | P1 |
| M03-022 | agentStore | clearHistory 清空历史 | 消息列表非空 | 调用 clearHistory() | messages 清空 | P1 |

### 窗口管理测试

| 测试 ID | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|--------|
| M03-023 | 拖拽 TitleBar 移动窗口 | 无 | 鼠标按下 TitleBar 并拖动 | 窗口跟随移动 | P0 |
| M03-024 | 点击最小化隐藏窗口 | 无 | 点击最小化按钮 | 窗口隐藏，显示托盘图标 | P0 |
| M03-025 | 点击置顶切换 alwaysOnTop | 无 | 点击置顶按钮 | alwaysOnTop 切换 | P0 |
| M03-026 | 透明度调节实时更新 | 无 | 拖动透明度滑块 | 窗口透明度实时变化 | P1 |

### 主题测试

| 测试 ID | 测试场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|--------|
| M03-027 | 浅色主题应用正确 CSS 变量 | theme='light' | 渲染应用 | CSS 变量为浅色值 | P0 |
| M03-028 | 深色主题应用正确 CSS 变量 | theme='dark' | 渲染应用 | CSS 变量为深色值 | P0 |
| M03-029 | 系统主题跟随 | theme='system' | 系统深色 | 渲染应用 | 应用深色主题 | P1 |

### 性能测试

| 测试 ID | 测试场景 | 性能指标 | 测试方法 | 预期结果 | 优先级 |
|---------|----------|----------|----------|----------|--------|
| M03-PERF-001 | 50+ 设备列表渲染 | 无卡顿 | 渲染 50 个设备卡片 | 使用虚拟滚动，FPS > 30 | P2 |
| M03-PERF-002 | 滑块拖拽流畅度 | FPS > 50 | 拖拽亮度滑块 | 平均 FPS > 50 | P1 |
| M03-PERF-003 | 启动时间 | < 3 秒 | 冷启动应用 | 首屏渲染 < 3 秒 | P0 |

## E2E 测试用例

| 测试 ID | 测试场景 | 测试步骤 | 预期结果 | 优先级 |
|---------|----------|----------|----------|--------|
| M03-E2E-001 | 完整流程：启动→加载→控制 | 1.启动应用 2.加载设备 3.点击开关 | 设备状态更新 | P0 |
| M03-E2E-002 | 主题切换完整流程 | 1.打开设置 2.切换主题 3.验证样式 | 主题切换成功 | P1 |
| M03-E2E-003 | 窗口设置完整流程 | 1.打开设置 2.修改透明度 3.验证效果 | 透明度更新 | P1 |

## 发现的问题

1. **虚拟列表必要性存疑** - MVP 场景下设备数量通常 < 20，虚拟列表增加复杂度
2. **图片懒加载不适用** - 设备图标为 SVG 内联，无需懒加载
3. **AgentInput 定位模糊** - v0.1 不做 OpenClaw 集成，但 UI 设计包含自然语言输入框

## 建议

1. 虚拟列表作为可选优化，当设备数量 > 30 时启用
2. 移除图片懒加载设计，使用内联 SVG 图标
3. v0.1 版本隐藏或禁用 AgentInput 组件
