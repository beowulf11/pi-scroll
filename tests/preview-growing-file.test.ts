import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

function userLine(text: string): string {
  return JSON.stringify({ type: "message", message: { role: "user", content: text } });
}

describe("preview growing session files", () => {
  it("can resume loading after reaching EOF if the session file grows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-growing-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(file, `${userLine("first")}\n`);

    const preview = await buildSessionPreviewComponent(file, { maxEntries: 10, chunkBytes: 1024 });
    expect(preview.hasMore).toBe(false);
    expect(preview.render(80).join("\n")).toContain("first");

    appendFileSync(file, `${userLine("second")}\n`);
    await preview.loadMore();

    expect(preview.render(80).join("\n")).toContain("second");
  });
});
