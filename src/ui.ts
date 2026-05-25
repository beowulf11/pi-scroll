import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type TUI } from "@earendil-works/pi-tui";
import {
  type ScrollConfig,
  type ScrollFilterMode,
  type ScrollScopeMode,
  type ScrollSearchMode,
} from "./config.ts";
import { interpretScrollInput } from "./input.ts";
import { buildSessionPreviewComponent, type LazyPreviewComponent } from "./preview-renderer.ts";
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
  tui?: TUI;
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
  previewComponent: LazyPreviewComponent | undefined;
  previewLoading = false;
  previewError: string | undefined;

  private searchTimer?: NodeJS.Timeout;
  private searchGeneration = 0;
  private previewGeneration = 0;
  private previewFile: string | undefined;
  private scopeMode: ScrollScopeMode;
  private filterMode: ScrollFilterMode;
  private searchMode: ScrollSearchMode;
  private previewOpen: boolean;
  private activePane: "results" | "preview" = "results";
  private helpOpen = false;
  private previewScroll = 0;
  private previewViewportHeight = 1;
  private searchAbortController?: AbortController;
  private edgeLatch: { edge: "top" | "bottom"; timestamp: number } | undefined;
  private lastNavigation: { delta: number; timestamp: number } | undefined;

  constructor(private options: ScrollSearchComponentOptions) {
    this.scopeMode = options.config.defaultScope;
    this.filterMode = options.config.defaultFilterMode;
    this.searchMode = options.config.defaultSearchMode;
    this.previewOpen = options.config.preview;
  }

  invalidate(): void {
    this.cancelActiveSearch();
  }

  render(width: number): string[] {
    const w = Math.max(48, width);
    const targetHeight = Math.max(
      14,
      Math.floor((process.stdout.rows ?? 30) * this.options.config.heightRatio),
    );
    const resultHeight = Math.max(8, targetHeight - 6);

    if (this.helpOpen) {
      const lines = this.renderHelpBox(w, resultHeight + 5);
      lines.push(this.footer(w));
      return lines.map((line) => truncateToWidth(line, w));
    }

    if (this.activePane === "preview" && this.previewOpen) {
      const lines = this.renderPreviewBox(w, resultHeight + 5);
      lines.push(this.footer(w));
      return lines.map((line) => truncateToWidth(line, w));
    }

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

    lines.push(this.footer(w));
    return lines.map((line) => truncateToWidth(line, w));
  }

  handleInput(data: string): void {
    const action = interpretScrollInput(data);

    switch (action.type) {
      case "cancel":
        if (this.helpOpen) {
          this.helpOpen = false;
          this.options.requestRender();
          return;
        }
        this.options.done(null);
        return;
      case "help":
        this.helpOpen = !this.helpOpen;
        this.options.requestRender();
        return;
      case "focusPreview":
        if (!this.previewOpen) this.previewOpen = true;
        this.activePane = this.activePane === "preview" ? "results" : "preview";
        this.schedulePreview();
        this.options.requestRender();
        return;
      case "scope":
        this.scopeMode = this.scopeMode === "global" ? "cwd" : "global";
        this.scheduleSearch({ preserveSelection: true });
        return;
      case "preview":
        this.previewOpen = !this.previewOpen;
        if (!this.previewOpen) this.activePane = "results";
        this.schedulePreview();
        this.options.requestRender();
        return;
      case "filter":
        this.filterMode = this.filterMode === "chat" ? "all" : "chat";
        this.scheduleSearch({ preserveSelection: true });
        return;
      case "searchMode":
        this.searchMode = this.searchMode === "fixed" ? "regex" : "fixed";
        this.scheduleSearch({ preserveSelection: true });
        return;
      case "select": {
        const picked = this.results[this.selected];
        if (picked) this.options.done(picked.file);
        return;
      }
      case "move":
        if (this.activePane === "preview") this.scrollPreview(action.delta);
        else this.move(action.delta);
        return;
      case "previewHalfPage":
        if (this.previewOpen) {
          this.scrollPreview(action.delta * this.previewHalfPageSize());
        } else if (action.delta > 0 && this.cursor < this.query.length) {
          this.query = `${this.query.slice(0, this.cursor)}${this.query.slice(this.cursor + 1)}`;
          this.scheduleSearch();
        }
        return;
      case "ctrlU":
        if (this.previewOpen) this.scrollPreview(-this.previewHalfPageSize());
        else if (this.cursor > 0) {
          this.query = this.query.slice(this.cursor);
          this.cursor = 0;
          this.scheduleSearch();
        }
        return;
      case "cursor":
        if (this.activePane === "preview") return;
        this.cursor = action.word
          ? this.moveCursorByWord(action.delta)
          : this.clampCursor(this.cursor + action.delta);
        this.options.requestRender();
        return;
      case "cursorStart":
        if (this.activePane === "preview") return;
        this.cursor = 0;
        this.options.requestRender();
        return;
      case "cursorEnd":
        if (this.activePane === "preview") return;
        this.cursor = this.query.length;
        this.options.requestRender();
        return;
      case "backspace":
        if (this.activePane === "preview") return;
        if (this.cursor > 0) {
          this.query = `${this.query.slice(0, this.cursor - 1)}${this.query.slice(this.cursor)}`;
          this.cursor--;
          this.scheduleSearch();
        }
        return;
      case "delete":
        if (this.activePane === "preview") return;
        if (this.cursor < this.query.length) {
          this.query = `${this.query.slice(0, this.cursor)}${this.query.slice(this.cursor + 1)}`;
          this.scheduleSearch();
        }
        return;
      case "deleteWordBackward": {
        if (this.activePane === "preview") return;
        const next = this.moveCursorByWord(-1);
        if (next !== this.cursor) {
          this.query = `${this.query.slice(0, next)}${this.query.slice(this.cursor)}`;
          this.cursor = next;
          this.scheduleSearch();
        }
        return;
      }
      case "deleteWordForward": {
        if (this.activePane === "preview") return;
        const next = this.moveCursorByWord(1);
        if (next !== this.cursor) {
          this.query = `${this.query.slice(0, this.cursor)}${this.query.slice(next)}`;
          this.scheduleSearch();
        }
        return;
      }
      case "deleteToStart":
        if (this.activePane === "preview") return;
        if (this.cursor > 0) {
          this.query = this.query.slice(this.cursor);
          this.cursor = 0;
          this.scheduleSearch();
        }
        return;
      case "deleteToEnd":
        if (this.activePane === "preview") return;
        if (this.cursor < this.query.length) {
          this.query = this.query.slice(0, this.cursor);
          this.scheduleSearch();
        }
        return;
      case "insert":
        if (this.activePane === "preview") return;
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
        this.theme.fg(
          "muted",
          `Search scope: ${this.scopeLabel()} • filter: ${this.filterMode} • search: ${this.searchMode}`,
        ),
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
          "Install ripgrep or configure Pi Scroll to point at an available search backend later.",
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
    const title = `Results: ${this.scopeMode === "global" ? "Global" : "CWD"} / ${this.filterMode} / ${this.searchMode}`;
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
    } else if (!this.previewComponent) {
      body.push(this.theme.fg("dim", "Select a result to preview the session."));
    } else {
      body.push(
        ...this.previewComponent.render(contentWidth).map((line) => this.sanitizePreviewLine(line)),
      );
    }

    const innerHeight = Math.max(1, height - 2);
    this.previewViewportHeight = innerHeight;
    if (this.previewComponent?.loadingMore) {
      body.push(this.theme.fg("warning", "loading more preview…"));
    }
    const maxScroll = Math.max(0, body.length - innerHeight);
    this.previewScroll = Math.max(0, Math.min(this.previewScroll, maxScroll));
    this.maybeLoadMorePreview(body.length, innerHeight);
    const visibleBody = body.slice(this.previewScroll, this.previewScroll + innerHeight);
    while (visibleBody.length < innerHeight) visibleBody.push("");

    const scrollSuffix =
      maxScroll > 0
        ? ` ${this.previewScroll + 1}-${Math.min(body.length, this.previewScroll + innerHeight)}/${body.length}`
        : "";
    const title = `${this.activePane === "preview" ? "▶ " : ""}Preview${scrollSuffix}`;
    const lines: string[] = [this.topBorder(width, title)];
    for (const line of visibleBody) lines.push(this.boxLine(line, width));
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

  private scrollPreview(delta: number) {
    this.previewScroll = Math.max(0, this.previewScroll + delta);
    this.maybeLoadMorePreview();
    this.options.requestRender();
  }

  private maybeLoadMorePreview(totalLines?: number, viewportHeight?: number) {
    const component = this.previewComponent;
    if (!component || typeof component.loadMore !== "function" || component.loadingMore) return;

    const total = totalLines ?? component.render(Math.max(1, process.stdout.columns ?? 80)).length;
    const viewport = viewportHeight ?? this.previewViewportHeight;
    if (total <= 0) return;

    const visibleEnd = this.previewScroll + viewport;
    const remaining = Math.max(0, total - visibleEnd);
    if (remaining / total > 0.2 && remaining > viewport) return;

    const wasAtLoadedEnd = remaining <= Math.max(1, Math.ceil(viewport * 0.2));
    const renderWidth = Math.max(1, process.stdout.columns ?? 80);

    const loadedBefore = component.loadedEntries;
    void component.loadMore().then(() => {
      if (this.previewComponent !== component) return;
      if (component.loadedEntries === loadedBefore) return;
      if (wasAtLoadedEnd) {
        const nextTotal = component.render(renderWidth).length;
        this.previewScroll = Math.max(0, nextTotal - viewport);
      }
      this.options.requestRender();
    });
    if (component.hasMore) this.options.requestRender();
  }

  private previewHalfPageSize(): number {
    return Math.max(1, Math.floor(this.previewViewportHeight / 2));
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

  private scheduleSearch(options: { preserveSelection?: boolean } = {}) {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.cancelActiveSearch();
    const selectedBeforeSearch = options.preserveSelection
      ? this.results[this.selected]
      : undefined;
    const queryLength = this.query.trim().length;
    this.loading = queryLength >= this.options.config.minQueryLength;
    this.error = undefined;
    if (!options.preserveSelection) this.selected = 0;
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
      const controller = new AbortController();
      this.searchAbortController = controller;
      const response = await searchSessions({
        sessionsDir: this.options.sessionsDir,
        query: this.query,
        currentSessionFile: this.options.currentSessionFile,
        maxResults: this.options.config.maxResults,
        maxTextLength: this.options.config.maxResultTextLength,
        minQueryLength: this.options.config.minQueryLength,
        scope: this.searchScope(),
        filterMode: this.filterMode,
        searchMode: this.searchMode,
        ripgrepMaxCount: this.options.config.ripgrepMaxCount,
        signal: controller.signal,
      });
      if (this.searchAbortController === controller) this.searchAbortController = undefined;
      if (generation !== this.searchGeneration || controller.signal.aborted) return;
      this.results = response.results;
      this.selected = this.selectedIndexAfterSearch(selectedBeforeSearch);
      this.loading = false;
      this.error = response.ok ? undefined : response.error;
      this.schedulePreview();
      this.options.requestRender();
    }, 120);
  }

  private selectedIndexAfterSearch(previous: SearchResult | undefined): number {
    if (this.results.length === 0) return 0;
    if (!previous) return 0;

    const exact = this.results.findIndex(
      (result) => result.file === previous.file && result.line === previous.line,
    );
    if (exact >= 0) return exact;

    const sameSession = this.results.findIndex((result) => result.file === previous.file);
    return sameSession >= 0 ? sameSession : 0;
  }

  private cancelActiveSearch() {
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = undefined;
    }
  }

  private schedulePreview() {
    const picked = this.results[this.selected];
    const generation = ++this.previewGeneration;

    if (!this.previewOpen || !picked) {
      this.previewFile = undefined;
      this.previewComponent = undefined;
      this.previewLoading = false;
      this.previewError = undefined;
      return;
    }

    if (this.previewFile === picked.file && (this.previewComponent || this.previewLoading)) return;

    this.previewFile = picked.file;
    this.previewScroll = 0;
    this.previewComponent = undefined;
    this.previewLoading = true;
    this.previewError = undefined;
    this.options.requestRender();

    void buildSessionPreviewComponent(picked.file, {
      maxEntries: this.options.config.maxPreviewMessages,
      maxUserChars: this.options.config.maxPreviewCharsPerMessage * 10,
      tui: this.options.tui,
      cwd: this.options.cwd,
    })
      .then((component) => {
        if (generation !== this.previewGeneration) return;
        this.previewComponent = component;
        this.previewLoading = false;
        this.options.requestRender();
      })
      .catch((error: unknown) => {
        if (generation !== this.previewGeneration) return;
        this.previewComponent = undefined;
        this.previewLoading = false;
        this.previewError = error instanceof Error ? error.message : String(error);
        this.options.requestRender();
      });
  }

  private renderHelpBox(width: number, height: number): string[] {
    const body = [
      this.theme.bold("Pi Scroll help"),
      "",
      "Search",
      `  Type text                  search live once ${this.options.config.minQueryLength}+ chars`,
      "  Ctrl+R / Ctrl+S           toggle fixed/regex search",
      "  Ctrl+G                    toggle CWD/global scope",
      "  Ctrl+T                    toggle chat/all filter",
      "",
      "Navigation",
      "  ↑/↓ or Ctrl+P/Ctrl+N      move results, or scroll preview when preview is focused",
      "  Ctrl+D / Ctrl+U           scroll preview down/up by half a screen whenever preview is open",
      "  Tab                       focus preview; Tab again returns to results",
      "  Enter                     switch to the selected session",
      "  Ctrl+O                    open/close preview",
      "",
      "Editing",
      "  Ctrl+A / Ctrl+E           start/end of query",
      "  Ctrl+V / Ctrl+W           delete word backward",
      "  Ctrl+D / Ctrl+U           delete under cursor / delete to start when preview is closed",
      "  Ctrl+K                    delete to end",
      "",
      "Other",
      "  Ctrl+H                    toggle this help",
      "  Esc                       close help, or cancel Scroll",
    ];

    const innerHeight = Math.max(1, height - 2);
    while (body.length < innerHeight) body.push("");

    const lines: string[] = [this.topBorder(width, "Help")];
    for (const line of body.slice(0, innerHeight)) lines.push(this.boxLine(line, width));
    lines.push(this.bottomBorder(width));
    return lines;
  }

  private footer(width: number): string {
    const focus = this.activePane === "preview" ? "preview" : "results";
    const text =
      focus === "preview"
        ? "  Ctrl+H help • Tab focus results • ↑/↓ or Ctrl+P/N scroll • Ctrl+D/U half-page • Ctrl+O close preview • Esc cancel"
        : `  Ctrl+H help • Tab focus preview • ↑/↓ move • Ctrl+D/U ${this.previewOpen ? "scroll preview" : "delete"} • Ctrl+G ${this.scopeMode === "global" ? "cwd" : "global"} • Ctrl+T ${this.filterMode === "chat" ? "all" : "chat"} • Ctrl+R ${this.searchMode === "fixed" ? "regex" : "fixed"} • Ctrl+O ${this.previewOpen ? "close" : "open"} • Enter switch • Esc cancel`;
    return truncateToWidth(this.theme.fg("dim", text), width);
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

  private sanitizePreviewLine(line: string): string {
    const esc = String.fromCharCode(27);
    // Pi's normal chat renderer can emit terminal integration escape sequences
    // (notably OSC 133 prompt zones). Those are correct in the main transcript,
    // but inside an overlay preview they can confuse the terminal/TUI diff and
    // leave stale borders/content behind. Keep normal SGR color sequences, strip
    // only OSC/APC-style control payloads.
    return this.normalizeRenderableText(
      line
        .replace(new RegExp(`${esc}\\][^\\u0007]*(?:\\u0007|${esc}\\\\)`, "g"), "")
        .replace(new RegExp(`${esc}_.*?(?:\\u0007|${esc}\\\\)`, "g"), ""),
    );
  }

  private normalizeRenderableText(text: string): string {
    // Raw tabs expand to terminal tab stops after pi-tui has measured/truncated
    // the line, which can make a rendered row wider than the component width.
    // Replace them before any final box padding/truncation.
    return text.replace(/\t/g, "  ");
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
    const normalized = this.normalizeRenderableText(content);
    const truncated = truncateToWidth(normalized, innerWidth);
    const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
    return `${this.theme.fg("border", "│ ")}${truncated}${padding}${this.theme.fg("border", " │")}`;
  }

  private get theme(): ScrollTheme {
    return this.options.theme;
  }
}
