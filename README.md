# 看板

三栏看板：To-do、Doing、Done。可以创建卡片、在栏位之间拖拽，并用语义搜索已有卡片。

## 你需要准备

- Node.js 20+
- Docker，并且本机能执行 `docker compose`
- OpenRouter API Key。嵌入模型是 `liquid/lfm-2.5-embedding-350m:free`，免费路由有速率限制，请求内容可能被用于模型训练，卡片里不要写密钥或隐私。

这个模型单条输入大约 512 token，超长文本会在嵌入前截断，标题和描述仍完整保存。官方支持英、西、德、法、意、葡、阿拉伯语、瑞典语、挪威语、日语、韩语，不包含中文，所以中文语义搜索不可靠。

## 启动

```bash
cp .env.example .env
```

把 OpenRouter Key 写进 `.env` 的 `OPENROUTER_API_KEY`。

```bash
sh scripts/compose.sh up -d
cd backend && npm install && npm run dev
```

另开一个终端：

```bash
cd frontend && npm install && npm run dev
```

打开 http://localhost:5173 。数据库在本机 `localhost:5432`，账号、密码、库名都是 `board`，数据放在 Docker 卷 `pgdata` 里。

## 测试

在仓库根目录执行：

```bash
npm install
npm test
```

这会启动 pgvector 容器，然后跑后端和前端测试，并做一次类型检查和前端构建。后端测试使用单独的库 `board_test`，不会清空开发库 `board`。嵌入请求在测试里是假的，所以不需要 API Key 也能覆盖创建、换栏和余弦过滤。OpenRouter 的请求体、模型名和 `document:` / `query:` 前缀由另一组测试用假的 HTTP 响应核对。

`scripts/compose.sh` 会优先用本机的 `docker compose`。当前 WSL 如果提示要打开 WSL integration，它会改用 Docker Desktop 自带的 `docker.exe`。启用 WSL integration 之后，直接运行 `docker compose` 也可以。
