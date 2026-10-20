# 知言 · AI 聊天应用

在原有 Codex app-server 测试项目中增加了网页应用，原协议客户端与测试保留。

## 启动聊天应用

```bash
npm ci
cp .env.example .env
# 在 .env 中填写 AI_API_KEY、AI_MODEL、CHAT_ACCESS_TOKEN
npm start
```

打开 `http://localhost:3000` 聊天；`http://localhost:3000/status` 查看运行状态。
无需配置密钥即可打开页面；真实聊天必须配置以上三项。访问口令由你自行设置，与模型 API 密钥不同，在聊天页输入。不要把 API 密钥放进网页或提交到 Git。

- 多轮聊天保留在当前页面内存，刷新、新建对话后清除，不写入浏览器存储。
- 使用兼容 Chat Completions 的文本接口，默认使用 DeepSeek 非思考模式。服务地址与模型由环境变量指定。
- 失败消息恢复到输入框，服务端超时 60 秒，单条最多 8000 字，一次最多 40 条。
- 服务端最多并发 3 次调用，每进程每分钟最多 20 次请求；多实例部署需要共享限流。
- `/api/status` 只证明服务在线。AI 已配置不代表有额度或调用成功；成功调用记录随进程重启清除。

## 发布到 Render

仓库已包含 `render.yaml`。在 Render 创建 Blueprint 并选择此仓库，填写 `AI_API_KEY` 和 `AI_MODEL`。平台生成 `CHAT_ACCESS_TOKEN`，从环境变量设置中获取后用于聊天页。应用读取平台提供的 `PORT`，监听 `0.0.0.0`。

也可以手动创建 Node Web Service：构建命令 `npm ci`，启动命令 `npm start`，健康检查路径 `/api/status`，Node 24。部署完成后使用平台返回的 HTTPS URL；仅在工作区启动不代表已经发布。

免费服务存在休眠及额度限制，模型调用费用另计。当前没有真实模型凭据，测试使用模拟响应；上线前应发送一条真实消息验证。托管配置本身不意味着已经完成部署。

API 契约参考：[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。

## 验证

```bash
npm run check
```

包括原协议测试和网页接口测试（鉴权、配置状态、消息校验、大小限制、模型错误与超时）。

---

# Codex app-server 测试项目

使用 Node.js 通过 **stdio / 换行分隔的 JSON-RPC 消息**连接真实的 `codex app-server`，可作为自建客户端的最小起点。项目没有第三方 npm 依赖。

## 环境要求

- Node.js 24 或更高版本（`.nvmrc` 指定 24）。
- 真实集成检查需要 PATH 中的 Codex CLI；本项目已验证 `codex-cli 0.163.0`。
- 如果本机没有 CLI，可执行 `npm install -g @openai/codex@0.163.0`，然后运行 `codex --version`。
- 仅运行单元测试时，无需安装 Codex CLI。

## 快速开始

```bash
npm ci
npm run check
npm run test:integration
npm run smoke:codex
```

`npm run smoke:codex` 启动一个子进程，依次执行以下检查，打印 JSON 结果后关闭进程：

1. `initialize`：校验服务端返回的 `userAgent`。
2. `initialized`：发送客户端就绪通知。
3. `model/list`：校验模型目录的 `data` 数组。
4. `thread/list`：校验线程列表的 `data` 数组。

示例输出（模型数量随 CLI 版本变化）：

```json
{
  "status": "passed",
  "checks": ["initialize", "initialized", "model/list", "thread/list"],
  "modelCount": 5,
  "threadCount": 0
}
```

测试为每次运行创建独立的临时 Codex 数据目录，并在退出后清理，因此不会读取个人 Codex 登录信息或历史线程。线程数为零是预期结果。模型目录检查不代表已验证模型推理或账号权限；本项目不发送 `turn/start`、不调用付费模型生成、不执行模型生成的命令，也不授予审批。

## 测试与代码

| 命令 / 文件 | 作用 |
| --- | --- |
| `npm test` | 8 项本地协议测试，使用模拟子进程 |
| `npm run check` | 源码语法检查和单元测试 |
| `npm run test:integration` | 真实 Codex CLI 集成测试，缺失 CLI 时失败 |
| `src/client.js` | 请求关联、通知、JSON-RPC 错误、超时和进程清理 |
| `src/smoke.js` | 真实服务的完整检查流程 |
| `test/fixtures/server.js` | 可控制错误和退出行为的模拟服务 |

单元测试覆盖并发请求关联、初始化、通知、协议错误、超时后恢复、异常退出、非法 JSON、可执行文件缺失和关闭后的请求。GitHub Actions 在推送和 PR 时运行语法检查及单元测试；真实 CLI 集成检查需单独运行，不在 CI 中声称通过。

自定义 CLI 路径：

```bash
CODEX_BIN=/absolute/path/to/codex npm run smoke:codex
```

排查服务端启动问题：

```bash
DEMO_DEBUG=1 npm run smoke:codex
```

默认请求超时为 20 秒，集成测试总超时为 70 秒。CLI 版本更新可能改变协议，可通过 `codex app-server generate-json-schema --out /tmp/codex-schema` 检查本机协议。

## 参考

- [官方 app-server 文档](https://developers.openai.com/codex/app-server/)
- [Codex 源码与协议说明](https://github.com/openai/codex/tree/main/codex-rs/app-server)

## Sites 发布构建

`npm run build` 将同一组页面与 `worker/handler.js` 打包为 `dist/server/index.js`，并保留 `.openai/hosting.json` 中的站点标识。Node 入口继续用于本地和 Render。Sites 的运行时变量需单独设置；环境变量不会从开发工作区自动同步。

Workers 的调用成功记录和限流计数只保留在当前 isolate 内，不跨实例持久化。

## DeepSeek 配置

`AI_BASE_URL=https://api.deepseek.com`，`AI_MODEL=deepseek-flash`，并配置服务端秘密 `AI_API_KEY` 与 `CHAT_ACCESS_TOKEN`。以 [DeepSeek 官方文档](https://api-docs.deepseek.com/)为准。以上四项在 Sites 生产环境中独立配置，不会自动读取本地 `.env`。

如未配置任何 `AI_*` 变量，保留旧版 `OPENAI_API_KEY` / `OPENAI_MODEL` 的兼容行为。一旦存在 `AI_*` 配置，不会复用旧版密钥，避免发给错误的服务商。服务地址必须使用 HTTPS，不接受嵌入凭据、查询参数或重定向。
