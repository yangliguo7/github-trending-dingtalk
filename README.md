# GitHub Trending DingTalk Digest

零成本 GitHub Trending 中文解读机器人：

- 周一推送 GitHub 滚动 7 天周榜 Top 25；
- 周二至周五推送前一晚保存的日榜 Top 10；
- GitHub Models 可用时生成结构化中文解读；
- 模型不可用时自动使用仓库描述和 README 简介；
- 每次榜单只发送一条钉钉 Markdown 消息。

## 本地验证

```bash
npm install
npm test
npm run dry-run:daily
npm run dry-run:weekly
```

Dry-run 不需要模型或钉钉密钥，结果写入 `.artifacts/`。

## GitHub 配置

仓库 Variables：

- `AI_MODEL`：GitHub Models 目录中的可用免费模型。未配置时使用确定性摘要。

仓库 Secrets：

- `DINGTALK_WEBHOOK`
- `DINGTALK_SECRET`

工作流使用内置 `GITHUB_TOKEN` 读取公开仓库和调用 GitHub Models，不保存第三方仓库内容之外的敏感数据。

## 命令

```bash
npm run collect:daily
npm run publish:auto
npm run dry-run:daily
npm run dry-run:weekly
```

详细设计见 `docs/superpowers/specs/2026-07-28-github-trending-dingtalk-design.md`。
