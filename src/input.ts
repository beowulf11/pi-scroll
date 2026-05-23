import { Key, matchesKey } from "@earendil-works/pi-tui";

export type ScrollInputAction =
  | { type: "cancel" }
  | { type: "select" }
  | { type: "scope" }
  | { type: "preview" }
  | { type: "filter" }
  | { type: "move"; delta: number }
  | { type: "cursor"; delta: number; word?: boolean }
  | { type: "cursorStart" }
  | { type: "cursorEnd" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "deleteWordBackward" }
  | { type: "deleteWordForward" }
  | { type: "deleteToStart" }
  | { type: "deleteToEnd" }
  | { type: "insert"; text: string }
  | { type: "noop" };

export function interpretScrollInput(data: string): ScrollInputAction {
  if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return { type: "cancel" };
  if (matchesKey(data, Key.ctrl("g"))) return { type: "scope" };
  if (matchesKey(data, Key.ctrl("o"))) return { type: "preview" };
  if (matchesKey(data, Key.ctrl("t"))) return { type: "filter" };
  if (matchesKey(data, Key.enter)) return { type: "select" };

  if (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("n"))) {
    return { type: "move", delta: 1 };
  }

  if (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("p"))) {
    return { type: "move", delta: -1 };
  }

  if (matchesKey(data, Key.ctrl("a"))) return { type: "cursorStart" };
  if (matchesKey(data, Key.ctrl("e"))) return { type: "cursorEnd" };
  if (matchesKey(data, Key.left) || matchesKey(data, Key.ctrl("b")))
    return { type: "cursor", delta: -1 };
  if (matchesKey(data, Key.right) || matchesKey(data, Key.ctrl("f")))
    return { type: "cursor", delta: 1 };
  if (matchesKey(data, Key.ctrl("left")) || matchesKey(data, Key.alt("b"))) {
    return { type: "cursor", delta: -1, word: true };
  }
  if (matchesKey(data, Key.ctrl("right")) || matchesKey(data, Key.alt("f"))) {
    return { type: "cursor", delta: 1, word: true };
  }

  if (matchesKey(data, Key.ctrl("u"))) return { type: "deleteToStart" };
  if (matchesKey(data, Key.ctrl("k"))) return { type: "deleteToEnd" };
  if (matchesKey(data, Key.ctrl("w"))) return { type: "deleteWordBackward" };
  if (matchesKey(data, Key.alt("d"))) return { type: "deleteWordForward" };
  if (matchesKey(data, Key.backspace)) return { type: "backspace" };
  if (matchesKey(data, Key.delete)) return { type: "delete" };

  if (data.length === 1 && data >= " " && data !== "\x7f") return { type: "insert", text: data };

  return { type: "noop" };
}
