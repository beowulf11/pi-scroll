import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

describe("lazy session preview", () => {
  it("loads preview messages in ordered batches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-lazy-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      Array.from({ length: 5 }, (_, index) =>
        JSON.stringify({
          type: "message",
          message: { role: "user", content: `message ${index + 1}` },
        }),
      ).join("\n"),
    );

    const preview = await buildSessionPreviewComponent(file, { maxEntries: 2, chunkBytes: 32 });
    expect(preview.loadedEntries).toBe(2);
    expect(preview.render(80).join("\n")).toContain("message 2");
    expect(preview.render(80).join("\n")).not.toContain("message 3");

    await preview.loadMore();
    const rendered = preview.render(80).join("\n");
    expect(preview.loadedEntries).toBe(4);
    expect(rendered).toContain("message 3");
    expect(rendered).toContain("message 4");
    expect(rendered).not.toContain("message 5");

    await preview.loadMore();
    expect(preview.loadedEntries).toBe(5);
    expect(preview.hasMore).toBe(false);
    expect(preview.render(80).join("\n")).toContain("message 5");
  });
});
