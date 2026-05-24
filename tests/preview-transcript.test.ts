import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

describe("preview transcript rendering", () => {
  it("keeps visible thinking and inserts spacing between transcript entries", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-transcript-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Inspecting TODO for updates" },
              { type: "text", text: "Visible final answer" },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "Plus read TODO" }] },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "This should not show" },
              { type: "toolCall", name: "read", arguments: { path: "TODO.md" } },
            ],
          },
        }),
      ].join("\n"),
    );

    const preview = await buildSessionPreviewComponent(file, { maxEntries: 10, chunkBytes: 64 });
    const rendered = preview.render(100).join("\n");

    expect(rendered).toContain("Visible final answer");
    expect(rendered).toContain("Plus read TODO");
    expect(rendered).toContain("Inspecting TODO");
    expect(rendered).toContain("This should not show");
    expect(rendered).toContain("\n\n");
  });
});
