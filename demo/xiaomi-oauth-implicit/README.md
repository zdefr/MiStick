# Xiaomi OAuth Implicit Demo

这个 demo 用来验证“小米账号 OAuth2 是否可用”，目标只有一个：
- 发起最小授权
- 在回调页直接打印小米返回的 `access_token`

## 为什么使用 Implicit Grant

根据小米官方 OAuth2 文档：
- `Implicit Grant` 适用于无服务端配合的手机/桌面客户端
- `access_token` 会直接回到 `redirect_uri` 的 URL fragment 中

这个 demo 只做“最小可用性验证”，所以选择 `Implicit Grant`，避免先引入 `client_secret` 和换 token 服务端。

官方参考：
- OAuth2 总览: https://dev.mi.com/docs/passport/oauth2/
- Implicit Grant: https://dev.mi.com/docs/passport/implicit/
- Scope 列表: https://dev.mi.com/docs/passport/scopes/

## 文件说明

- `server.js`: 本地零依赖静态文件服务
- `index.html`: 配置 App ID 并发起小米登录
- `callback.html`: 解析 URL fragment 并打印 `access_token`

## 使用步骤

1. 在小米开放平台注册应用，并启用账号 OAuth 能力。
2. 在应用配置里添加回调地址，例如：
   - `http://127.0.0.1:8787/callback.html`
3. 在本目录启动 demo:

```bash
node server.js
```

4. 浏览器打开：

```text
http://127.0.0.1:8787/
```

5. 在页面里输入：
- `App ID (client_id)`
- `redirect_uri`
- `scope`（可先留空，或填写你已获批的 scope）

6. 点击“使用小米账号登录”。
7. 授权成功后，浏览器会跳转到 `callback.html`，页面会直接打印：
- `access_token`
- `expires_in`
- `scope`
- `state`
- 完整 fragment

## 注意事项

- 这个 demo 仅用于验证授权链路，不适合生产环境。
- `Implicit Grant` 不适合正式长期登录态管理；真实项目更建议后续切到 `Authorization Code`。
- 页面会直接显示 `access_token`，仅供本地调试。
