import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

const renameSession =
  "/Users/beowulf/.pi/agent/sessions/--Users-beowulf-code-personal-pi-scroll--/2026-05-23T23-06-45-055Z_019e5717-4bbf-7399-a533-f792b9ebc1e4.jsonl";

const maybeIt = existsSync(renameSession) ? it : it.skip;

describe("real pi-scroll rename session preview", () => {
  maybeIt("can load to the actual end and keeps edit tools compact", async () => {
    const preview = await buildSessionPreviewComponent(renameSession, {
      maxEntries: 5,
      chunkBytes: 2048,
    });

    for (let i = 0; i < 200 && preview.hasMore; i++) {
      await preview.loadMore();
    }

    const rendered = preview.render(120).join("\n");
    expect(preview.hasMore).toBe(false);
    expect(rendered).toContain("Can we please rename our package");
    expect(rendered).toContain("Updating README for preview renderer");
    expect(rendered).toContain("Successfully replaced 6 block(s) in README.md.");
    expect(rendered).not.toContain("--- README.md");
    expect(rendered).not.toContain("+++ README.md");
  });
});
