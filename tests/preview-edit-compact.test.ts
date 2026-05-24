import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

describe("preview edit compaction", () => {
  it("does not render full edit diffs from tool result details", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-edit-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      JSON.stringify({
        type: "message",
        message: {
          role: "toolResult",
          toolName: "edit",
          content: [{ type: "text", text: "Successfully replaced 1 block(s) in README.md." }],
          details: {
            diff: "--- README.md\n+++ README.md\n- old\n+ new\n".repeat(100),
            patch: "--- README.md\n+++ README.md\n- old\n+ new\n".repeat(100),
          },
        },
      }),
    );

    const preview = await buildSessionPreviewComponent(file, { maxEntries: 10 });
    const rendered = preview.render(100).join("\n");

    expect(rendered).toContain("edit");
    expect(rendered).toContain("Successfully replaced 1 block(s) in README.md.");
    expect(rendered).not.toContain("--- README.md");
    expect(rendered).not.toContain("+++ README.md");
  });
});
