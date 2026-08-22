/**
 * Pas 7e.1 — UI-only onboarding state (localStorage).
 * Never writes to AI history.db.
 */

export type OnboardingFeature = "quick-fix" | "inline" | "explain" | "refactor";

export const ONBOARDING_SEEN_KEY = "caval-onboarding-seen";

export type OnboardingSeenMap = Partial<Record<OnboardingFeature, boolean>>;

function readSeen(): OnboardingSeenMap {
  try {
    const raw = localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as OnboardingSeenMap;
  } catch {
    return {};
  }
}

function writeSeen(next: OnboardingSeenMap): void {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function hasSeenFeature(feature: OnboardingFeature): boolean {
  return Boolean(readSeen()[feature]);
}

export function markFeatureSeen(feature: OnboardingFeature): void {
  const seen = readSeen();
  if (seen[feature]) return;
  writeSeen({ ...seen, [feature]: true });
}

export function resetOnboardingSeenForTests(): void {
  try {
    localStorage.removeItem(ONBOARDING_SEEN_KEY);
  } catch {
    /* ignore */
  }
}

export const FEATURE_TIP_COPY: Record<OnboardingFeature, string> = {
  "quick-fix": "AI proposed a fix — review the diff before accepting.",
  inline: "Tab accepts an inline suggestion. Ctrl+Z undoes it.",
  explain: "Explain is read-only — it never edits your files.",
  refactor: "Multi-file refactor needs your Accept. Review every diff first.",
};
