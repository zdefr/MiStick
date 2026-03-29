# Device Sync Module IO

本文档描述 `M01` 中“设备同步子模块”的输入输出边界。

## 模块职责

- 从云端桥接层同步家庭、房间、设备数据
- 归一化设备模型
- 写入本地设备缓存
- 向 UI 和控制模块提供统一的设备查询结果

## 进程内输入

- `DeviceSyncService.syncFromCloud()`
  - 输入：无
  - 输出：归一化后的设备列表
- `DeviceSyncService.getCachedDevices()`
  - 输入：无
  - 输出：缓存设备列表

## 外部依赖输入输出

### Device Cloud Sync Port

- 输入：获取 homes / rooms / devices
- 输出：原始云端数据

### Device Cache Port

- 输入：归一化后的设备列表
- 输出：缓存读写结果

## IPC 预期

- `device:getAll`
- `device:syncFromCloud`

## 当前边界

- 不负责设备控制
- 不直接管理登录流程
- 不把桥接层原始响应直接暴露给 renderer