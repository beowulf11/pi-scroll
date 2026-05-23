import { describe, expect, it } from "vitest";
import { snippetAroundTerms } from "../src/search.ts";

describe("result match snippet panning", () => {
  it("keeps the match visible when rendering into a narrow result line", () => {
    const text = `${"prefix ".repeat(20)}needle ${"suffix ".repeat(20)}`;
    const snippet = snippetAroundTerms(text, ["needle"], 40);

    expect(snippet).toContain("needle");
    expect(snippet.startsWith("…")).toBe(true);
  });
});
