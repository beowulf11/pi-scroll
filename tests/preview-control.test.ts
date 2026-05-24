import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { ScrollSearchComponent, type ScrollTheme } from "../src/ui.ts";

const theme: ScrollTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

describe("preview control sequences", () => {
  it("strips OSC terminal integration sequences from preview component output", () => {
    const ui = new ScrollSearchComponent({
      theme,
      done: () => {},
      requestRender: () => {},
      sessionsDir: "/sessions",
      cwd: "/cwd",
      config: { ...defaultConfig, preview: true, previewMinWidth: 1 },
    });

    ui.previewComponent = {
      render: () => ["\x1b]133;A\x07user text\x1b]133;B\x07"],
      invalidate: () => {},
    };

    const rendered = ui.render(120).join("\n");
    expect(rendered).toContain("user text");
    expect(rendered).not.toContain("\x1b]133");
  });
});
