import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { ScrollSearchComponent, type ScrollTheme } from "../src/ui.ts";

const theme: ScrollTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

function makeUi() {
  return new ScrollSearchComponent({
    theme,
    done: () => {},
    requestRender: () => {},
    sessionsDir: "/sessions",
    cwd: "/cwd",
    config: { ...defaultConfig, preview: true, previewMinWidth: 1 },
  });
}

describe("preview focus", () => {
  it("does not edit the query while preview is focused", () => {
    const ui = makeUi();
    ui.query = "abc";
    ui.cursor = 3;

    ui.handleInput("\t");
    ui.handleInput("x");
    ui.handleInput("\x7f");

    expect(ui.query).toBe("abc");
    expect(ui.cursor).toBe(3);
  });

  it("scrolls the preview by half pages with Ctrl+D and Ctrl+U even when results are focused", () => {
    const ui = makeUi();
    ui.previewComponent = {
      render: () => Array.from({ length: 80 }, (_, i) => `line ${i + 1}`),
      invalidate: () => {},
    };

    ui.render(120);
    ui.handleInput("\x04");
    const down = ui.render(120).join("\n");
    expect(down).toContain("line 11");

    ui.handleInput("\x15");
    const up = ui.render(120).join("\n");
    expect(up).toContain("line 1");
  });

  it("uses Ctrl+D and Ctrl+U for editing when preview is closed", () => {
    const ui = makeUi();
    ui.handleInput("\x0f");
    ui.query = "abcd";
    ui.cursor = 1;

    ui.handleInput("\x04");
    expect(ui.query).toBe("acd");

    ui.cursor = 2;
    ui.handleInput("\x15");
    expect(ui.query).toBe("d");
    expect(ui.cursor).toBe(0);
  });
});
