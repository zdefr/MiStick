# Windows 打包说明

当前仓库的 Windows 出包方案是：

- 先把 `packages/mihome-bridge-service` 用 `PyInstaller` 打成独立 exe
- 再由 `packages/desktop-app` 用 `electron-builder` 生成安装包
- 安装后的 Electron 主进程会自动拉起内置 bridge，不再要求用户本机额外安装 Python

## 前置条件

- Windows 10/11 x64
- Node.js 20+
- `pnpm`
- Python 3.13 或当前 bridge 使用的同版本 Python
- `packages/mihome-bridge-service/venv` 或 `.venv`

## 一键出包

在仓库根目录执行：

```powershell
pnpm install
pnpm dist:win
```

出包前建议先关闭开发态 Electron 窗口和 `pnpm dev`，避免 `release/win-unpacked` 被占用。

这条命令会依次完成：

1. 安装 bridge 的 Python 依赖和 `PyInstaller`
2. 生成 `packages/mihome-bridge-service/dist/mihome-bridge-service/`
3. 构建 Electron renderer / main / preload
4. 生成 Windows 安装包

## 产物位置

bridge 产物：

- `packages/mihome-bridge-service/dist/mihome-bridge-service/`

Electron 安装包：

- `packages/desktop-app/release/mijia-sticky-0.1.0-x64-setup.exe`

## 打包后运行方式

安装包启动后，桌面端会自动：

- 从 `resources/bridge/mihome-bridge-service.exe` 拉起内置 bridge
- 为 bridge 分配一个本机空闲端口
- 把 bridge 运行时目录指向 `%APPDATA%/mijia-sticky/bridge-runtime`
- 等待 `/health` 就绪后再初始化 Electron 主业务

所以打包版不再依赖固定的 `http://127.0.0.1:8790`。

## 运行时文件

桌面端用户数据仍在：

- `%APPDATA%/mijia-sticky`

内置 bridge 的运行时文件会放到：

- `%APPDATA%/mijia-sticky/bridge-runtime`

其中会包含：

- `auth.json`
- `session-meta.json`
- `device-icon-cache/`

## 单独构建 bridge

如果只想先验证 Python bridge 的 Windows 产物，可以执行：

```powershell
powershell -ExecutionPolicy Bypass -File packages/mihome-bridge-service/build-win.ps1
```

## 常见问题

如果 `pnpm dist:win` 在 bridge 阶段失败，优先检查：

- `packages/mihome-bridge-service/venv` 或 `.venv` 是否可用
- 当前 Python 版本是否和已安装依赖匹配
- `pip install -r packages/mihome-bridge-service/requirements.txt` 是否能成功

如果安装包启动时报“未找到内置 bridge 可执行文件”，通常说明：

- `build:bridge` 没有成功执行
- 或 `packages/mihome-bridge-service/dist/mihome-bridge-service/` 被清理了但没有重新出包

如果出包时报 `app.asar` 被占用，通常说明：

- 之前的开发态 Electron 还在运行
- 或上一次失败的打包残留了 `packages/desktop-app/release/win-unpacked`

这时先关闭桌面端进程，再清掉 `packages/desktop-app/release/` 后重试即可。
