# Device Sync Module IO

## 模块职责

- 从 MiHome Bridge Service 同步家庭、房间、设备基础信息
- 归一化设备结构，输出 renderer 和控制模块可直接消费的数据
- 在本地缓存设备列表
- 维护本地别名体系，并按 `改过的云端名 > 本地别名 > 原名` 规则生成展示名

## 进程内输入

- `DeviceSyncService.syncFromCloud()`
  - 输入：无
  - 输出：同步后的 `MiHomeDeviceSummary[]`
- `DeviceSyncService.getCachedDevices()`
  - 输入：无
  - 输出：应用过本地别名规则后的缓存设备列表
- `DeviceSyncService.setAlias(deviceId, alias)`
  - 输入：
    - `deviceId: string`
    - `alias: string | null`
  - 输出：更新别名后的完整设备列表

## 外部依赖

### Device Cloud Sync Port

- 输入：`homes / rooms / devices` HTTP 请求
- 输出：云端原始家庭、房间、设备数据

### Device Cache Port

- 输入：归一化后的设备列表
- 输出：本地缓存读写结果

### Device Alias Port

- 输入：
  - 当前设备列表
  - 本地别名配置
- 输出：
  - `Record<deviceId, DeviceAliasRecord>`
  - 自动灌入的首版 seed alias

## 关键字段

- `name`
  - 当前最终展示名
- `originalName`
  - 云端原始设备名
- `aliasName`
  - 本地别名命中时的别名值
- `nameSource`
  - `cloud | alias`

## IPC

- `device:getAll`
- `device:syncFromCloud`
- `device:setAlias`

## 当前边界

- 不负责设备控制下发
- 不负责扫码登录流程
- 不直接把 bridge 原始响应暴露给 renderer
