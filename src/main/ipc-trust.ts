import { shell, type IpcMainInvokeEvent, type WebContents, type WebFrameMain } from "electron";

const TRUSTED_PROTOCOLS = new Set(["file:", "app:", "caval:"]);

export const STRIPE_CHECKOUT_HOSTS = [
  "checkout.stripe.com",
  "billing.stripe.com",
  "pay.stripe.com",
];

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

export function isSafeExternalUrl(url: string, allowedHosts?: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (allowedHosts && allowedHosts.length > 0) {
    return allowedHosts.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  }

  return true;
}

export async function openSafeExternalUrl(
  url: string,
  allowedHosts?: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isSafeExternalUrl(url, allowedHosts)) {
    return { ok: false, error: "URL blocked by security policy." };
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
