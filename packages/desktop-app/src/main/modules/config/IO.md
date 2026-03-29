# Config Module IO

本文档描述 `M04 配置管理模块` 当前代码层的输入输出边界。

## 模块职责

- 读取并校验 `config.json`
- 保存配置补丁
- 维护配置备份
- 暴露给 IPC 的读取/写入接口
- 兼容历史 `miHome.token` 字段的加解密
- 持久化窗口尺寸、位置与置顶状态等运行时状态

## 文件输入

### `config.json`

- 路径：`%APPDATA%/mijia-sticky/config.json`
- 输入类型：UTF-8 JSON 文本
- 读取时序：
  - 应用启动
  - 渲染层调用 `config:load`
  - 首次创建窗口前

### `backups/*.json`

- 路径：`%APPDATA%/mijia-sticky/backups/`
- 用途：配置写入前的历史快照

### `legacy-token.key`

- 路径：`%APPDATA%/mijia-sticky/legacy-token.key`
- 用途：仅用于历史 `miHome.token` 字段的兼容加解密

## 文件输出

### `config.json`

- 写入来源：`ConfigService.save()` / `ConfigService.setByPath()` / 主进程窗口状态同步
- 输出格式：格式化后的 UTF-8 JSON
- 输出约束：
  - 非敏感字段保持明文
  - 若存在 `miHome.token`，保存时会被加密
  - `window.width` / `window.height` / `window.x` / `window.y` 会在窗口移动或缩放后自动刷新
  - `window.alwaysOnTop` 会在双击顶部手柄切换置顶时自动刷新
  - `updatedAt` 每次写入都会刷新

### `backups/*.json`

- 写入来源：正式覆盖 `config.json` 之前
- 输出内容：当前配置原文快照

## 进程内输入输出

### 主进程输入

- `ConfigService.load()`
  - 输入：无
  - 输出：`Promise<AppConfig>`
- `ConfigService.save(patch?)`
  - 输入：`Partial<AppConfig>`
  - 输出：`Promise<AppConfig>`
- `ConfigService.getByPath(key)`
  - 输入：点路径字符串
  - 输出：路径对应值
- `ConfigService.setByPath(key, value)`
  - 输入：点路径字符串 + 值
  - 输出：更新后的 `AppConfig`

### IPC 输入输出

- `config:load`
  - 输入：无
  - 输出：`AppConfig`
- `config:get`
  - 输入：`{ key: string }`
  - 输出：目标字段值
- `config:set`
  - 输入：`{ key: string, value: unknown }`
  - 输出：更新后的 `AppConfig`
- `config:save`
  - 输入：`{ patch?: Partial<AppConfig> }`
  - 输出：更新后的 `AppConfig`

## 当前边界

- 不直接解析 `mihome-auth.json` 内容
- 不管理 M01/M02 的业务逻辑
- 不包含 OpenClaw 或脚本配置