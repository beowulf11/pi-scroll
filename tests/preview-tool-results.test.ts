import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

describe("preview tool results", () => {
  it("renders compact tool result text in transcript order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-tools-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "Read docs" }] },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Inspecting repo and docs" },
              {
                type: "toolCall",
                id: "call_1",
                name: "web_fetch",
                arguments: { url: "https://pi.dev/docs/latest/extensions" },
              },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "toolResult",
            toolCallId: "call_1",
            toolName: "web_fetch",
            content: [
              {
                type: "text",
                text: "> URL: https://pi.dev/docs/latest/extensions\n> Title: Pi Coding Agent\n\nDocumentation\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          message: { role: "assistant", content: [{ type: "text", text: "Done after docs" }] },
        }),
      ].join("\n"),
    );

    const preview = await buildSessionPreviewComponent(file, { maxEntries: 10, chunkBytes: 32 });
    const rendered = preview.render(100).join("\n");

    expect(rendered).toContain("Read docs");
    expect(rendered).toContain("web_fetch https://pi.dev/docs/latest/extensions");
    expect(rendered).toContain("Title: Pi Coding Agent");
    expect(rendered).not.toContain("> URL:");
    expect(rendered).not.toContain("Browser: chrome");
    expect(rendered).toContain("\x1b[48;2;30;46;30m");
    expect(rendered).toContain("... (tool output compacted)");
    expect(rendered).toContain("Done after docs");
    expect(rendered.indexOf("Read docs")).toBeLessThan(
      rendered.indexOf("Inspecting repo and docs"),
    );
    expect(rendered.indexOf("Inspecting repo and docs")).toBeLessThan(
      rendered.indexOf("web_fetch"),
    );
    expect(rendered.indexOf("web_fetch")).toBeLessThan(rendered.indexOf("Done after docs"));
  });
});
