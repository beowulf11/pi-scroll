import { readFile } from "node:fs/promises";
import { cleanText, textFromContent } from "./session.ts";

export type PreviewOptions = {
  maxMessages?: number;
  maxCharsPerMessage?: number;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export async function buildSessionPreview(
  file: string,
  options: PreviewOptions = {},
): Promise<string[]> {
  const maxMessages = options.maxMessages ?? 18;
  const maxCharsPerMessage = options.maxCharsPerMessage ?? 260;
  const text = await readFile(file, "utf8");
  const lines: string[] = [];

  for (const rawLine of text.split("\n")) {
    if (!rawLine) continue;

    let entry: any;
    try {
      entry = JSON.parse(rawLine);
    } catch {
      continue;
    }

    if (entry.type === "session") {
      if (entry.cwd) lines.push(`cwd: ${entry.cwd}`);
      continue;
    }

    if (entry.type === "session_info" && entry.name) {
      lines.push(`name: ${entry.name}`);
      continue;
    }

    if (entry.type !== "message") continue;

    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;

    const body = truncate(cleanText(textFromContent(entry.message?.content)), maxCharsPerMessage);
    if (!body) continue;

    lines.push(`${role}: ${body}`);
    if (lines.length >= maxMessages) break;
  }

  return lines.length > 0 ? lines : ["No previewable messages found."];
}
