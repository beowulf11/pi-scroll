import { describe, expect, it } from "vitest";
import { cleanText, parseSessionMetaFromText, textFromContent } from "../src/session.ts";

describe("session text helpers", () => {
  it("extracts text blocks from Pi message content arrays", () => {
    expect(
      textFromContent([
        { type: "text", text: "hello" },
        { type: "image", data: "..." },
      ]),
    ).toBe("hello");
  });

  it("normalizes whitespace", () => {
    expect(cleanText(" hello\n\t world  ")).toBe("hello world");
  });

  it("extracts cwd and first user input from a JSONL session", () => {
    const jsonl = [
      JSON.stringify({ type: "session", cwd: "/tmp/project" }),
      JSON.stringify({
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "ignored" }] },
      }),
      JSON.stringify({
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "first prompt" }] },
      }),
    ].join("\n");

    expect(parseSessionMetaFromText(jsonl)).toEqual({
      cwd: "/tmp/project",
      firstInput: "first prompt",
    });
  });
});
