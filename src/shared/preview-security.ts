import path from "node:path";

import { redactSensitiveCommandOutput } from "./command-output-redaction";
import { isPreviewTarget, parsePreviewTarget } from "./preview-contract";
import type {
  CavalPreviewTargetConfig,
  PreviewOpenMode,
  PreviewTarget,
} from "./preview-types";
import { PREVIEW_NOT_CONFIGURED } from "./preview-types";

export { isPreviewTarget, parsePreviewTarget };

const PREVIEW_BINS = new Set(["npm", "npx", "yarn", "pnpm", "bun", "bunx", "expo"]);

const FORBIDDEN_COMMAND_CHARS = /[\n\r\0;|&$`<>^]/;

const FORBIDDEN_FLAGS = new Set([
  "-e",
  "--eval",
  "-c",
  "--command",
  "/c",
  "-command",
  "--encodedcommand",
  "--prefix",
  "--cwd",
  "--script-shell",
  "--userconfig",
  "--global",
  "-g",
  "-C",
]);

const BLOCKED_URL_SCHEMES = new Set([
  "file:",
  "data:",
  "javascript:",
  "vbscript:",
  "blob:",
  "about:",
  "ftp:",
  "ws:",
  "wss:",
]);

const MAX_COMMAND_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const MAX_LOG_CHARS = 24_000;
const MAX_READY_TIMEOUT_MS = 120_000;
const MIN_READY_TIMEOUT_MS = 5_000;
const DEFAULT_READY_TIMEOUT_MS = 45_000;

export function parsePreviewOpenMode(value: unknown): PreviewOpenMode {
  return value === "window" ? "window" : "external";
}

export function isPreviewTargetConfigured(
  target: PreviewTarget,
  config: CavalPreviewTargetConfig | undefined
): boolean {
  if (!config || config.enabled === false) return false;
  const command = config.command?.trim();
  if (!command) return false;
  if (target === "web" && !config.url?.trim()) return false;
  return true;
}

export function previewMissingReason(
  target: PreviewTarget,
  config: CavalPreviewTargetConfig | undefined
): string | undefined {
  if (isPreviewTargetConfigured(target, config)) return undefined;
  return PREVIEW_NOT_CONFIGURED[target];
}

export function clampPreviewReadyTimeoutMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_READY_TIMEOUT_MS;
  }
  return Math.min(MAX_READY_TIMEOUT_MS, Math.max(MIN_READY_TIMEOUT_MS, Math.floor(value)));
}

export function isUncOrSharePath(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("\\\\")) return true;
  if (trimmed.startsWith("//")) return true;
  if (/^[\\/]{2}/.test(trimmed)) return true;
  return false;
}

export function isBlockedPathProtocol(input: string): boolean {
  return /^(file|data|javascript|vbscript|blob|about|ftp):/i.test(input.trim());
}

export function tokenizePreviewCommand(command: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === " " || ch === "\t") {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote) {
    throw new Error("Unclosed quote in preview command");
  }
  if (current) out.push(current);
  return out;
}

export function parsePreviewCommand(command: unknown): { bin: string; args: string[] } {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("Preview command is missing");
  }
  const trimmed = command.trim();
  if (trimmed.length > MAX_COMMAND_LENGTH) {
    throw new Error("Preview command is too long");
  }
  if (FORBIDDEN_COMMAND_CHARS.test(trimmed)) {
    throw new Error("Preview command contains forbidden characters");
  }
  const tokens = tokenizePreviewCommand(trimmed);
  if (tokens.length === 0) {
    throw new Error("Preview command is missing");
  }
  const bin = tokens[0].toLowerCase();
  if (bin.includes("/") || bin.includes("\\") || bin.includes(":")) {
    throw new Error("Preview command must be a bare executable");
  }
  if (!PREVIEW_BINS.has(bin)) {
    throw new Error(`Preview executable is not allowed: ${bin}`);
  }
  const args = tokens.slice(1);
  for (const arg of args) {
    if (FORBIDDEN_FLAGS.has(arg.toLowerCase())) {
      throw new Error("Preview command flags are not allowed");
    }
    if (FORBIDDEN_COMMAND_CHARS.test(arg)) {
      throw new Error("Preview command contains forbidden characters");
    }
  }
  return { bin, args };
}

export function resolveWindowsCmdWrapper(comspec = process.env.ComSpec): string {
  const raw = (comspec || "C:\\Windows\\System32\\cmd.exe").trim();
  if (isUncOrSharePath(raw) || isBlockedPathProtocol(raw)) {
    throw new Error("Invalid ComSpec for preview spawn");
  }
  const base = path.basename(raw).toLowerCase();
  if (base !== "cmd.exe") {
    throw new Error("Refusing to wrap preview command: ComSpec is not cmd.exe");
  }
  return raw;
}

export function toPreviewSpawnInvocation(
  bin: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): { file: string; args: string[] } {
  if (platform === "win32") {
    return {
      file: resolveWindowsCmdWrapper(),
      args: ["/d", "/s", "/c", `${bin}.cmd`, ...args],
    };
  }
  return { file: bin, args };
}

function stripIpv6Brackets(host: string): string {
  return host.replace(/^\[/, "").replace(/\]$/, "");
}

export function isLoopbackHost(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname).toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
}

export function isPrivateIPv4(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname);
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function normalizePreviewUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  if (stripIpv6Brackets(parsed.hostname).toLowerCase() === "0.0.0.0") {
    parsed.hostname = "127.0.0.1";
  }
  return parsed.href;
}

function parsePreviewUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Preview URL is missing");
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new Error("Preview URL is too long");
  }
  if (isUncOrSharePath(trimmed) || isBlockedPathProtocol(trimmed)) {
    throw new Error("Preview URL scheme is not allowed");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Preview URL is malformed");
  }
  if (BLOCKED_URL_SCHEMES.has(parsed.protocol.toLowerCase())) {
    throw new Error("Preview URL scheme is not allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Preview URL must not contain credentials");
  }
  return parsed;
}

export function isAllowedPreviewOpenUrl(raw: unknown, target: PreviewTarget): boolean {
  try {
    assertAllowedPreviewOpenUrl(raw, target);
    return true;
  } catch {
    return false;
  }
}

export function assertAllowedPreviewOpenUrl(raw: unknown, target: PreviewTarget): string {
  const parsed = parsePreviewUrl(raw);
  const protocol = parsed.protocol.toLowerCase();
  const host = stripIpv6Brackets(parsed.hostname);

  if (target === "web") {
    if (protocol !== "http:" && protocol !== "https:") {
      throw new Error("Web preview URL must be http(s) on a local host");
    }
    if (!parsed.hostname || !isLoopbackHost(host)) {
      throw new Error("Web preview URL host is not a permitted loopback address");
    }
    return normalizePreviewUrl(parsed.href);
  }

  if (protocol === "exp:" || protocol === "exps:") {
    if (!host || !(isLoopbackHost(host) || isPrivateIPv4(host))) {
      throw new Error("Mobile preview URL host is not a permitted local address");
    }
    return parsed.href;
  }

  if (protocol === "http:" || protocol === "https:") {
    if (!host || !(isLoopbackHost(host) || isPrivateIPv4(host))) {
      throw new Error("Mobile preview URL host is not a permitted local address");
    }
    return normalizePreviewUrl(parsed.href);
  }

  throw new Error("Mobile preview URL scheme is not allowed");
}

export function isAllowedPreviewWindowUrl(raw: string): boolean {
  try {
    const parsed = parsePreviewUrl(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return false;
    return isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function toPreviewProbeUrl(openUrl: string, target: PreviewTarget): string | null {
  let parsed: URL;
  try {
    parsed = new URL(assertAllowedPreviewOpenUrl(openUrl, target));
  } catch {
    return null;
  }
  if (parsed.protocol === "exp:" || parsed.protocol === "exps:") {
    const host = parsed.hostname.includes(":") ? `[${parsed.hostname}]` : parsed.hostname;
    const port = parsed.port || "8081";
    const httpUrl = `http://${host}:${port}/status`;
    return isAllowedPreviewOpenUrl(httpUrl, "mobile") ? httpUrl : null;
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return parsed.href;
  }
  return null;
}

const EXPO_URL_RE = /\bexp[s]?:\/\/[^\s"'<>\\]+/gi;

export function extractValidatedExpoUrl(text: string): string | undefined {
  const matches = text.match(EXPO_URL_RE) ?? [];
  for (const match of matches) {
    const cleaned = match.replace(/[.,)]+$/, "");
    if (isAllowedPreviewOpenUrl(cleaned, "mobile")) {
      return cleaned;
    }
  }
  return undefined;
}

export function assertPreviewCwdInput(cwd: string | undefined): string {
  const input = (cwd ?? ".").trim() || ".";
  if (input.includes("\0") || isUncOrSharePath(input) || isBlockedPathProtocol(input)) {
    throw new Error("Preview cwd is not allowed");
  }
  return input;
}

export function redactPreviewLogs(text: string): string {
  if (!text) return text;
  const clipped = text.length > MAX_LOG_CHARS ? `${text.slice(-MAX_LOG_CHARS)}` : text;
  return redactSensitiveCommandOutput(clipped)
    .replace(
      /("?(?:openRouterApiKey|meshApiKey|piapiApiKey)"?\s*[:=]\s*)["']?[^\s"',}\]]+["']?/gi,
      "$1[REDACTED]"
    );
}

export function appendRedactedLog(buffer: string, chunk: string, maxChars = MAX_LOG_CHARS): string {
  const next = redactPreviewLogs(`${buffer}${chunk}`);
  return next.length > maxChars ? next.slice(-maxChars) : next;
}

export function idlePreviewTargetState(
  target: PreviewTarget,
  config: CavalPreviewTargetConfig | undefined
): import("./preview-types").PreviewTargetState {
  const configured = isPreviewTargetConfigured(target, config);
  return {
    target,
    configured,
    enabled: configured,
    status: "stopped",
    owned: false,
    missingReason: previewMissingReason(target, config),
  };
}

export const PREVIEW_READY_TIMEOUT_MS = DEFAULT_READY_TIMEOUT_MS;
