export const containers = {
  app: {
    width: "100%",
    minHeight: "100vh"
  },
  page: {
    width: "min(100% - 32px, 1440px)",
    margin: "0 auto"
  },
  panel: {
    width: "min(100%, 420px)",
    minWidth: "320px"
  },
  densePanel: {
    width: "320px"
  }
} as const;
