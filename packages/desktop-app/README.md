# Desktop App

当前目录是首期桌面端工程骨架。

## 目录分层

- `src/main`
  - Electron 主进程
  - 窗口管理、IPC 注册、模块装配
- `src/preload`
  - 渲染进程可见的白名单桥接层
- `src/renderer`
  - React 渲染层
- `src/shared`
  - 主进程、preload、渲染层共享的类型与契约

## 当前已落模块

- 工程壳
- `M04` 配置管理模块

## 当前未落模块

- `M01` MiHome Bridge 接入
- `M02` 云控与本地回退
- `M03` 完整业务 UI
- `M07` 日志服务

## 运行命令

```bash
pnpm install
pnpm dev
```
