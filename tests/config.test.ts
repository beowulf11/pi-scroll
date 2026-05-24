import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, loadScrollConfig } from "../src/config.ts";

describe("scroll config", () => {
  it("defaults preview to enabled", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-scroll-config-"));
    expect(loadScrollConfig(join(root, "agent"), join(root, "project")).preview).toBe(true);
  });

  it("loads user config over defaults", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-scroll-config-"));
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "pi-scroll.json"), JSON.stringify({ preview: false }));

    expect(loadScrollConfig(agentDir, cwd)).toEqual({ ...defaultConfig, preview: false });
  });

  it("loads project config over user config", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-scroll-config-"));
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(agentDir, "pi-scroll.json"), JSON.stringify({ preview: false }));
    writeFileSync(join(cwd, ".pi", "pi-scroll.json"), JSON.stringify({ preview: true }));

    expect(loadScrollConfig(agentDir, cwd).preview).toBe(true);
  });
});
