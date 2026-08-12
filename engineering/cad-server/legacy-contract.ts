export const LEGACY_CAD_SECRET_FIELDS = [
  "openRouterApiKey",
  "meshApiKey",
  "piapiApiKey",
] as const;

export type LegacyCadSecretField = (typeof LEGACY_CAD_SECRET_FIELDS)[number];

/** Faza 1 default: accept legacy BYOK body fields until sunset. */
export const isLegacyClientSecretPayloadEnabled = (): boolean => {
  const raw = process.env.CAD_LEGACY_CLIENT_SECRET_PAYLOAD?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
};

export const hasLegacySecretFields = (body: Record<string, unknown>): boolean =>
  LEGACY_CAD_SECRET_FIELDS.some((field) => {
    const value = body[field];
    return typeof value === "string" && value.trim().length > 0;
  });

export const stripLegacySecretFields = <T extends Record<string, unknown>>(
  body: T
): T => {
  const next = { ...body };
  for (const field of LEGACY_CAD_SECRET_FIELDS) {
    delete next[field];
  }
  return next;
};
