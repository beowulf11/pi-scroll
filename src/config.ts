import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ScrollScopeMode = "cwd" | "global";
export type ScrollFilterMode = "chat" | "all";
export type ScrollSearchMode = "fixed" | "regex";

export type ScrollConfig = {
  preview: boolean;
  previewMinWidth: number;
  previewRatio: number;
  heightRatio: number;
  maxPreviewMessages: number;
  maxPreviewCharsPerMessage: number;
  defaultScope: ScrollScopeMode;
  defaultFilterMode: ScrollFilterMode;
  defaultSearchMode: ScrollSearchMode;
  minQueryLength: number;
  maxResults: number;
  maxResultTextLength: number;
  ripgrepMaxCount: number;
  navigationWrapQuietMs: number;
};

export const defaultConfig: ScrollConfig = {
  preview: true,
  previewMinWidth: 100,
  previewRatio: 0.58,
  heightRatio: 0.8,
  maxPreviewMessages: 18,
  maxPreviewCharsPerMessage: 260,
  defaultScope: "cwd",
  defaultFilterMode: "chat",
  defaultSearchMode: "fixed",
  minQueryLength: 2,
  maxResults: 50,
  maxResultTextLength: 500,
  ripgrepMaxCount: 10,
  navigationWrapQuietMs: 180,
};

export function loadScrollConfig(agentDir: string, cwd: string): ScrollConfig {
  return {
    ...defaultConfig,
    ...readConfigFile(join(agentDir, "pi-scroll.json")),
    ...readConfigFile(join(cwd, ".pi", "pi-scroll.json")),
  };
}

function readConfigFile(path: string): Partial<ScrollConfig> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<ScrollConfig>;
  } catch {
    return {};
  }
}
