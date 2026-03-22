# Device Control Module IO

本文档描述 `M02 设备控制模块` 当前代码层的输入输出边界。

## 模块职责

- 接收设备控制请求
- 根据设备能力选择云控或本地控制路由
- 返回控制结果与最新状态
- 在路由失败时决定是否执行回退

## 进程内输入

- `DeviceControlService.execute(command)`
  - 输入：统一控制命令
  - 输出：控制结果
- `DeviceControlService.getStatus(deviceId)`
  - 输入：设备 ID
  - 输出：设备状态快照

## 外部依赖输入输出

### Device Capability Port

- 输入：设备 ID
- 输出：设备能力描述

### Cloud Control Port

- 输入：云控命令
- 输出：控制结果 / 状态快照

### Local Control Port

- 输入：本地控制命令
- 输出：控制结果 / 状态快照

## IPC 预期

- `device:control`
- `device:getStatus`

## 当前边界

- 不负责同步设备元数据
- 不负责维护登录态
- 不直接决定 UI 呈现