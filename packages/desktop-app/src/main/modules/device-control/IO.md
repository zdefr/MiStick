# Device Control Module IO

本文档描述 `M02 设备控制模块` 当前代码层的输入输出边界。

## 模块职责

- 接收 renderer 发起的设备状态读取与控制请求
- 根据设备能力选择可用的云控动作
- 将控制结果和最新状态统一转换成共享模型
- 屏蔽 `mijia-api` 等底层细节

## 进程内输入输出

### `DeviceControlService.execute(command)`

- 输入：`DeviceCommandRequest`
- 输出：`Promise<DeviceCommandResult>`
- 说明：当前首期仅正式支持 `turnOn`、`turnOff`、`toggle`

### `DeviceControlService.getStatus(deviceId)`

- 输入：设备 ID
- 输出：`Promise<DeviceStatusSnapshot>`
- 说明：当前首期优先读取云端状态；若设备不支持统一开关状态，则返回 `power = undefined`

## 外部依赖输入输出

### Device Capability Port

- 输入：设备 ID
- 输出：`MiHomeDeviceCapability`
- 当前实现：`CachedDeviceCapabilityPort`
- 数据来源：`DeviceCachePort.getDevices()`

### Cloud Control Port

- 输入：
  - `GET /api/cloud/status?deviceId=...`
  - `POST /api/cloud/control`
- 输出：
  - `DeviceStatusSnapshot`
  - `DeviceCommandResult`
- 当前实现：`HttpCloudControlPort`

## IPC 边界

### `device:getStatus`

- 输入：`{ deviceId: string }`
- 输出：`DeviceStatusSnapshot`

### `device:control`

- 输入：`DeviceCommandRequest`
- 输出：`DeviceCommandResult`
- 支持动作：
  - `turnOn`
  - `turnOff`
  - `toggle`
  - `refresh`

## 当前边界

- 不负责设备同步，设备元数据由 `M01 Device Sync` 提供
- 不直接维护登录状态，由 `MiHome Session` 负责
- 不直接决定 UI 呈现，renderer 只消费统一共享模型
- 当前 M02 仅以云控为正式执行路径，不再把本地回退纳入首期实现范围
