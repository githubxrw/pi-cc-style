# Pi 工具树与思考摘要

Pi CLI 的交互模式扩展，已在 Pi 1.6.0 验证。工具调用默认显示动作和结果摘要，思考结束后保留一条可展开的记录。

```text
◆ Read(server/package.json)
   └─ Read 92 lines（ctrl+o 展开）
◆ Search(createSession)
   └─ 返回 8 行（ctrl+o 展开）
```

工具标签来自实际调用。搜索对应 `grep`、`find` 或 `web_search` 等，`Task` 对应已启用的子代理工具。命令默认预览最多 3 行。展开时显示 Pi 实际收到的入参、可用返回文本和编辑差异。工具已截断的内容以其截断提示和日志路径为准。[Claude Code 工具折叠调研](tool-ui-references.md)

## 安装

在 PowerShell 或其他终端运行以下命令，然后重新启动 Pi。

```powershell
pi install git:github.com/githubxrw/pi-thinking-summary
```

只在当前受信任项目安装时，给 `pi install` 加上 `--local`。临时试用可以运行 `pi -e git:github.com/githubxrw/pi-thinking-summary`，下载或克隆到本地后也可以在扩展目录运行 `pi -e ./index.ts`。

## 使用

- `Ctrl+O` 同时展开或收起工具与思考详情。提示按 Pi 的实际绑定显示。
- `Ctrl+T` 切换 Pi 的原生思考正文。用紧凑视图时将其折叠，或在 Pi 设置中使用 `"hideThinkingBlock": true`。

模型提供可读思考时才会生成摘要。没有可用计时事件时，摘要省略耗时。恢复会话时会沿用保存的耗时。

## 卸载

```powershell
pi remove git:github.com/githubxrw/pi-thinking-summary
```

项目安装使用 `pi remove --local git:github.com/githubxrw/pi-thinking-summary`。临时试用后，下次启动省略 `-e`。如需恢复原生思考正文，可在 Pi 中用 `Ctrl+T` 切换。
