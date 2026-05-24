import {
  AssistantMessageComponent,
  BranchSummaryMessageComponent,
  CompactionSummaryMessageComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Text,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";
import { open, stat } from "node:fs/promises";
import { cleanText, textFromContent } from "./session.ts";

export type PreviewRenderOptions = {
  maxEntries?: number;
  maxUserChars?: number;
  chunkBytes?: number;
  tui?: unknown;
  cwd?: string;
};

export type LazyPreviewComponent = Component & {
  loadMore(): Promise<void>;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loadedEntries: number;
};

export async function buildSessionPreviewComponent(
  file: string,
  options: PreviewRenderOptions = {},
): Promise<LazyPreviewComponent> {
  const preview = new IncrementalSessionPreviewComponent(file, options);
  await preview.loadMore();
  return preview;
}

class IncrementalSessionPreviewComponent extends Container implements LazyPreviewComponent {
  private offset = 0;
  private leftover = "";
  private pendingLines: string[] = [];
  private done = false;
  private knownSize = 0;
  private loading = false;
  private entries = 0;
  private emptyMessage?: Text;
  private readonly maxEntries: number;
  private readonly maxUserChars: number;
  private readonly chunkBytes: number;
  private readonly cwd: string;

  constructor(
    private readonly file: string,
    options: PreviewRenderOptions,
  ) {
    super();
    this.maxEntries = options.maxEntries ?? 18;
    this.maxUserChars = options.maxUserChars ?? 4000;
    this.chunkBytes = options.chunkBytes ?? 64 * 1024;
    this.cwd = options.cwd ?? process.cwd();
  }

  get hasMore(): boolean {
    return !this.done || this.pendingLines.length > 0 || this.leftover.length > 0;
  }

  get loadingMore(): boolean {
    return this.loading;
  }

  get loadedEntries(): number {
    return this.entries;
  }

  async loadMore(): Promise<void> {
    if (this.loading) return;
    await this.refreshDoneState();
    if (!this.hasMore) return;
    this.loading = true;

    try {
      let added = 0;
      while (added < this.maxEntries && (!this.done || this.pendingLines.length > 0)) {
        if (this.pendingLines.length === 0) {
          await this.refreshDoneState();
          const { lines, eof } = await this.readNextLines();
          this.pendingLines.push(...lines);

          if (eof) {
            // Completed historical sessions often lack a trailing newline, so render
            // the final complete JSONL object. If a live file grows later,
            // refreshDoneState() reopens loading from the current offset.
            if (this.leftover.trim()) this.pendingLines.push(this.leftover);
            this.leftover = "";
            this.done = true;
          }

          if (this.pendingLines.length === 0 && this.done) break;
        }

        const line = this.pendingLines.shift();
        if (line === undefined) continue;
        const didAdd = this.addPreviewLine(line);
        if (didAdd) {
          this.addChild(new BlankLine());
          added++;
          this.entries++;
        }
      }

      if (this.entries === 0 && this.done && !this.emptyMessage) {
        this.emptyMessage = new Text("No previewable messages found.", 0, 0);
        this.addChild(this.emptyMessage);
      }
    } finally {
      this.loading = false;
    }
  }

  private async refreshDoneState(): Promise<void> {
    try {
      this.knownSize = (await stat(this.file)).size;
      if (
        this.offset < this.knownSize ||
        this.pendingLines.length > 0 ||
        this.leftover.length > 0
      ) {
        this.done = false;
      }
    } catch {
      // Keep existing state; the read path will surface any real file error.
    }
  }

  private async readNextLines(): Promise<{ lines: string[]; eof: boolean }> {
    const handle = await open(this.file, "r");
    try {
      const buffer = Buffer.alloc(this.chunkBytes);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, this.offset);
      this.offset += bytesRead;
      if (bytesRead === 0) return { lines: [], eof: true };

      const text = this.leftover + buffer.subarray(0, bytesRead).toString("utf8");
      const lines = text.split("\n");
      this.leftover = lines.pop() ?? "";
      return { lines, eof: bytesRead < buffer.length };
    } finally {
      await handle.close();
    }
  }

  private addPreviewLine(rawLine: string): boolean {
    if (!rawLine.trim()) return false;

    let entry: any;
    try {
      entry = JSON.parse(rawLine);
    } catch {
      return false;
    }

    if (entry.type === "session") {
      if (entry.cwd) this.addChild(new Text(`cwd: ${entry.cwd}`, 0, 0));
      return false;
    }

    if (entry.type === "session_info" && entry.name) {
      this.addChild(new Text(`name: ${entry.name}`, 0, 0));
      return false;
    }

    if (entry.type === "compaction") {
      this.addChild(
        new CompactionSummaryMessageComponent({
          role: "compactionSummary",
          summary: entry.summary ?? "",
          tokensBefore: entry.tokensBefore ?? 0,
          timestamp: Date.parse(entry.timestamp ?? "") || Date.now(),
        } as any),
      );
      return true;
    }

    if (entry.type === "branch_summary") {
      this.addChild(
        new BranchSummaryMessageComponent({
          role: "branchSummary",
          summary: entry.summary ?? "",
          fromId: entry.fromId ?? "",
          timestamp: Date.parse(entry.timestamp ?? "") || Date.now(),
        } as any),
      );
      return true;
    }

    if (entry.type !== "message") return false;

    const message = entry.message;
    if (message?.role === "toolResult") {
      const text = rawTextFromContent(message.content);
      if (!text) return false;
      const title = toolResultTitle(message);
      this.addChild(new CompactToolResultComponent(title, text, Boolean(message.isError)));
      return true;
    }

    if (message?.role === "user") {
      const userText = truncate(cleanText(textFromContent(message.content)), this.maxUserChars);
      if (!userText) return false;
      this.addChild(new UserMessageComponent(userText));
      return true;
    }

    if (message?.role === "assistant") {
      if (!hasVisibleAssistantContent(message)) return false;
      this.addChild(new AssistantMessageComponent(assistantTranscriptMessage(message), false));
      return true;
    }

    return false;
  }
}

class BlankLine implements Component {
  invalidate(): void {}
  render(): string[] {
    return [""];
  }
}

class CompactToolResultComponent implements Component {
  private readonly previewLines: string[];
  private readonly omitted: number;
  private readonly bg: (text: string) => string;

  constructor(
    private readonly title: string,
    text: string,
    isError: boolean,
  ) {
    const lines = compactToolResultLines(text);
    this.previewLines = lines.slice(0, 8);
    this.omitted = Math.max(0, lines.length - this.previewLines.length);
    this.bg = isError ? redToolBg : greenToolBg;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const content: string[] = [];
    content.push(...wrapTextWithAnsi(this.title, innerWidth));
    for (const line of this.previewLines) {
      content.push(...wrapTextWithAnsi(line, innerWidth));
    }
    if (this.omitted > 0) content.push("... (tool output compacted)");

    return [
      this.paint("", width),
      ...content.map((line) => this.paint(` ${line}`, width)),
      this.paint("", width),
    ];
  }

  private paint(line: string, width: number): string {
    const padding = " ".repeat(Math.max(0, width - visibleWidth(line)));
    return this.bg(`${line}${padding}`);
  }
}

function toolResultTitle(message: { toolName?: string; content?: unknown }): string {
  const toolName = message.toolName ?? "tool";
  const text = rawTextFromContent(message.content);
  const url = text.match(/^> URL: (.+)$/m)?.[1] ?? text.match(/^URL: (.+)$/m)?.[1];
  return url ? `${toolName} ${url}` : toolName;
}

function compactToolResultLines(text: string): string[] {
  const lines = text.trim().split("\n");
  return lines
    .map((line) => line.replace(/^>\s?/, ""))
    .filter((line) => !/^(URL|Site|Language|Words|Browser):\s/.test(line));
}

function greenToolBg(text: string): string {
  // Pi default theme toolSuccessBg: #1e2e1e
  return `\x1b[48;2;30;46;30m${text}\x1b[49m`;
}

function redToolBg(text: string): string {
  // Pi default theme toolErrorBg: #2e1e1e
  return `\x1b[48;2;46;30;30m${text}\x1b[49m`;
}

function assistantTranscriptMessage(message: any): any {
  if (!Array.isArray(message.content)) return message;
  return {
    ...message,
    content: message.content.filter(
      (block: any) => block?.type === "text" || block?.type === "thinking",
    ),
  };
}

function rawTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: any) =>
      block?.type === "text" && typeof block.text === "string" ? block.text : "",
    )
    .filter(Boolean)
    .join("\n");
}

function hasVisibleAssistantContent(message: { content?: unknown }): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((block: any) => {
    if (block?.type === "text") return cleanText(block.text ?? "");
    if (block?.type === "thinking") return cleanText(block.thinking ?? "");
    return false;
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
