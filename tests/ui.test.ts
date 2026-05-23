import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { ScrollSearchComponent, type ScrollTheme } from "../src/ui.ts";

const theme: ScrollTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

function component() {
  return new ScrollSearchComponent({
    theme,
    done: () => {},
    requestRender: () => {},
    sessionsDir: "/sessions",
    cwd: "/cwd",
    config: { ...defaultConfig, heightRatio: 0.8 },
  });
}

describe("scroll ui", () => {
  it("supports basic query editing", () => {
    const ui = component();
    ui.handleInput("a");
    ui.handleInput("b");
    ui.handleInput("c");
    ui.handleInput("\x02");
    ui.handleInput("\x17");
    expect(ui.query).toBe("c");
    expect(ui.cursor).toBe(0);
  });

  it("does not wrap while navigation keys are repeating at an edge", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const ui = component();
    ui.results = [
      { file: "1", line: 1, firstInput: "one", matchText: "one" },
      { file: "2", line: 1, firstInput: "two", matchText: "two" },
    ];

    ui.handleInput("\x0e");
    expect(ui.selected).toBe(1);
    vi.advanceTimersByTime(50);
    ui.handleInput("\x0e");
    expect(ui.selected).toBe(1);

    vi.advanceTimersByTime(defaultConfig.navigationWrapQuietMs + 1);
    ui.handleInput("\x0e");
    expect(ui.selected).toBe(0);
    vi.useRealTimers();
  });

  it("wraps immediately from an idle edge", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const ui = component();
    ui.results = [
      { file: "1", line: 1, firstInput: "one", matchText: "one" },
      { file: "2", line: 1, firstInput: "two", matchText: "two" },
    ];

    ui.handleInput("\x10");
    expect(ui.selected).toBe(1);
    vi.useRealTimers();
  });

  it("renders a preview pane on wide terminals", () => {
    const ui = component();
    const lines = ui.render(140);
    expect(lines.join("\n")).toContain("Preview");
  });

  it("toggles preview with ctrl-o", () => {
    const ui = component();
    expect(ui.render(140).join("\n")).toContain("Preview");
    ui.handleInput("\x0f");
    expect(ui.render(140).join("\n")).not.toContain("Preview");
  });
});
