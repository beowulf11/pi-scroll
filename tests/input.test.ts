import { describe, expect, it } from "vitest";
import { interpretScrollInput } from "../src/input.ts";

describe("scroll input", () => {
  it("maps printable characters to insert actions", () => {
    expect(interpretScrollInput("a")).toEqual({ type: "insert", text: "a" });
  });

  it("maps enter to select", () => {
    expect(interpretScrollInput("\r")).toEqual({ type: "select" });
  });

  it("maps ctrl-g to scope toggle", () => {
    expect(interpretScrollInput("\x07")).toEqual({ type: "scope" });
  });

  it("maps ctrl-o to preview toggle", () => {
    expect(interpretScrollInput("\x0f")).toEqual({ type: "preview" });
  });

  it("maps ctrl-t to filter toggle", () => {
    expect(interpretScrollInput("\x14")).toEqual({ type: "filter" });
  });

  it("maps ctrl-e to cursor end", () => {
    expect(interpretScrollInput("\x05")).toEqual({ type: "cursorEnd" });
  });

  it("maps ctrl-s and ctrl-r to search mode toggle", () => {
    expect(interpretScrollInput("\x13")).toEqual({ type: "searchMode" });
    expect(interpretScrollInput("\x12")).toEqual({ type: "searchMode" });
  });

  it("maps ctrl-v to word deletion", () => {
    expect(interpretScrollInput("\x16")).toEqual({ type: "deleteWordBackward" });
  });
});
