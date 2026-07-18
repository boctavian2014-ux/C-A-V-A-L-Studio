import { app, session, shell, type Session } from "electron";

import { isSafeExternalUrl } from "./ipc-trust";

export const CAVALLO_RENDERER_WEB_PREFERENCES_BASE = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const;

export const CAVALLO_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:*",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
].join("; ");

export function getRendererWebPreferences(preloadPath: string) {
  return {
    preload: preloadPath,
    ...CAVALLO_RENDERER_WEB_PREFERENCES_BASE,
  };
}

export function installRendererSessionPolicy(sess: Session = session.defaultSession): void {
  sess.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  sess.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CAVALLO_CSP],
      },
    });
  });
}

export function installWebContentsSecurity(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, navigationUrl) => {
      try {
        const parsed = new URL(navigationUrl);
        if (parsed.protocol === "file:" || parsed.protocol === "app:" || parsed.protocol === "caval:") {
          return;
        }
      } catch {
        /* block */
      }
      event.preventDefault();
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    contents.on("will-attach-webview", (event, webPreferences) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
    });
  });
}
