import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

describe("preview tool result errors", () => {
  it("uses an error background for failed tool results", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-tool-error-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      JSON.stringify({
        type: "message",
        message: {
          role: "toolResult",
          toolName: "bash",
          isError: true,
          content: [{ type: "text", text: "Command failed" }],
        },
      }),
    );

    const preview = await buildSessionPreviewComponent(file, { maxEntries: 10 });
    const rendered = preview.render(80).join("\n");
    expect(rendered).toContain("bash");
    expect(rendered).toContain("Command failed");
    expect(rendered).toContain("\x1b[48;2;46;30;30m");
  });
});
