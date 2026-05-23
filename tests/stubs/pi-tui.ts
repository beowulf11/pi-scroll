export const Key = {
  escape: "escape",
  enter: "enter",
  down: "down",
  up: "up",
  left: "left",
  right: "right",
  backspace: "backspace",
  delete: "delete",
  ctrl: (key: string) => `ctrl+${key}`,
  alt: (key: string) => `alt+${key}`,
};

export function matchesKey(data: string, key: string): boolean {
  const map: Record<string, string> = {
    "\x1b": "escape",
    "\r": "enter",
    "\n": "enter",
    "\x7f": "backspace",
    "\x07": "ctrl+g",
    "\x0e": "ctrl+n",
    "\x0f": "ctrl+o",
    "\x10": "ctrl+p",
    "\x14": "ctrl+t",
    "\x05": "ctrl+e",
    "\x03": "ctrl+c",
    "\x01": "ctrl+a",
    "\x02": "ctrl+b",
    "\x06": "ctrl+f",
    "\x0b": "ctrl+k",
    "\x15": "ctrl+u",
    "\x17": "ctrl+w",
    "\x1bd": "alt+d",
    "\x1bb": "alt+b",
    "\x1bf": "alt+f",
  };
  return (map[data] ?? data) === key;
}

export function visibleWidth(text: string): number {
  return text
    .split(String.fromCharCode(27))
    .join("")
    .replace(/\[[0-9;]*m/g, "").length;
}

export function truncateToWidth(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  return text.slice(0, Math.max(0, width - 1)) + "…";
}

export function wrapTextWithAnsi(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width));
  return out.length ? out : [""];
}
