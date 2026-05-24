import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ScrollFilterMode, type ScrollSearchMode } from "./config.ts";
import {
  cleanText,
  parseSessionMetaFromText,
  textFromContent,
  type SessionMeta,
} from "./session.ts";

export type SearchResult = {
  file: string;
  line: number;
  entryId?: string;
  timestamp?: string;
  cwd?: string;
  firstInput: string;
  matchText: string;
  matchedTerms: string[];
  role?: string;
  score: number;
  snippetSource: "semantic" | "raw";
};

export type SearchScope = { type: "global" } | { type: "cwd"; cwd: string };

export type SearchOptions = {
  sessionsDir: string;
  query: string;
  currentSessionFile?: string;
  maxResults?: number;
  maxTextLength?: number;
  minQueryLength?: number;
  scope?: SearchScope;
  filterMode?: ScrollFilterMode;
  searchMode?: ScrollSearchMode;
  ripgrepMaxCount?: number;
  signal?: AbortSignal;
};

export type SearchResponse =
  | { ok: true; results: SearchResult[] }
  | { ok: false; error: string; results: SearchResult[] };

const metaCache = new Map<string, SessionMeta>();

export function clearMetaCache() {
  metaCache.clear();
}

function truncatePlain(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function uniqueTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.filter(Boolean).map((term) => term.toLowerCase())));
}

function containsAnyTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function hasToolCallContent(entry: any): boolean {
  const content = entry?.message?.content;
  return Array.isArray(content) && content.some((block) => block?.type === "toolCall");
}

function scoreEntry(entry: any): number {
  if (entry.type === "session_info" || entry.type === "label") return 100;
  if (entry.type === "branch_summary" || entry.type === "compaction") return 70;
  if (entry.type !== "message") return 10;

  const role = entry.message?.role;
  if (role === "user") return 90;
  if (role === "assistant" && hasToolCallContent(entry)) return 25;
  if (role === "assistant") return 65;
  if (role === "toolResult") return 5;
  return 10;
}

function includeEntryForFilter(entry: any, filterMode: ScrollFilterMode): boolean {
  if (filterMode === "all") return true;
  if (entry.type === "session_info" || entry.type === "label") return true;
  if (entry.type === "branch_summary" || entry.type === "compaction") return true;
  if (entry.type !== "message") return false;

  const role = entry.message?.role;
  if (role === "user") return true;
  if (role === "assistant" && !hasToolCallContent(entry)) return true;
  return false;
}

export function snippetAroundTerms(text: string, terms: string[], maxLength: number): string {
  if (text.length <= maxLength) return text;

  const lower = text.toLowerCase();
  const index = terms.reduce((best, term) => {
    const found = lower.indexOf(term.toLowerCase());
    if (found < 0) return best;
    return best < 0 ? found : Math.min(best, found);
  }, -1);

  if (index < 0) return truncatePlain(text, maxLength);

  const half = Math.floor(maxLength / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export function readSessionMeta(file: string): SessionMeta {
  const cached = metaCache.get(file);
  if (cached) return cached;

  let meta: SessionMeta = { firstInput: "(no user input found)" };
  try {
    meta = parseSessionMetaFromText(readFileSync(file, "utf8"));
  } catch {
    // Keep fallback metadata.
  }

  metaCache.set(file, meta);
  return meta;
}

export function parseMatchedJsonlLine(
  file: string,
  lineNumber: number,
  rawLine: string,
  maxTextLength = 800,
  matchedTerms: string[] = [],
  filterMode: ScrollFilterMode = "all",
): SearchResult | null {
  let entry: any;
  try {
    entry = JSON.parse(rawLine);
  } catch {
    return null;
  }

  if (!includeEntryForFilter(entry, filterMode)) return null;

  const meta = readSessionMeta(file);
  let matchText = "";
  let role = entry.type;

  if (entry.type === "message") {
    role = entry.message?.role ?? "message";
    matchText = cleanText(textFromContent(entry.message?.content));
  } else if (entry.type === "compaction" || entry.type === "branch_summary") {
    matchText = cleanText(entry.summary ?? "");
  } else if (entry.type === "session_info") {
    matchText = cleanText(entry.name ?? "");
  } else if (entry.type === "label") {
    matchText = cleanText(entry.label ?? "");
  } else {
    matchText = cleanText(rawLine);
  }

  const terms = uniqueTerms(matchedTerms);
  let snippetSource: SearchResult["snippetSource"] = "semantic";
  if (!matchText || (terms.length > 0 && !containsAnyTerm(matchText, terms))) {
    // rg searches the serialized JSONL line. Sometimes the match is in a field we do not
    // normally display (for example tool-call arguments or metadata). Fall back to the raw
    // line so the displayed snippet always contains the actual ripgrep hit.
    matchText = cleanText(rawLine);
    snippetSource = "raw";
  }

  return {
    file,
    line: lineNumber,
    entryId: entry.id,
    timestamp: entry.timestamp,
    cwd: meta.cwd ? truncatePlain(meta.cwd, maxTextLength) : undefined,
    firstInput: truncatePlain(meta.firstInput, maxTextLength),
    matchText: snippetAroundTerms(matchText, terms, maxTextLength),
    matchedTerms: terms,
    role,
    score: scoreEntry(entry),
    snippetSource,
  };
}

export function defaultSessionsDir(agentDir: string): string {
  return join(agentDir, "sessions");
}

export function sessionDirNameForCwd(cwd: string): string {
  return `--${cwd.replace(/^\/+/, "").replace(/\//g, "-")}--`;
}

export function searchRootForScope(
  sessionsDir: string,
  scope: SearchScope = { type: "global" },
): string {
  if (scope.type === "global") return sessionsDir;
  return join(sessionsDir, sessionDirNameForCwd(scope.cwd));
}

export function buildRipgrepArgs(options: {
  query: string;
  searchRoot: string;
  searchMode: ScrollSearchMode;
  maxCount: number;
}): string[] {
  const args = [
    "-n",
    "--json",
    "-i",
    "--glob",
    "*.jsonl",
    "--max-count",
    String(Math.max(1, options.maxCount)),
  ];
  if (options.searchMode === "fixed") args.push("--fixed-strings");
  args.push(options.query, options.searchRoot);
  return args;
}

export function searchSessions(options: SearchOptions): Promise<SearchResponse> {
  const query = options.query.trim();
  if (query.length < (options.minQueryLength ?? 2))
    return Promise.resolve({ ok: true, results: [] });
  const searchRoot = searchRootForScope(options.sessionsDir, options.scope);
  if (!existsSync(searchRoot)) return Promise.resolve({ ok: true, results: [] });

  if (options.signal?.aborted) return Promise.resolve({ ok: true, results: [] });

  return new Promise((resolve) => {
    const args = buildRipgrepArgs({
      query,
      searchRoot,
      searchMode: options.searchMode ?? "fixed",
      maxCount: options.ripgrepMaxCount ?? 10,
    });
    const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });

    const bestByFile = new Map<string, SearchResult>();
    let settled = false;
    let buffer = "";
    let stderr = "";
    const maxResults = options.maxResults ?? 50;
    const maxTextLength = options.maxTextLength ?? 500;

    function consume(line: string) {
      if (!line) return;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type !== "match") return;

      const data = msg.data;
      const file = data?.path?.text;
      const lineNumber = data?.line_number;
      const rawLine = data?.lines?.text;
      const matchedTerms = Array.isArray(data?.submatches)
        ? data.submatches
            .map((match: { match?: { text?: string } }) => match.match?.text ?? "")
            .filter(Boolean)
        : [query];
      if (!file || typeof rawLine !== "string") return;
      if (options.currentSessionFile && file === options.currentSessionFile) return;

      const result = parseMatchedJsonlLine(
        file,
        lineNumber,
        rawLine,
        maxTextLength,
        matchedTerms,
        options.filterMode ?? "all",
      );
      if (!result) return;

      const previous = bestByFile.get(file);
      if (!previous || result.score > previous.score) bestByFile.set(file, result);
      if (bestByFile.size >= maxResults) child.kill();
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const abort = () => {
      if (settled) return;
      child.kill();
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      if (error.code === "ENOENT") {
        resolve({ ok: false, error: "ripgrep (`rg`) was not found in PATH.", results: [] });
      } else {
        resolve({ ok: false, error: error.message, results: [] });
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) {
        resolve({ ok: true, results: [] });
        return;
      }

      if (buffer) consume(buffer);
      const results = Array.from(bestByFile.values())
        .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line)
        .slice(0, maxResults);
      if (code && code !== 1 && results.length === 0) {
        resolve({ ok: false, error: stderr.trim() || `rg exited with code ${code}`, results });
      } else {
        resolve({ ok: true, results });
      }
    });
  });
}
