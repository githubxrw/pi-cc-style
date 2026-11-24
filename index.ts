import type { AssistantMessage, ThinkingContent } from "@earendil-works/pi-ai";
import {
  getMarkdownTheme,
  type EntryRenderOptions,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionUIContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Markdown,
  replaceControlCharacters,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import { renderToolTree } from "./tool-tree.ts";

const summaryType = "pi-thinking-summary";

type ThinkingSummaryData = {
  messageEntryId: string;
  durationMs: number | null;
};

type ThinkingInterval = {
  start?: number;
  end?: number;
  readable: boolean;
};

function readableThinking(block: AssistantMessage["content"][number] | undefined): block is ThinkingContent {
  return block?.type === "thinking" && !block.redacted && block.thinking.trim().length > 0;
}

function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? "不足 1 秒" : `${Math.floor(durationMs / 1000)} 秒`;
}

function measureThinking(intervals: Iterable<ThinkingInterval | undefined>, now?: number): number | null {
  const spans: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const start = interval?.start;
    const end = interval?.end ?? now;
    if (start === undefined || end === undefined) return null;
    spans.push({ start, end });
  }
  spans.sort((left, right) => left.start - right.start);

  let duration = 0;
  let coveredUntil = 0;
  for (const { start, end } of spans) {
    duration += Math.max(0, end - Math.max(start, coveredUntil));
    coveredUntil = Math.max(end, coveredUntil);
  }
  return Math.floor(duration);
}

function firstLine(value: string): string {
  return replaceControlCharacters(stripTerminalSequences(value).split(/\r\n|\r|\n/, 1)[0]).trim();
}

function toolAction(toolName: string, args: { path?: unknown; command?: unknown }): string {
  switch (toolName) {
    case "read":
    case "edit":
    case "write": {
      const verb = { read: "读取", edit: "编辑", write: "写入" }[toolName];
      const path = typeof args?.path === "string" ? firstLine(args.path) : "";
      return `正在${verb} ${path || "文件"}`;
    }
    case "bash": {
      const command = typeof args?.command === "string" ? firstLine(args.command) : "";
      return command ? `正在运行命令 ${command}` : "正在运行命令";
    }
    default:
      return `正在运行 ${firstLine(toolName)}`;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerToolRenderer(renderToolTree);
  let ui: ExtensionUIContext | undefined;
  let sessionManager: ExtensionContext["sessionManager"] | undefined;
  const intervals = new Map<number, ThinkingInterval>();
  const tools = new Map<string, string>();
  let completedDuration: number | null = null;
  let thinkingTimer: ReturnType<typeof setInterval> | undefined;
  let workingMessage: string | undefined;

  function setWorkingMessage(message?: string) {
    if (workingMessage === message) return;
    workingMessage = message;
    ui?.setWorkingMessage(message);
  }

  function stopThinkingTimer() {
    clearInterval(thinkingTimer);
    thinkingTimer = undefined;
  }

  function resetTurn() {
    stopThinkingTimer();
    setWorkingMessage();
    intervals.clear();
    tools.clear();
    completedDuration = null;
  }

  function showThinking() {
    const readable = [...intervals.values()].filter((interval) => interval.readable);
    if (!readable.some((interval) => interval.end === undefined)) {
      stopThinkingTimer();
      setWorkingMessage();
      return;
    }
    const elapsed = measureThinking(readable, performance.now());
    setWorkingMessage(elapsed === null ? "正在思考…" : `正在思考… ${formatDuration(elapsed)}`);
    thinkingTimer ??= setInterval(showThinking, 1000);
  }

  function showTools() {
    if (tools.size === 0) {
      setWorkingMessage();
    } else if (tools.size > 1) {
      setWorkingMessage(`正在处理 ${tools.size} 个工具`);
    } else {
      const action = tools.values().next().value!;
      const suffix = completedDuration === null ? "" : ` · 已思考 ${formatDuration(completedDuration)}`;
      const width = Math.max(0, (process.stdout.columns || 80) - 4);
      const status = truncateToWidth(action, width - visibleWidth(suffix), "…") + suffix;
      setWorkingMessage(truncateToWidth(status, width, "…"));
    }
  }

  function renderSummary(data: ThinkingSummaryData, options: EntryRenderOptions, theme: Theme): Component | undefined {
    const source = sessionManager?.getEntry(data.messageEntryId);
    if (source?.type !== "message" || source.message.role !== "assistant") return;

    const blocks = source.message.content.filter(readableThinking);
    if (!blocks.length) return;

    const duration = data.durationMs;
    const elapsed = typeof duration === "number" && Number.isFinite(duration) && duration >= 0
      ? formatDuration(duration)
      : "";
    const label = source.message.stopReason === "aborted"
      ? `∴ 思考已中断${elapsed ? ` · ${elapsed}` : ""}`
      : elapsed ? `∴ 已思考 ${elapsed}` : "∴ 思考摘要";
    const line = firstLine(blocks[0].thinking.trimStart());
    const heading = /^(?:#{1,6}\s+(.+?)(?:\s+#+)?|\*\*([^*]+)\*\*)$/.exec(line);
    const title = (heading?.[1] ?? heading?.[2] ?? "").trim();
    const key = options.keyText("app.tools.expand");
    const hint = key ? `（${key} ${options.expanded ? "收起" : "展开"}）` : "";

    const summary = {
      invalidate() {},
      render(width: number) {
        const indentation = width > 1 ? " " : "";
        const columns = width - indentation.length;
        const withHint = visibleWidth(label + hint) <= columns;
        const titleColumns = columns - visibleWidth(label + hint + " · ");
        const topic = title && withHint && titleColumns >= 2
          ? ` · ${truncateToWidth(title, titleColumns, "…")}`
          : "";
        const text = withHint ? label + topic + hint : truncateToWidth(label, columns, "…");
        return [indentation + theme.fg("dim", text)];
      },
    };
    if (!options.expanded) return summary;

    const details = blocks.map((block) => block.thinking.trim()).join("\n\n");
    const component = new Container();
    component.addChild(summary);
    component.addChild(new Markdown(details, 2, 0, getMarkdownTheme(), {
      color: (text) => theme.fg("thinkingText", text),
    }));
    return component;
  }

  pi.registerEntryRenderer<ThinkingSummaryData>(summaryType, (entry, options, theme) => {
    const data = entry.data;
    if (!data || typeof data.messageEntryId !== "string") return;
    if (sessionManager) return renderSummary(data, options, theme);

    // Pi rebuilds the transcript before emitting session_start on /reload.
    let component: Component | undefined;
    return {
      invalidate() {
        component?.invalidate();
      },
      render(width: number) {
        if (sessionManager) component ??= renderSummary(data, options, theme);
        return component?.render(width) ?? [];
      },
    };
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ui = ctx.ui;
    sessionManager = ctx.sessionManager;
    ui.setHiddenThinkingLabel("");
  });

  pi.on("message_start", (event) => {
    if (ui && event.message.role === "assistant") resetTurn();
  });

  pi.on("message_update", (event) => {
    if (!ui || event.message.role !== "assistant") return;
    const update = event.assistantMessageEvent;
    if (update.type !== "thinking_start" && update.type !== "thinking_delta" && update.type !== "thinking_end") return;

    const index = update.contentIndex;
    const interval = intervals.get(index) ?? { readable: false };
    const wasReadable = interval.readable;
    interval.readable = readableThinking(event.message.content[index]);
    if (update.type === "thinking_start") interval.start = performance.now();
    if (update.type === "thinking_end") interval.end = performance.now();
    intervals.set(index, interval);

    if (update.type !== "thinking_delta" || wasReadable !== interval.readable) showThinking();
  });

  pi.on("message_end", (event) => {
    if (!ui || event.message.role !== "assistant") return;
    if (event.message.stopReason === "aborted") {
      const now = performance.now();
      for (const interval of intervals.values()) interval.end ??= now;
    }
    stopThinkingTimer();
    setWorkingMessage();
    const readable = event.message.content.flatMap((block, index) => readableThinking(block) ? [intervals.get(index)] : []);
    completedDuration = readable.length ? measureThinking(readable) : null;
  });

  pi.on("tool_execution_start", (event) => {
    if (!ui || event.parentToolCallId) return;
    tools.set(event.toolCallId, toolAction(event.toolName, event.args));
    showTools();
  });

  pi.on("tool_execution_end", (event) => {
    if (ui && tools.delete(event.toolCallId)) showTools();
  });

  pi.on("turn_end", (event) => {
    if (!ui) return;
    const durationMs = completedDuration;
    resetTurn();
    if (event.message.role !== "assistant" || !event.message.content.some(readableThinking)) return;

    const data: ThinkingSummaryData = { messageEntryId: event.messageEntryId, durationMs };
    return { entries: [...event.entries, { type: "custom", customType: summaryType, data }] };
  });

  pi.on("agent_end", resetTurn);
  pi.on("session_shutdown", () => {
    resetTurn();
    ui = undefined;
    sessionManager = undefined;
  });
}
