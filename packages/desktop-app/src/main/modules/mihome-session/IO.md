# MiHome Session Module IO

本文档描述 `M01` 中“账号会话子模块”的输入输出边界。

## 模块职责

- 发起米家扫码登录
- 轮询登录状态
- 读取当前认证快照
- 清理登录态并更新本地配置元数据

## 进程内输入

- `MiHomeSessionService.startQrLogin(region)`
  - 输入：区域代码
  - 输出：二维码登录票据
- `MiHomeSessionService.pollQrLogin(ticketId)`
  - 输入：票据 ID
  - 输出：登录状态快照
- `MiHomeSessionService.getSession()`
  - 输入：无
  - 输出：当前会话快照
- `MiHomeSessionService.logout()`
  - 输入：无
  - 输出：清理后的会话快照

## 外部依赖输入输出

### MiHome Bridge Auth Port

- 输入：`startQrLogin(region)` / `pollQrLogin(ticketId)` / `logout()`
- 输出：桥接层标准化后的认证结果

### Config Service

- 输入：读取 `miHome.region`、`miHome.authStoragePath`
- 输出：更新 `miHome.accountId`、`miHome.lastLoginAt`

## IPC 预期

- `auth:startQrLogin`
- `auth:pollQrLogin`
- `auth:getSession`
- `auth:logout`

## 当前边界

- 不负责同步设备列表
- 不直接控制设备
- 不直接暴露 `mijia-api` 返回的原始字段给 renderer