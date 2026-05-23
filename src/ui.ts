import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { type ScrollConfig, type ScrollFilterMode, type ScrollScopeMode } from "./config.ts";
import { interpretScrollInput } from "./input.ts";
import { buildSessionPreview } from "./preview.ts";
import {
  searchSessions,
  snippetAroundTerms,
  type SearchResult,
  type SearchScope,
} from "./search.ts";
import { cleanText } from "./session.ts";

export type ScrollTheme = {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
};

export type ScrollSearchComponentOptions = {
  theme: ScrollTheme;
  done: (file: string | null) => void;
  requestRender: () => void;
  sessionsDir: string;
  currentSessionFile?: string;
  cwd: string;
  config: ScrollConfig;
};

export class ScrollSearchComponent {
  query = "";
  cursor = 0;
  results: SearchResult[] = [];
  selected = 0;
  loading = false;
  error: string | undefined;
  previewLines: string[] = [];
  previewLoading = false;
  previewError: string | undefined;

  private searchTimer?: NodeJS.Timeout;
  private searchGeneration = 0;
  private previewGeneration = 0;
  private previewFile: string | undefined;
  private scopeMode: ScrollScopeMode;
  private filterMode: ScrollFilterMode;
  private previewOpen: boolean;
  private edgeLatch: { edge: "top" | "bottom"; timestamp: number } | undefined;
  private lastNavigation: { delta: number; timestamp: number } | undefined;

  constructor(private options: ScrollSearchComponentOptions) {
    this.scopeMode = options.config.defaultScope;
    this.filterMode = options.config.defaultFilterMode;
    this.previewOpen = options.config.preview;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const w = Math.max(48, width);
    const targetHeight = Math.max(
      14,
      Math.floor((process.stdout.rows ?? 30) * this.options.config.heightRatio),
    );
    const resultHeight = Math.max(8, targetHeight - 6);
    const showPreview = this.previewOpen && w >= this.options.config.previewMinWidth;
    const gap = showPreview ? 1 : 0;
    const resultsWidth = showPreview
      ? Math.max(48, Math.floor((w - gap) * (1 - this.options.config.previewRatio)))
      : w;
    const previewWidth = showPreview ? Math.max(40, w - resultsWidth - gap) : 0;

    const resultBox = this.renderResultsBox(resultsWidth, resultHeight);
    const lines: string[] = [];

    if (showPreview) {
      const previewBox = this.renderPreviewBox(previewWidth, resultBox.length);
      const max = Math.max(resultBox.length, previewBox.length);
      for (let i = 0; i < max; i++) {
        lines.push(`${resultBox[i] ?? " ".repeat(resultsWidth)} ${previewBox[i] ?? ""}`);
      }
    } else {
      lines.push(...resultBox);
    }

    lines.push(
      truncateToWidth(
        this.theme.fg(
          "dim",
          `  ↑/↓ Ctrl+P/Ctrl+N move • Ctrl+G ${this.scopeMode === "global" ? "cwd" : "global"} • Ctrl+T ${this.filterMode === "chat" ? "all" : "chat"} • Ctrl+O ${this.previewOpen ? "close" : "open"} preview • Enter switch • Esc cancel`,
        ),
        w,
      ),
    );
    return lines.map((line) => truncateToWidth(line, w));
  }

  handleInput(data: string): void {
    const action = interpretScrollInput(data);

    switch (action.type) {
      case "cancel":
        this.options.done(null);
        return;
      case "scope":
        this.scopeMode = this.scopeMode === "global" ? "cwd" : "global";
        this.scheduleSearch();
        return;
      case "preview":
        this.previewOpen = !this.previewOpen;
        this.schedulePreview();
        this.options.requestRender();
        return;
      case "filter":
        this.filterMode = this.filterMode === "chat" ? "all" : "chat";
        this.scheduleSearch();
        return;
      case "select": {
        const picked = this.results[this.selected];
        if (picked) this.options.done(picked.file);
        return;
      }
      case "move":
        this.move(action.delta);
        return;
      case "cursor":
        this.cursor = action.word
          ? this.moveCursorByWord(action.delta)
          : this.clampCursor(this.cursor + action.delta);
        this.options.requestRender();
        return;
      case "cursorStart":
        this.cursor = 0;
        this.options.requestRender();
        return;
      case "cursorEnd":
        this.cursor = this.query.length;
        this.options.requestRender();
        return;
      case "backspace":
        if (this.cursor > 0) {
          this.query = `${this.query.slice(0, this.cursor - 1)}${this.query.slice(this.cursor)}`;
          this.cursor--;
          this.scheduleSearch();
        }
        return;
      case "delete":
        if (this.cursor < this.query.length) {
          this.query = `${this.query.slice(0, this.cursor)}${this.query.slice(this.cursor + 1)}`;
          this.scheduleSearch();
        }
        return;
      case "deleteWordBackward": {
        const next = this.moveCursorByWord(-1);
        if (next !== this.cursor) {
          this.query = `${this.query.slice(0, next)}${this.query.slice(this.cursor)}`;
          this.cursor = next;
          this.scheduleSearch();
        }
        return;
      }
      case "deleteWordForward": {
        const next = this.moveCursorByWord(1);
        if (next !== this.cursor) {
          this.query = `${this.query.slice(0, this.cursor)}${this.query.slice(next)}`;
          this.scheduleSearch();
        }
        return;
      }
      case "deleteToStart":
        if (this.cursor > 0) {
          this.query = this.query.slice(this.cursor);
          this.cursor = 0;
          this.scheduleSearch();
        }
        return;
      case "deleteToEnd":
        if (this.cursor < this.query.length) {
          this.query = this.query.slice(0, this.cursor);
          this.scheduleSearch();
        }
        return;
      case "insert":
        this.query = `${this.query.slice(0, this.cursor)}${action.text}${this.query.slice(this.cursor)}`;
        this.cursor += action.text.length;
        this.scheduleSearch();
        return;
      case "noop":
        return;
    }
  }

  private renderResultsBox(width: number, resultHeight: number): string[] {
    const contentWidth = Math.max(1, width - 4);
    const body: string[] = [];
    const visibleResults = Math.floor(resultHeight / 2);
    const start = Math.max(
      0,
      Math.min(
        this.selected - Math.floor(visibleResults / 2),
        Math.max(0, this.results.length - visibleResults),
      ),
    );
    const shown = this.results.slice(start, start + visibleResults);

    if (!this.query.trim()) {
      body.push(
        this.theme.fg("muted", `Search scope: ${this.scopeLabel()} • filter: ${this.filterMode}`),
      );
      body.push(
        this.theme.fg("muted", `Search runs live over ${this.options.sessionsDir} with ripgrep.`),
      );
      body.push(
        this.theme.fg(
          "dim",
          `Type at least ${this.options.config.minQueryLength} characters to search Pi JSONL session history.`,
        ),
      );
    } else if (this.query.trim().length < this.options.config.minQueryLength) {
      body.push(
        this.theme.fg(
          "muted",
          `Keep typing… search starts at ${this.options.config.minQueryLength} characters.`,
        ),
      );
    } else if (this.error) {
      body.push(this.theme.fg("error", this.error));
      body.push(
        this.theme.fg(
          "muted",
          "Install ripgrep or configure Scroll to point at an available search backend later.",
        ),
      );
    } else if (this.loading && this.results.length === 0) {
      body.push(this.theme.fg("warning", "searching…"));
    } else if (!this.loading && this.results.length === 0) {
      body.push(this.theme.fg("muted", "No matches."));
    }

    for (let i = 0; i < shown.length; i++) {
      const result = shown[i]!;
      const absoluteIndex = start + i;
      const isSelected = absoluteIndex === this.selected;
      const pointer = isSelected ? this.theme.fg("accent", "> ") : "  ";
      const cwd = result.cwd ? ` ${this.theme.fg("dim", `[${result.cwd}]`)}` : "";
      const firstText = isSelected ? this.theme.fg("accent", result.firstInput) : result.firstInput;
      const first = `${pointer}${firstText}${cwd}`;
      const roleText = `${result.role ?? "entry"}:${result.line}`;
      const role = this.theme.fg("muted", roleText);
      const snippetWidth = Math.max(12, contentWidth - visibleWidth(`  ${roleText} `));
      const snippet = snippetAroundTerms(result.matchText, result.matchedTerms, snippetWidth);
      const second = `  ${role} ${this.highlight(snippet, result.matchedTerms)}`;
      body.push(truncateToWidth(first, contentWidth));
      body.push(...wrapTextWithAnsi(second, contentWidth).slice(0, 1));
    }

    while (body.length < resultHeight) body.push("");

    const prompt = this.renderPrompt();
    const lines: string[] = [];
    lines.push(this.topBorder(width, this.resultsTitle()));
    for (const line of body.slice(0, resultHeight)) lines.push(this.boxLine(line, width));
    lines.push(this.bottomBorder(width));
    lines.push(this.topBorder(width, "Find Sessions"));
    lines.push(this.boxLine(prompt, width));
    lines.push(this.bottomBorder(width));
    return lines;
  }

  private resultsTitle(): string {
    const title = `Results: ${this.scopeMode === "global" ? "Global" : "CWD"} / ${this.filterMode}`;
    if (this.results.length === 0) return title;
    return `${title} (${this.selected + 1}/${this.results.length})`;
  }

  private renderPreviewBox(width: number, height: number): string[] {
    const contentWidth = Math.max(1, width - 4);
    const body: string[] = [];

    if (!this.previewOpen) {
      body.push(this.theme.fg("dim", "Preview closed. Press Ctrl+O to open."));
    } else if (this.previewError) {
      body.push(this.theme.fg("error", this.previewError));
    } else if (this.previewLoading) {
      body.push(this.theme.fg("warning", "loading preview…"));
    } else if (this.previewLines.length === 0) {
      body.push(this.theme.fg("dim", "Select a result to preview the session."));
    } else {
      for (const line of this.previewLines) {
        const styled = line.startsWith("user:")
          ? this.theme.fg("accent", line)
          : line.startsWith("assistant:")
            ? line
            : this.theme.fg("muted", line);
        body.push(...wrapTextWithAnsi(styled, contentWidth));
      }
    }

    const innerHeight = Math.max(1, height - 2);
    while (body.length < innerHeight) body.push("");

    const lines: string[] = [this.topBorder(width, "Preview")];
    for (const line of body.slice(0, innerHeight)) lines.push(this.boxLine(line, width));
    lines.push(this.bottomBorder(width));
    return lines;
  }

  private move(delta: number) {
    if (this.results.length === 0) return;

    const now = Date.now();
    const previousNav = this.lastNavigation;
    const wasLikelyHolding =
      previousNav?.delta === delta &&
      now - previousNav.timestamp < this.options.config.navigationWrapQuietMs;
    const next = this.selected + delta;

    if (next < 0) {
      this.handleEdgeNavigation("top", wasLikelyHolding, now);
    } else if (next >= this.results.length) {
      this.handleEdgeNavigation("bottom", wasLikelyHolding, now);
    } else {
      this.edgeLatch = undefined;
      this.selected = next;

      // If deliberate, non-repeat navigation lands on an edge, prime that edge so the
      // next outward press wraps immediately. Holding a key down does not prime it.
      if (!wasLikelyHolding && this.isAtEdge()) {
        this.edgeLatch = {
          edge: this.selected === 0 ? "top" : "bottom",
          timestamp: now - this.options.config.navigationWrapQuietMs,
        };
      }
    }

    this.lastNavigation = { delta, timestamp: now };
    this.schedulePreview();
    this.options.requestRender();
  }

  private handleEdgeNavigation(edge: "top" | "bottom", wasLikelyHolding: boolean, now: number) {
    const quietMs = this.options.config.navigationWrapQuietMs;
    const previous = this.edgeLatch;
    const hasBeenIdle = !this.lastNavigation || now - this.lastNavigation.timestamp >= quietMs;

    if (
      !wasLikelyHolding &&
      (hasBeenIdle || (previous?.edge === edge && now - previous.timestamp >= quietMs))
    ) {
      this.selected = edge === "top" ? this.results.length - 1 : 0;
      this.edgeLatch = undefined;
      return;
    }

    this.edgeLatch = { edge, timestamp: now };
    this.selected = edge === "top" ? 0 : this.results.length - 1;
  }

  private isAtEdge(): boolean {
    return this.selected === 0 || this.selected === this.results.length - 1;
  }

  private scheduleSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const queryLength = this.query.trim().length;
    this.loading = queryLength >= this.options.config.minQueryLength;
    this.error = undefined;
    this.selected = 0;
    this.edgeLatch = undefined;
    this.lastNavigation = undefined;
    if (queryLength < this.options.config.minQueryLength) {
      this.results = [];
      this.searchGeneration++;
      this.schedulePreview();
      this.options.requestRender();
      return;
    }
    this.schedulePreview();
    this.options.requestRender();

    const generation = ++this.searchGeneration;
    this.searchTimer = setTimeout(async () => {
      const response = await searchSessions({
        sessionsDir: this.options.sessionsDir,
        query: this.query,
        currentSessionFile: this.options.currentSessionFile,
        maxResults: this.options.config.maxResults,
        maxTextLength: this.options.config.maxResultTextLength,
        minQueryLength: this.options.config.minQueryLength,
        scope: this.searchScope(),
        filterMode: this.filterMode,
      });
      if (generation !== this.searchGeneration) return;
      this.results = response.results;
      this.selected = 0;
      this.loading = false;
      this.error = response.ok ? undefined : response.error;
      this.schedulePreview();
      this.options.requestRender();
    }, 120);
  }

  private schedulePreview() {
    const picked = this.results[this.selected];
    const generation = ++this.previewGeneration;

    if (!this.previewOpen || !picked) {
      this.previewFile = undefined;
      this.previewLines = [];
      this.previewLoading = false;
      this.previewError = undefined;
      return;
    }

    if (this.previewFile === picked.file && (this.previewLines.length > 0 || this.previewLoading))
      return;

    this.previewFile = picked.file;
    this.previewLines = [];
    this.previewLoading = true;
    this.previewError = undefined;
    this.options.requestRender();

    void buildSessionPreview(picked.file, {
      maxMessages: this.options.config.maxPreviewMessages,
      maxCharsPerMessage: this.options.config.maxPreviewCharsPerMessage,
    })
      .then((lines) => {
        if (generation !== this.previewGeneration) return;
        this.previewLines = lines;
        this.previewLoading = false;
        this.options.requestRender();
      })
      .catch((error: unknown) => {
        if (generation !== this.previewGeneration) return;
        this.previewLines = [];
        this.previewLoading = false;
        this.previewError = error instanceof Error ? error.message : String(error);
        this.options.requestRender();
      });
  }

  private renderPrompt(): string {
    const before = this.query.slice(0, this.cursor);
    const at = this.query[this.cursor] ?? " ";
    const after = this.query.slice(this.cursor + (this.cursor < this.query.length ? 1 : 0));
    return `${this.theme.fg("accent", "> ")}${before}${this.theme.bg("selectedBg", at)}${after}`;
  }

  private clampCursor(value: number): number {
    return Math.max(0, Math.min(this.query.length, value));
  }

  private moveCursorByWord(delta: number): number {
    if (delta < 0) {
      let i = this.cursor;
      while (i > 0 && /\s/.test(this.query[i - 1]!)) i--;
      while (i > 0 && !/\s/.test(this.query[i - 1]!)) i--;
      return i;
    }

    let i = this.cursor;
    while (i < this.query.length && !/\s/.test(this.query[i]!)) i++;
    while (i < this.query.length && /\s/.test(this.query[i]!)) i++;
    return i;
  }

  private searchScope(): SearchScope {
    return this.scopeMode === "global"
      ? { type: "global" }
      : { type: "cwd", cwd: this.options.cwd };
  }

  private scopeLabel(): string {
    return this.scopeMode === "global" ? "global history" : `current cwd (${this.options.cwd})`;
  }

  private highlight(text: string, terms: string[] = []): string {
    const cleaned = cleanText(text);
    const needles = terms.length > 0 ? terms : [this.query.trim()];
    const matches = needles
      .filter(Boolean)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (matches.length === 0) return cleaned;

    const regex = new RegExp(`(${matches.join("|")})`, "ig");
    return cleaned.replace(regex, (match) =>
      this.theme.bg("selectedBg", this.theme.fg("accent", this.theme.bold(match))),
    );
  }

  private topBorder(width: number, title: string): string {
    const label = ` ${title} `;
    const labelWidth = visibleWidth(label);
    const available = Math.max(0, width - 2 - labelWidth);
    const left = Math.floor(available / 2);
    const right = available - left;
    return `${this.theme.fg("border", `┌${"─".repeat(left)}`)}${this.theme.fg("accent", label)}${this.theme.fg("border", `${"─".repeat(right)}┐`)}`;
  }

  private bottomBorder(width: number): string {
    return this.theme.fg("border", `└${"─".repeat(Math.max(0, width - 2))}┘`);
  }

  private boxLine(content: string, width: number): string {
    const innerWidth = Math.max(0, width - 4);
    const truncated = truncateToWidth(content, innerWidth);
    const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
    return `${this.theme.fg("border", "│ ")}${truncated}${padding}${this.theme.fg("border", " │")}`;
  }

  private get theme(): ScrollTheme {
    return this.options.theme;
  }
}
