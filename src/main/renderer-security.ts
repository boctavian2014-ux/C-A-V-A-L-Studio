import { app, session, type Session } from "electron";

import { isAllowedWorkbenchNavigation } from "./external-url-policy";

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

/**
 * Lot C4: never auto-open external URLs from window.open.
 * External links must go through engineering:openExternal (EXTERNAL_CONTENT) or other policy paths.
 */
export function installWebContentsSecurity(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, navigationUrl) => {
      if (isAllowedWorkbenchNavigation(navigationUrl)) {
        return;
      }
      event.preventDefault();
    });

    contents.setWindowOpenHandler(() => {
      // Always deny — no shell.openExternal here (phishing vector from AI/content).
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
