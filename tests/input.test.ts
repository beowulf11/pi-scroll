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
});
