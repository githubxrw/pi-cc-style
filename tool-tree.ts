import type { ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import { Container, Text, replaceControlCharacters, stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const labels: Record<string, string> = {
  read: "Read",
  grep: "Search",
  find: "Search",
  web_search: "Search",
  tool_search: "Search",
  edit: "Edit",
  write: "Write",
  bash: "Bash",
  powershell: "PowerShell",
  subagent: "Task",
  task: "Task",
  ls: "List",
};
const commandTools = new Set(["bash", "powershell"]);
const previewLimit = 3;

function cleanLine(text: string): string {
  return replaceControlCharacters(stripTerminalSequences(text).replace(/\t/g, "    "));
}

function oneLine(text: string): string {
  return cleanLine(text.split(/\r\n|\n|\r/, 1)[0] ?? "").trim();
}

function resultLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

function lineComponent(lines: string[], padding: number) {
  return {
    invalidate() {},
    render(width: number) {
      const indent = " ".repeat(Math.min(padding, Math.max(0, width - 1)));
      return lines.map((line) => indent + truncateToWidth(line, width - indent.length, "…"));
    },
  };
}

export const renderToolTree: ToolRendererResolver = (toolName, next) => {
  const original = next();
  const label = Object.hasOwn(labels, toolName) ? labels[toolName] : toolName;
  const shell = commandTools.has(toolName);

  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      const query = Array.isArray(args?.queries) ? args.queries[0] : undefined;
      const subject = [
        args?.path, args?.file_path, args?.command, args?.pattern, args?.query, query?.query ?? query,
        args?.description, args?.task, args?.prompt, args?.agent, args?.url,
      ].find((value) => typeof value === "string" && value.trim());
      // Search patterns are more informative than the directory in the same call.
      const target = label === "Search" ? args?.pattern ?? args?.query ?? query?.query ?? query : undefined;
      const argument = oneLine(typeof target === "string" && target.trim() ? target : subject ?? "");
      const icon = context.isPartial ? theme.fg("muted", "◇") : context.isError ? theme.fg("error", "×") : theme.fg("success", "◆");
      const prefix = `${icon} ${theme.fg("toolTitle", theme.bold(label))}(`;
      const padding = context.outputPad;
      const component = new Container();
      component.addChild({
        invalidate() {},
        render(width) {
          const indent = " ".repeat(Math.min(padding, Math.max(0, width - 1)));
          const columns = width - indent.length;
          const remaining = columns - visibleWidth(prefix) - 1;
          if (remaining < 0) return [indent + truncateToWidth(prefix + ")", columns, "…")];
          return [indent + prefix + truncateToWidth(argument, remaining, "…") + ")"];
        },
      });
      if (context.isPartial) {
        const state = context.executionStarted ? "运行中…" : context.argsComplete ? "等待执行…" : "接收参数…";
        component.addChild(lineComponent([theme.fg("muted", `  └─ ${state}`)], padding));
      }
      if (context.expanded && args !== undefined) {
        component.addChild(new Text(theme.fg("muted", "  ├─ 入参") + "\n" + JSON.stringify(args, null, 2), padding, 0));
      }
      return component;
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const text = result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      const images = result.content.filter((block) => block.type === "image").length;
      const details = result.details;
      const lines = resultLines(text);
      const padding = context.outputPad;
      if (expanded) {
        const component = new Container();
        const heading = context.isError ? theme.fg("error", "  └─ 执行失败") : theme.fg("muted", "  └─ 输出");
        const body = lines.map(cleanLine).join("\n") || (images ? `${images} 张图片` : "（无文本输出）");
        component.addChild(new Text(`${heading}\n${body}`, padding, 0));
        const diff = typeof details?.diff === "string" ? details.diff : "";
        if (diff) component.addChild(new Text(resultLines(diff).map(cleanLine).join("\n"), padding, 0));
        const fullOutputPath = details?.fullOutputPath;
        if (typeof fullOutputPath === "string" && !text.includes(fullOutputPath)) {
          component.addChild(new Text(`完整日志文件 ${oneLine(fullOutputPath)}`, padding, 0));
        }
        // Preserve rich host output for tools whose result exists only in their renderer.
        if (!text && !images && !diff && original?.renderResult) {
          component.addChild(original.renderResult(result, { expanded, isPartial }, theme, { ...context, lastComponent: undefined }));
        }
        return component;
      }

      const preview = shell || context.isError
        ? lines.slice(0, context.isError ? 1 : previewLimit).map((line) => theme.fg("toolOutput", `     ${cleanLine(line)}`))
        : [];
      if (isPartial) return lineComponent(preview, padding);

      const shown = details?.truncation?.outputLines;
      const truncated = details?.truncation?.truncated === true;
      let summary = "执行完成";
      if (context.isError) {
        summary = "执行失败";
      } else if (images) {
        summary = `返回 ${images} 张图片`;
      } else if (toolName === "read") {
        const content = text.replace(/\n\n\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/, "");
        summary = `Read ${typeof shown === "number" ? shown : resultLines(content).length} lines`;
      } else if (shell) {
        summary = lines.length ? `命令结束 · ${typeof shown === "number" ? shown : lines.length} 行输出` : "命令结束 · 无输出";
      } else if (toolName === "edit" || toolName === "write") {
        summary = toolName === "edit" ? "修改完成" : "写入完成";
      } else if (lines.length && (label === "Search" || label === "Task")) {
        summary = `返回 ${lines.length} 行`;
      }
      if (truncated) summary += " · 工具已截断";
      const key = context.keyText("app.tools.expand");
      const hint = key ? `（${key} 展开）` : "";
      return lineComponent([
        theme.fg(context.isError ? "error" : "muted", `  └─ ${summary}`) + theme.fg("dim", hint),
        ...preview,
      ], padding);
    },
  };
};
