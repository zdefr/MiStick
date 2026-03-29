# MiHome Bridge Service

基于 `FastAPI + mijia-api` 的本地桥接服务，用于承接 M01 的米家扫码登录、会话复用、家庭/房间/设备云端同步能力。

## 当前能力

- `GET /health`
- `GET /api/auth/session`
- `POST /api/auth/login/start`
- `POST /api/auth/login/poll`
- `POST /api/auth/logout`
- `GET /api/cloud/homes`
- `GET /api/cloud/rooms?homeId=...`
- `GET /api/cloud/devices?homeId=...`
- `GET /api/cloud/sync`
- `GET /api/cloud/status?deviceId=...`
- `POST /api/cloud/control`

## 运行方式

```powershell
cd packages/mihome-bridge-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8790 --reload
```

## 运行时目录

默认运行时目录为：

- `packages/mihome-bridge-service/.runtime`

可通过环境变量覆盖：

- `MIHOME_BRIDGE_RUNTIME_DIR`
- `MIHOME_BRIDGE_AUTH_PATH`

## 当前限制

- 首期只实现扫码登录，不支持账号密码登录。
- 登录二维码通过 data URL 返回给桌面端展示。
- 登录轮询状态通过服务内存任务管理，不做跨进程任务恢复。
- 设备缓存仍在 desktop 侧处理，桥接服务当前只负责云端调用与结构透出。
