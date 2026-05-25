import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { ScrollSearchComponent, type ScrollTheme } from "../src/ui.ts";

const theme: ScrollTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

describe("scroll chrome", () => {
  it("centers border titles", () => {
    const ui = new ScrollSearchComponent({
      theme,
      done: () => {},
      requestRender: () => {},
      sessionsDir: "/sessions",
      cwd: "/cwd",
      config: { ...defaultConfig, preview: false },
    });

    const border = ui.render(80)[0]!;
    const title = " History: CWD / chat / fixed ";
    const titleStart = border.indexOf(title);
    const left = titleStart - 1;
    const right = border.length - titleStart - title.length - 1;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it("shows result position in the results title, not the input", () => {
    const ui = new ScrollSearchComponent({
      theme,
      done: () => {},
      requestRender: () => {},
      sessionsDir: "/sessions",
      cwd: "/cwd",
      config: { ...defaultConfig, preview: false },
    });
    ui.query = "private";
    ui.results = [
      {
        file: "1",
        line: 1,
        firstInput: "one",
        matchText: "private",
        matchedTerms: ["private"],
        score: 90,
        snippetSource: "semantic",
      },
      {
        file: "2",
        line: 1,
        firstInput: "two",
        matchText: "private",
        matchedTerms: ["private"],
        score: 90,
        snippetSource: "semantic",
      },
    ];

    const lines = ui.render(100);
    expect(lines[0]).toContain(" Results: CWD / chat / fixed (1/2) ");
    expect(lines.at(-2)).not.toContain("1/2");
  });
});
