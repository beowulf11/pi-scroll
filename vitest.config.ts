export default {
  resolve: {
    alias: {
      "@earendil-works/pi-tui": new URL("./tests/stubs/pi-tui.ts", import.meta.url).pathname,
      "@earendil-works/pi-coding-agent": new URL(
        "./tests/stubs/pi-coding-agent.ts",
        import.meta.url,
      ).pathname,
    },
  },
};
