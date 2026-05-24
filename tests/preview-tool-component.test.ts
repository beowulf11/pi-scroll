import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildSessionPreviewComponent } from "../src/preview-renderer.ts";

describe("preview compact tool rendering", () => {
  it("keeps tool output compact even when a TUI is available", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-preview-tool-component-"));
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Checking package status" },
              {
                type: "toolCall",
                id: "call_1",
                name: "bash",
                arguments: { command: "node - <<'NODE'" },
              },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "toolResult",
            toolCallId: "call_1",
            toolName: "bash",
            content: [{ type: "text", text: '{\n  "name": "pi-scroll"\n}' }],
          },
        }),
      ].join("\n"),
    );

    const preview = await buildSessionPreviewComponent(file, {
      maxEntries: 10,
      tui: { requestRender: vi.fn() } as any,
      cwd: "/cwd",
    });
    const rendered = preview.render(100).join("\n");

    expect(rendered).toContain("Checking package status");
    expect(rendered).not.toContain("[toolCall]");
    expect(rendered).not.toContain('tool:bash {"command":"node - <<\'NODE\'"}');
    expect(rendered).toContain("bash");
    expect(rendered).toContain('"name": "pi-scroll"');
  });
});
