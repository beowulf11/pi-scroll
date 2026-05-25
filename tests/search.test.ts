import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRipgrepArgs,
  clearMetaCache,
  listRecentSessions,
  parseMatchedJsonlLine,
  searchSessions,
  snippetAroundTerms,
  searchRootForScope,
  sessionDirNameForCwd,
} from "../src/search.ts";

describe("search parsing", () => {
  it("parses a matched JSONL line into a display result", () => {
    clearMetaCache();
    const dir = join(process.cwd(), ".tmp-test-scroll");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({ type: "session", cwd: "/work" }),
        JSON.stringify({
          type: "message",
          id: "u1",
          timestamp: "now",
          message: { role: "user", content: "first input" },
        }),
      ].join("\n"),
    );

    const result = parseMatchedJsonlLine(
      file,
      2,
      JSON.stringify({
        type: "message",
        id: "u1",
        timestamp: "now",
        message: { role: "user", content: "first input" },
      }),
    );

    expect(result).toMatchObject({
      file,
      line: 2,
      entryId: "u1",
      cwd: "/work",
      firstInput: "first input",
      matchText: "first input",
      matchedTerms: [],
      role: "user",
    });
  });

  it("creates snippets around native ripgrep submatch terms", () => {
    expect(snippetAroundTerms("aaa bbb ccc ddd eee", ["ddd"], 9)).toContain("ddd");
  });

  it("falls back to the raw JSONL line when display text does not include the ripgrep match", () => {
    clearMetaCache();
    const dir = join(process.cwd(), ".tmp-test-scroll-fallback");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({ type: "session", cwd: "/work" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "first input" } }),
      ].join("\n"),
    );

    const result = parseMatchedJsonlLine(
      file,
      2,
      JSON.stringify({
        type: "message",
        id: "a1",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "bash" }],
          hidden: "needle",
        },
      }),
      120,
      ["needle"],
    );

    expect(result?.matchText).toContain("needle");
  });

  it("filters tool-only assistant matches in chat mode", () => {
    clearMetaCache();
    const dir = join(process.cwd(), ".tmp-test-scroll-filter");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({ type: "session", cwd: "/work" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "first input" } }),
      ].join("\n"),
    );

    const raw = JSON.stringify({
      type: "message",
      id: "a1",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "bash", arguments: { command: "needle" } }],
      },
    });

    expect(parseMatchedJsonlLine(file, 2, raw, 120, ["needle"], "chat")).toBeNull();
    expect(parseMatchedJsonlLine(file, 2, raw, 120, ["needle"], "all")?.matchText).toContain(
      "needle",
    );
  });

  it("builds ripgrep args for fixed and regex modes with max-count", () => {
    expect(
      buildRipgrepArgs({
        query: "a.b",
        searchRoot: "/sessions",
        searchMode: "fixed",
        maxCount: 10,
      }),
    ).toContain("--fixed-strings");
    const regexArgs = buildRipgrepArgs({
      query: "a.*b",
      searchRoot: "/sessions",
      searchMode: "regex",
      maxCount: 10,
    });
    expect(regexArgs).not.toContain("--fixed-strings");
    expect(regexArgs).toEqual(expect.arrayContaining(["--max-count", "10"]));
  });

  it("maps cwd to Pi's session directory naming scheme", () => {
    expect(sessionDirNameForCwd("/Users/beowulf/code/personal/pi/scroll")).toBe(
      "--Users-beowulf-code-personal-pi-scroll--",
    );
    expect(searchRootForScope("/sessions", { type: "cwd", cwd: "/tmp/project" })).toBe(
      "/sessions/--tmp-project--",
    );
  });

  it("lists recent sessions for empty-query history browsing", async () => {
    clearMetaCache();
    const dir = join(process.cwd(), ".tmp-test-scroll-list");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "one.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({ type: "session", cwd: "/work" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "first input" } }),
      ].join("\n"),
    );

    const results = await listRecentSessions({ sessionsDir: dir });

    expect(results[0]).toMatchObject({
      file,
      line: 1,
      cwd: "/work",
      firstInput: "first input",
      role: "session",
    });
  });
});

describe("ripgrep backend", () => {
  it("finds a matching session on the fly when rg is available", async () => {
    const dir = join(process.cwd(), ".tmp-test-scroll-rg");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "one.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({ type: "session", cwd: "/work" }),
        JSON.stringify({
          type: "message",
          id: "u1",
          message: { role: "user", content: "find unique needle" },
        }),
      ].join("\n"),
    );

    const response = await searchSessions({ sessionsDir: dir, query: "unique needle" });
    if (!response.ok && response.error.includes("ripgrep")) return;

    expect(response.ok).toBe(true);
    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.file).toBe(file);
  });
});
