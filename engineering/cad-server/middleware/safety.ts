import type { Request, Response, NextFunction } from "express";
import { cadBadRequest } from "./errors";
import { cadLog } from "./logger";

const MAX_PROMPT_CHARS = 16_000;
const MAX_REQUESTS_PER_MINUTE = 60;

const BLOCKED_OPERATIONS = [
  "rm -rf",
  "del /s",
  "git reset --hard",
  "git clean -fd",
  "shutdown",
  "cipher /w",
  "reg delete",
];

const BLOCKED_PATTERNS = [/\bformat\s+[a-z]:/i, /\bformat\s+\/[a-z]/i];

const rateHits = new Map<string, number[]>();

function consumeRateLimit(key: string, now = Date.now()): boolean {
  const windowStart = now - 60_000;
  const recent = (rateHits.get(key) ?? []).filter((t) => t >= windowStart);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
    rateHits.set(key, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(key, recent);
  return true;
}

function validateCadPrompt(prompt: string): string | null {
  if (prompt.length > MAX_PROMPT_CHARS) {
    return `Prompt prea lung (${prompt.length} caractere, max ${MAX_PROMPT_CHARS}).`;
  }

  const lower = prompt.toLowerCase();
  for (const op of BLOCKED_OPERATIONS) {
    if (lower.includes(op)) {
      return `Pattern periculos blocat: ${op}`;
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(prompt)) {
      return `Pattern periculos blocat: ${pattern.source}`;
    }
  }

  return null;
}

export const cadSafetyMiddleware = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  try {
    const body = request.body as { prompt?: string; latestUserText?: string };
    const prompt = (body.prompt ?? body.latestUserText ?? "").trim();
    if (!prompt) {
      next();
      return;
    }

    const rateKey = request.cadAuth?.cavalId ?? request.ip ?? "anonymous";
    if (!consumeRateLimit(rateKey)) {
      throw new Error("Limită CAD depășită. Încearcă din nou peste un minut.");
    }

    const violation = validateCadPrompt(prompt);
    if (violation) {
      throw new Error(violation);
    }

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cadLog({
      level: "warn",
      event: "safety_blocked",
      cavalId: request.cadAuth?.cavalId,
      message,
    });
    next(cadBadRequest(message));
  }
};
