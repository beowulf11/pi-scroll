import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { ScrollSearchComponent, type ScrollTheme } from "../src/ui.ts";

const theme: ScrollTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

describe("preview UI lazy loading", () => {
  it("attempts loading at the bottom even when stale hasMore is false", async () => {
    let entries = 1;
    let requested = 0;
    const ui = new ScrollSearchComponent({
      theme,
      done: () => {},
      requestRender: () => {
        requested++;
      },
      sessionsDir: "/sessions",
      cwd: "/cwd",
      config: { ...defaultConfig, preview: true, previewMinWidth: 1 },
    });

    ui.previewComponent = {
      get hasMore() {
        return false;
      },
      get loadingMore() {
        return false;
      },
      get loadedEntries() {
        return entries;
      },
      async loadMore() {
        entries++;
      },
      invalidate() {},
      render() {
        return Array.from({ length: entries * 30 }, (_, index) => `line ${index + 1}`);
      },
    };

    (ui as any).activePane = "preview";
    (ui as any).previewScroll = 20;
    ui.render(120);
    await Promise.resolve();

    expect(entries).toBe(2);
    expect(requested).toBeGreaterThan(0);
  });
});
