export default {
  resolve: {
    alias: {
      "@earendil-works/pi-tui": new URL("./tests/stubs/pi-tui.ts", import.meta.url).pathname,
    },
  },
};
