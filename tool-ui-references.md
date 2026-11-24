# Claude Code 工具折叠参考

## 已核实的交互

- Claude Code 的默认视图缩略工具输出，详细视图显示完整的工具输出。`Ctrl+O` 打开详细记录，展开默认折叠的条目。1.0.113 将该动作从 `Ctrl+R` 改绑到 `Ctrl+O`，当前 `Ctrl+R` 用于反向搜索输入历史。[交互模式](https://code.claude.com/docs/en/interactive-mode#keyboard-shortcuts) · [启动视图设置](https://code.claude.com/docs/en/settings-reference#viewmode) · [1.0.113 更新日志](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#10113)
- Claude Code 可以成组折叠读取和搜索操作，运行时与完成后使用不同状态文案。发布记录也说明失败、阻止和拒绝有单独标示。正在执行的工具可以在展开视图中完成后更新结果。[折叠读取和搜索组](https://code.claude.com/docs/en/changelog#:~:text=Changed%20collapsed%20read%2Fsearch%20groups) · [失败状态](https://code.claude.com/docs/en/changelog#:~:text=Fixed%20failed%2C%20blocked%20or%20refused%20commands) · [运行结果更新](https://code.claude.com/docs/en/changelog#:~:text=tool%20calls%20still%20running%20when%20the%20transcript%20opens)
- Claude Code 的可读思考摘要可以在 `Ctrl+O` 的详细视图中查看，是否返回可读摘要受 `showThinkingSummaries` 影响。当前 Claude Code 的委派工具称为 `Agent`，能运行多个子代理。[思考摘要设置](https://code.claude.com/docs/en/settings-reference#showthinkingsummaries) · [子代理](https://code.claude.com/docs/en/sub-agents)

## 用于 Pi 的设计取舍

- 动作行给出工具名和主要目标，例如 `Read(server/package.json)`，缩进的子行报告实际结果，例如读取行数。扩展沿用 Pi 主题，用工具结果推导行数、短预览和错误状态。
- 让工具和思考共用 Pi 的展开动作 `app.tools.expand`。默认隐藏成功工具的长返回，展开时显示工具实际收到的参数、返回及可读思考。并行工具各自显示状态，按调用 ID 关联输入和结果，避免将多个并行调用压成一个不可辨认的节点。
- 折叠是一种显示行为。工具执行本身可能限行、分页或把完整输出写到文件。Claude Code 的 `Read` 与 `Bash` 也有独立的结果上限。Pi 展开时以已保存的工具返回为边界，显示工具提供的截断提示和文件位置。[Claude Code 工具参考](https://code.claude.com/docs/en/tools-reference)
