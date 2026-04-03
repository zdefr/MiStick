# MiStick 一期阶段总结与二期接手说明

本文档基于当前仓库实际代码状态整理，唯一有效仓库根目录为 `D:\code\MiStick`。

后续二期开发、问题排查、设计回收，都应以这套代码为准。

`G:`、`H:` 等目录中的历史仓库只可视为备份，不应继续作为开发基线。

## 一期结论

- 一期已经不是“文档阶段”，而是已经落地了可运行的桌面端和本地桥接服务。
- 当前主链路已经打通：
  - 米家扫码登录
  - 登录态复用
  - 云端同步家庭、房间、设备
  - 本地缓存设备列表
  - 云端读取设备状态
  - 云端控制设备
  - Electron 便利贴式桌面展示
- 用户最关心的两类设备已经具备稳定可演示能力：
  - 空气净化器：开关、模式切换、环境指标展示
  - 电源插座：开关、功率展示
- 一期可以视为“主链路完成、重点设备可用、可继续演进”，但不能视为“架构已完全收敛”或“测试已完备”。

## 当前仓库结构

- `packages/desktop-app`
  - Electron + React + TypeScript 桌面端
- `packages/mihome-bridge-service`
  - FastAPI + `mijia-api` 本地桥接服务
- `demo/mijia-api-spike`
  - 早期 `mijia-api` 验证脚本
- `demo/xiaomi-oauth-implicit`
  - 早期小米 OAuth 验证 demo，目前不是主链路
- `docs/`
  - 需求、设计、调研、可行性等文档
- `test-case/`
  - 以文档形式存在的测试用例，不是自动化测试代码

## 当前技术架构

- 正式的一期方案是“桌面端 + 本地 bridge service + `mijia-api`”。
- 当前正式控制路线是“纯云控”。
- 本地控制仍有占位接口和配置字段，但当前仓库里没有真正可用的本地回退实现。

架构链路如下：

- `renderer -> preload -> ipc -> main service -> bridge service -> mijia-api`

桌面端关键入口：

- `packages/desktop-app/src/main/index.ts`
- `packages/desktop-app/src/renderer/App.tsx`

桥接服务关键入口：

- `packages/mihome-bridge-service/app/main.py`
- `packages/mihome-bridge-service/app/bridge_service.py`

## 模块现状

### 1. Electron 工程骨架

当前状态：已完成并可正常开发、构建、联调。

现状说明：

- 已拆成 `main / preload / renderer / shared` 四层。
- 根目录脚本可直接使用：
  - `pnpm dev`
  - `pnpm build`
  - `pnpm typecheck`
- `packages/desktop-app/package.json` 中已完成 Electron、Vite、tsup、preload 的基本开发链路配置。
- 应用名固定为 `mijia-sticky`。
- 已实现旧 `Electron` userData 目录向 `mijia-sticky` 目录的迁移兼容。

### 2. M04 配置管理模块

当前状态：已实现，并且已经是桌面端的基础设施模块。

核心文件：

- `packages/desktop-app/src/main/modules/config/config-service.ts`
- `packages/desktop-app/src/shared/config/types.ts`
- `packages/desktop-app/src/shared/config/schema.ts`
- `packages/desktop-app/src/shared/config/defaults.ts`

已实现能力：

- `config.json` 读写
- Zod 配置校验
- 配置损坏时从备份恢复
- 原子写入和串行持久化
- 按路径读取和写入配置
- 窗口位置、尺寸、置顶、透明度持久化
- 兼容历史 `miHome.token` 的加解密处理

当前承载的主要配置项：

- 米家账号元信息
- bridge 服务地址与超时
- 窗口尺寸、位置、置顶、透明度
- 外观配置
- 自动同步开关与间隔
- 设备别名

真实限制：

- `services.localControl` 仍保留在配置模型里，但不是一期正式能力。
- 令牌处理仍使用历史兼容方案，不是基于 Electron `safeStorage` 的正式新方案。

### 3. M01 登录与会话模块

当前状态：已打通并可长期复用。

桌面端核心文件：

- `packages/desktop-app/src/main/modules/mihome-session/mihome-session-service.ts`
- `packages/desktop-app/src/main/modules/mihome-session/http-mihome-bridge-auth-port.ts`
- `packages/desktop-app/src/main/modules/mihome-session/config-session-port.ts`

桥接服务接口：

- `GET /health`
- `GET /api/auth/session`
- `POST /api/auth/login/start`
- `POST /api/auth/login/poll`
- `POST /api/auth/logout`

已实现能力：

- 生成扫码登录任务
- 桌面端展示二维码
- 轮询扫码结果
- 会话状态读取
- 注销登录
- 将登录结果回写到本地配置

真实限制：

- 仍依赖 `mijia-api` 的扫码登录实现。
- 登录轮询任务保存在 bridge 进程内存里，不支持 bridge 重启后的任务恢复。
- 当前正式路线不走小米开放平台 OAuth。

### 4. M01 设备同步模块

当前状态：已实现云端同步、本地缓存、房间映射和图标透传。

核心文件：

- `packages/desktop-app/src/main/modules/device-sync/device-sync-service.ts`
- `packages/desktop-app/src/main/modules/device-sync/http-device-cloud-sync-port.ts`
- `packages/desktop-app/src/main/modules/device-sync/file-device-cache-port.ts`
- `packages/desktop-app/src/main/modules/device-sync/config-device-alias-port.ts`

已实现能力：

- 从 bridge 拉取 homes、rooms、devices
- 归一化为 `MiHomeDeviceSummary`
- 将设备列表缓存到本地 JSON
- 设备图标 URL 透传给 renderer
- 设备别名 seed 应用
- 设备别名本地持久化

房间处理现状：

- 不是单纯相信设备对象自带的 `room_id`
- bridge 会优先根据 `home.roomlist[].dids` 反推 `did -> room`
- 这一点已经修过，解决了“所有设备都显示未分配房间”的问题

缓存路径：

- `%APPDATA%/mijia-sticky/cache/devices.json`

别名体系现状：

- 后端和 IPC 已支持 `device:setAlias`
- 同步阶段会自动 seed 一批本地别名候选
- 当前 seed 数据在 `packages/desktop-app/src/shared/mihome/device-name.ts`
- 这套能力已可用，但该文件本身存在中文编码污染，后续需要清理

真实限制：

- 当前 renderer 主界面不是以“别名编辑”作为重点交互，二期如要强化个性化管理，应重做专门入口。
- 同步请求超时已经放宽到较长时间，但仍受 bridge 端能力探测和图标抓取速度影响。

### 5. M02 设备控制模块

当前状态：已实现正式可用的云控链路。

核心文件：

- `packages/desktop-app/src/main/modules/device-control/device-control-service.ts`
- `packages/desktop-app/src/main/modules/device-control/http-cloud-control-port.ts`
- `packages/desktop-app/src/main/modules/device-control/cached-device-capability-port.ts`
- `packages/mihome-bridge-service/app/bridge_service.py`

IPC 已暴露：

- `device:getStatus`
- `device:control`

已支持动作：

- `toggle`
- `turnOn`
- `turnOff`
- `refresh`
- `setModeAuto`
- `setModeSleep`
- `setModeFavorite`

真实现状说明：

- 正式可用路线是云控。
- `supportsLocalControl`、`localContext`、`NoopLocalControlPort` 仍存在，但只是占位。
- `DeviceControlService` 的代码里仍保留“云控失败后尝试 local”的结构，但当前 local 实现是空壳，不应被视为一期能力。

### 6. bridge service

当前状态：已经不是薄代理，而是项目里的核心业务适配层。

核心文件：

- `packages/mihome-bridge-service/app/main.py`
- `packages/mihome-bridge-service/app/bridge_service.py`
- `packages/mihome-bridge-service/app/models.py`
- `packages/mihome-bridge-service/app/settings.py`

当前承载的职责：

- 登录任务管理
- 会话状态透出
- 家庭、房间、设备同步
- 房间归属修正
- 设备云控能力探测
- 设备图标抓取与缓存
- 设备状态抽取
- 云控指令下发

设备图标现状：

- 设备图标不是直接由 `mijia-api` 设备列表接口返回。
- bridge 会额外抓取 `https://home.miot-spec.com/s/{model}` 页面源码。
- 从页面嵌入数据里解析 `icon_real`。
- 抓取成功后缓存到 `packages/mihome-bridge-service/.runtime/device-icon-cache/`
- 当前缓存 TTL 为 7 天。

真实限制：

- 这条图标链路是 HTML 页面解析，不是稳定公开 API。
- 如果小米产品页结构变更，图标解析会失效。
- bridge 中仍有少量中文乱码字符串，需要后续统一修复编码。

### 7. M03 UI 展示模块

当前状态：已完成一期可用 UI，不是纯原型。

核心文件：

- `packages/desktop-app/src/renderer/App.tsx`
- `packages/desktop-app/src/renderer/styles.css`

当前已实现界面：

- 已登录态便利贴主界面
- 未登录态空列表页面
- 二维码登录弹窗
- 设置侧滑面板
- 底部拖动手柄

已登录态主界面已具备：

- 顶部房间 tabs
- 右上角同步、置顶、设置
- 中部设备栅格
- 底部账号与退出登录

未登录态已具备：

- 空态提示
- 扫码登录入口
- 退出程序入口

设置面板已具备：

- 置顶
- 背景透明度
- 交互透明度
- 跳过任务栏
- 重置窗口位置
- 外观主题
- 字号
- 自动同步开关与间隔
- 退出登录
- 退出程序

真实限制：

- 当前 renderer 逻辑仍高度集中在单个 `App.tsx` 中。
- UI 虽已可用，但设备卡片扩展逻辑、轮询逻辑、设置逻辑还没有模块化。
- 如果二期继续扩更多设备类型，必须做 card registry 或组件化拆分。

## 已完成的重点设备支持

### 空气净化器

当前状态：一期里完成度最高的专属设备卡之一。

已支持能力：

- 开关
- 模式切换
  - 自动
  - 睡眠
  - 最爱
- 状态展示
  - 温度
  - 湿度
  - 空气质量标签
  - PM2.5 数值

桥接层读取字段：

- `mode`
- `temperature`
- `relative-humidity`
- `air-quality`
- `pm2.5-density`

前端表现：

- 使用专属卡片布局
- 占用双倍高度栅格
- 模式切换按钮和环境指标块已内嵌到卡片

刷新策略：

- 空气净化器已纳入高频状态轮询策略
- 当前刷新周期为 20 秒
- 仅对当前可见设备生效

### 电源插座

当前状态：已完成开关与功率展示。

已支持能力：

- 开关
- 状态读取
- 开启状态下的功率显示

桥接层读取字段优先级：

- `electric-power`
- `power-value`
- `power`

前端表现：

- 非空调插座卡片支持展示功率
- 功率值按阈值分级着色
  - `< 200W` 绿色
  - `200W - 1399W` 黄色
  - `>= 1400W` 红色

刷新策略：

- 当前正在展示功率的插座也纳入 20 秒状态轮询

## 运行时数据与本地文件

桌面端 userData 目录：

- `%APPDATA%/mijia-sticky`

重点运行时文件：

- `config.json`
- `backups/`
- `cache/devices.json`
- `mihome-auth.json`
- `legacy-token.key`

bridge 运行时目录默认在：

- `packages/mihome-bridge-service/.runtime`

重点运行时文件：

- `auth.json`
- `session-meta.json`
- `device-icon-cache/`

这些文件包含认证态和缓存数据，后续二期开发要注意不要把它们当成源码的一部分。

## 当前验证方式

当前已经持续使用的验证手段：

- `pnpm --filter @mijia/desktop-app typecheck`
- `pnpm --filter @mijia/desktop-app build`
- `python -m compileall packages/mihome-bridge-service/app`
- 手工联调
  - 扫码登录
  - 同步设备
  - 空气净化器模式切换
  - 空气净化器指标轮询
  - 插座开关与功率变化

真实情况：

- 仓库里目前没有真正落地的自动化单测。
- 仓库里目前没有 E2E 回归脚本。
- `test-case/` 目录现在仍然主要是文档资产。

## 当前明确存在的技术债

### 1. 文档与源码存在编码污染

现状：

- `AGENTS.md` 旧版内容失真
- `README`、部分文档、部分源码字符串存在乱码
- `packages/desktop-app/src/shared/mihome/device-name.ts` 已确认存在中文乱码
- `packages/mihome-bridge-service/README.md` 也存在乱码

影响：

- 不影响主功能运行
- 但严重影响二期维护效率和判断准确性

建议：

- 二期尽早统一 UTF-8 清理

### 2. renderer 过于集中

现状：

- 设备卡片
- 登录流程 UI
- 设置面板
- 状态轮询
- 设备专属渲染

都集中在 `packages/desktop-app/src/renderer/App.tsx`

影响：

- 新增设备支持会持续放大复杂度
- UI 细节改动容易互相干扰

建议：

- 二期优先拆成页面骨架、设备卡片注册表、设备专属卡片组件、轮询 hooks、设置面板组件

### 3. local control 仍是占位结构

现状：

- `NoopLocalControlPort`
- `supportsLocalControl`
- `services.localControl`

都还保留在模型和结构里

影响：

- 会误导后续维护者以为一期具备本地回退能力

建议：

- 二期明确二选一
- 要么真正实现
- 要么彻底从结构和配置里清理

### 4. 对非官方依赖的脆弱性

现状：

- 登录、同步、控制依赖 `mijia-api`
- 设备图标依赖 `home.miot-spec.com/s/{model}` 页面解析

影响：

- 上游结构变化会直接影响本项目

建议：

- 二期补强异常处理、缓存容错、降级策略、观测信息

### 5. 配置安全体系仍未升级

现状：

- 当前 `miHome.token` 仍使用历史兼容加解密方案
- 不是正式的系统级安全存储实现

建议：

- 二期如果继续强化桌面端持久化，应评估迁移到 Electron `safeStorage` 或等效方案

## 二期接手建议

建议优先顺序如下：

### 1. 先做源码和文档清理

- 统一编码
- 回收失真文档
- 让 `AGENTS.md`、`HLD`、`docs/` 与实际代码重新对齐

### 2. 再做 renderer 模块化

- 设备卡片注册机制
- 专属卡片组件拆分
- 设置面板拆分
- 轮询策略抽象

### 3. 然后扩更多设备类型

当前最适合作为模板复用的是：

- 空气净化器
- 电源插座

后续扩设备时，建议遵循：

- bridge 先抽状态
- shared 再定义统一状态模型
- renderer 最后接专属卡片

### 4. 再补自动化测试与观测能力

- shared/service 层单测
- bridge 接口级测试
- renderer 关键交互 smoke test
- 日志与排障面板

## 当前最重要的事实

- 一期已经完成，不再是设计草稿。
- 当前系统真正可运行的核心是两套程序：
  - `packages/desktop-app`
  - `packages/mihome-bridge-service`
- 当前正式路线是云控，不是本地回退。
- 空气净化器和电源插座已经是成熟样板，可以作为二期扩设备的参考实现。
- 项目仍有明显技术债，但不是“推倒重来”的状态，而是“在现有可用成果之上继续重构和扩展”的状态。
