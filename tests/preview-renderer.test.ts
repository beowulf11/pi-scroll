import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

describe("preview renderer", () => {
  it("renders session messages using Pi component adapters", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({ type: "session", cwd: "/work" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "hello" } }),
        JSON.stringify({
          type: "message",
          message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
        }),
      ].join("\n"),
    );

    const component = await buildSessionPreviewComponent(file);
    const rendered = component.render(80).join("\n");
    expect(rendered).toContain("user: hello");
    expect(rendered).toContain("assistant: hi");
  });
});
