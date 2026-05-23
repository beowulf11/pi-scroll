import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { loadScrollConfig } from "../src/config.ts";
import { defaultSessionsDir } from "../src/search.ts";
import { ScrollSearchComponent } from "../src/ui.ts";

export default function scrollExtension(pi: ExtensionAPI) {
  pi.registerCommand("scroll", {
    description: "Search Pi session history and switch to a matching session",
    handler: async (_args, ctx) => {
      const agentDir = getAgentDir();
      const config = loadScrollConfig(agentDir, ctx.cwd);
      const currentSessionFile = ctx.sessionManager.getSessionFile();
      const sessionsDir = defaultSessionsDir(agentDir);
      const picked = await ctx.ui.custom<string | null>(
        (tui, theme, _keybindings, done) => {
          const component = new ScrollSearchComponent({
            theme,
            done,
            requestRender: () => tui.requestRender(),
            sessionsDir,
            currentSessionFile,
            cwd: ctx.cwd,
            config,
          });

          return {
            render(width: number) {
              return component.render(width);
            },
            invalidate() {
              component.invalidate();
            },
            handleInput(data: string) {
              component.handleInput(data);
              tui.requestRender();
            },
          };
        },
        {
          overlay: true,
          overlayOptions: {
            width: "90%",
            minWidth: 60,
            maxHeight: `${Math.round(config.heightRatio * 100)}%`,
            anchor: "center",
          },
        },
      );

      if (!picked) return;
      await ctx.switchSession(picked);
    },
  });
}
