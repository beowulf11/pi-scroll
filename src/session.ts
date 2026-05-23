export type SessionMeta = {
  cwd?: string;
  firstInput: string;
};

export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    else if (b.type === "toolCall") {
      const args = b.arguments ? ` ${JSON.stringify(b.arguments)}` : "";
      parts.push(`[toolCall] ${String(b.name ?? "")}${args}`);
    }
  }
  return parts.join(" ");
}

export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseSessionMetaFromText(text: string): SessionMeta {
  const meta: SessionMeta = { firstInput: "(no user input found)" };
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (i === 0 && entry.type === "session") meta.cwd = entry.cwd;
    if (entry.type === "message" && entry.message?.role === "user") {
      const firstInput = cleanText(textFromContent(entry.message.content));
      if (firstInput) {
        meta.firstInput = firstInput;
        break;
      }
    }
  }

  return meta;
}
