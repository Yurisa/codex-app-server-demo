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
npm start
```

`npm start` 启动一个子进程，依次执行以下检查，打印 JSON 结果后关闭进程：

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
CODEX_BIN=/absolute/path/to/codex npm start
```

排查服务端启动问题：

```bash
DEMO_DEBUG=1 npm start
```

默认请求超时为 20 秒，集成测试总超时为 70 秒。CLI 版本更新可能改变协议，可通过 `codex app-server generate-json-schema --out /tmp/codex-schema` 检查本机协议。

## 参考

- [官方 app-server 文档](https://developers.openai.com/codex/app-server/)
- [Codex 源码与协议说明](https://github.com/openai/codex/tree/main/codex-rs/app-server)
