# Codex app-server + DeepSeek

## 链路与范围

浏览器 `public/app.js` → Node `src/server.js` → `src/codex-chat.js` → `src/client.js` → 真实 `codex app-server` 子进程 → DeepSeek `/responses`。

DeepSeek 原生支持 Responses，无需 Chat Completions 转换代理。使用官方 Codex CLI 0.163.0（锁定 npm 依赖），不需要 OpenAI API Key 或 ChatGPT 登录。

本版实现文字聊天。每次 HTTP 请求使用独立临时目录、app-server 进程和 ephemeral thread，历史消息作为标明角色的 JSON 对话上下文发送。它不实现服务端持久线程恢复，也不伪装为跨请求复用同一 Codex thread。响应返回 `threadId`、`turnId` 和 `backend: codex-app-server` 便于验证实际路径。

关闭 shell、unified exec、文件图片查看、浏览器、插件和多代理功能；只读 sandbox、无命令网络权限，客户端不批准任何服务端审批请求。本版不是可执行任意任务的公开 agent 服务。密钥由专用子进程环境变量传入，不写入 CLI 参数或仓库。

## 本地运行

```bash
npm ci
cp .env.example .env
```

在 `.env` 中设置（不要提交该文件）：

```dotenv
CHAT_BACKEND=codex
AI_API_KEY=你的DeepSeek密钥
AI_MODEL=deepseek-flash
CHAT_ACCESS_TOKEN=你自己的应用访问口令
```

```bash
npm run smoke:deepseek
npm start
```

`smoke:deepseek` 会真实调用 DeepSeek，产生少量模型用量。成功后返回模型回复及真实 thread/turn ID。

浏览器访问 `http://localhost:3000`，输入 `CHAT_ACCESS_TOKEN` 后聊天。`/api/status` 的 `backend` 应为 `codex-app-server`。状态“已配置”不意味着模型调用已成功；以真实聊天回复为准。

`CHAT_BACKEND=direct` 保留原有直接调用路径。未设置此变量时默认 direct，避免已有部署隐式切换。Codex 模式固定使用 DeepSeek 官方 Responses 端点，仅 `AI_API_KEY`/`AI_MODEL` 生效；不使用旧版 OpenAI 密钥。

## Render 部署

仓库根目录 `render.yaml` 已将 Node 服务设为 `CHAT_BACKEND=codex`。在 Render 创建 Blueprint 并连接此仓库；填写 DeepSeek `AI_API_KEY`，访问口令由平台生成。`npm ci` 安装锁定的 Codex CLI，`npm start` 同时提供网页与后端，无需另配跨域。

不要把它部署到纯静态托管或 Workers：app-server 需要子进程。免费服务的休眠、内存和超时限制仍适用；这里每次请求最多等待 55 秒，最多并发 3 个请求。

现有 Sites 版本仍运行 `worker/handler.js` 的直接 API 路径，其加密密钥在 Sites R2 中，不会自动复制到 Render。新 Node 服务使用独立环境变量，网页配置页仅在 Sites 提供。通过新平台返回的 URL 访问 app-server 版本。

## 验证与限制

```bash
npm run check
npm run test:codex-chat
```

`test:codex-chat` 启动真实 Codex app-server，与本地模拟 Responses SSE 服务通信，验证请求鉴权、模型选择、turn 完成事件、回复和取消清理。它不是 DeepSeek 在线凭据验证。CI 也运行此测试，不发送付费请求。

`npm run smoke:codex` 保留原始初始化/模型目录/线程目录测试。

参考：[DeepSeek Codex 接入文档](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)、[Responses API](https://api-docs.deepseek.com/guides/responses_api/)。
