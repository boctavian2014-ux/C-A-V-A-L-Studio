import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";

const TRUSTED_PROTOCOLS = new Set(["file:", "app:", "caval:"]);

/** Accept only top-level local renderer frames (not remote http/https iframes). */
export function validateTrustedSender(
  contents: WebContents,
  frame?: WebFrameMain | null
): boolean {
  if (contents.isDestroyed()) return false;

  let mainTrusted = false;
  try {
    mainTrusted = TRUSTED_PROTOCOLS.has(new URL(contents.getURL()).protocol);
  } catch {
    mainTrusted = false;
  }
  if (!mainTrusted) return false;

  const target = frame ?? contents.mainFrame;
  if (!target) return true;

  if (target.parent !== null) return false;

  if (!target.url || target.url === "about:blank") {
    return true;
  }

  try {
    return TRUSTED_PROTOCOLS.has(new URL(target.url).protocol);
  } catch {
    return true;
  }
}

export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!validateTrustedSender(event.sender, event.senderFrame)) {
    throw new Error("Untrusted IPC sender");
  }
}

/** Re-exports — Lot C4: single policy lives in external-url-policy.ts */
export {
  STRIPE_CHECKOUT_HOSTS,
  CAVALLO_TRUSTED_HOSTS,
  isSafeExternalUrl,
  openSafeExternalUrl,
  openExternalUrl,
  evaluateExternalUrl,
  parseExternalUrl,
  redactUrlForDisplay,
  isRenderableExternalHref,
  isAllowedWorkbenchNavigation,
  type ExternalUrlOrigin,
} from "./external-url-policy";
