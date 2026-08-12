import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../../../billing/supabase/client";
import { cadForbidden, cadNotFound, cadBadRequest, cadInternal } from "../middleware/errors";
import {
  decryptProfileSecret,
  encryptProfileSecret,
  ProfileEncryptionError,
  type EncryptedProfileSecret,
} from "../crypto/profile-secret";

export const CAD_PROVIDERS = ["openrouter", "meshy", "piapi"] as const;
export type CadProvider = (typeof CAD_PROVIDERS)[number];

export const CAD_PROFILE_CAPABILITIES = ["plan", "openscad", "mesh"] as const;
export type CadProfileCapability = (typeof CAD_PROFILE_CAPABILITIES)[number];

export type ProviderProfileStatus = "active" | "revoked";

export interface ProviderProfilePublic {
  id: string;
  provider: CadProvider;
  capabilities: CadProfileCapability[];
  status: ProviderProfileStatus;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

interface ProviderProfileRecord extends ProviderProfilePublic {
  accountId: string;
  secret: EncryptedProfileSecret;
}

const memoryProfiles = new Map<string, ProviderProfileRecord>();

const nowIso = (): string => new Date().toISOString();

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const toPublic = (row: ProviderProfileRecord): ProviderProfilePublic => ({
  id: row.id,
  provider: row.provider,
  capabilities: row.capabilities,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  revokedAt: row.revokedAt,
});

const parseCapabilities = (raw: unknown): CadProfileCapability[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is CadProfileCapability =>
    CAD_PROFILE_CAPABILITIES.includes(item as CadProfileCapability)
  );
};

const assertAccountId = (accountId: string): void => {
  if (!isUuid(accountId)) {
    throw cadBadRequest("accountId must be a UUID (JWT.sub)");
  }
};

const assertProvider = (provider: string): CadProvider => {
  if (!CAD_PROVIDERS.includes(provider as CadProvider)) {
    throw cadBadRequest("Unsupported CAD provider");
  }
  return provider as CadProvider;
};

type DbRow = {
  id: string;
  account_id: string;
  provider: CadProvider;
  capabilities: unknown;
  status: ProviderProfileStatus;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

type DbSecretRow = {
  secret_ciphertext: string;
  secret_iv: string;
  secret_auth_tag: string;
  key_version: number;
};

const METADATA_COLUMNS =
  "id, account_id, provider, capabilities, status, created_at, updated_at, revoked_at";

const rowToPublic = (row: DbRow): ProviderProfilePublic => ({
  id: row.id,
  provider: row.provider,
  capabilities: parseCapabilities(row.capabilities),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  revokedAt: row.revoked_at,
});

const findMemory = (id: string): ProviderProfileRecord | undefined =>
  memoryProfiles.get(id);

export const resetProviderProfilesForTests = (): void => {
  memoryProfiles.clear();
};

export const createProviderProfile = async (input: {
  accountId: string;
  provider: string;
  secret: string;
  capabilities?: string[];
}): Promise<ProviderProfilePublic> => {
  assertAccountId(input.accountId);
  const provider = assertProvider(input.provider);
  const secret = input.secret.trim();
  if (!secret) throw cadBadRequest("secret is required");
  const capabilities = parseCapabilities(input.capabilities ?? ["plan", "openscad", "mesh"]);
  const encrypted = encryptProfileSecret(secret);
  const createdAt = nowIso();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const existing = [...memoryProfiles.values()].find(
      (row) =>
        row.accountId === input.accountId &&
        row.provider === provider &&
        row.status === "active"
    );
    if (existing) {
      throw cadBadRequest("An active profile already exists for this provider");
    }
    const record: ProviderProfileRecord = {
      id: randomUUID(),
      accountId: input.accountId,
      provider,
      capabilities,
      status: "active",
      createdAt,
      updatedAt: createdAt,
      revokedAt: null,
      secret: encrypted,
    };
    memoryProfiles.set(record.id, record);
    return toPublic(record);
  }

  const { data, error } = await supabase
    .from("provider_profiles")
    .insert({
      account_id: input.accountId,
      provider,
      capabilities,
      secret_ciphertext: encrypted.ciphertext,
      secret_iv: encrypted.iv,
      secret_auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
      status: "active",
    })
    .select(METADATA_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw cadBadRequest("An active profile already exists for this provider");
    }
    throw cadInternal("Failed to create provider profile");
  }
  return rowToPublic(data as DbRow);
};

export const listProviderProfiles = async (
  accountId: string
): Promise<ProviderProfilePublic[]> => {
  assertAccountId(accountId);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...memoryProfiles.values()]
      .filter((row) => row.accountId === accountId)
      .map(toPublic);
  }

  const { data, error } = await supabase
    .from("provider_profiles")
    .select(METADATA_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) throw cadInternal("Failed to list provider profiles");
  return (data as DbRow[] | null)?.map(rowToPublic) ?? [];
};

const loadMetadata = async (
  profileId: string
): Promise<{ accountId: string; public: ProviderProfilePublic } | null> => {
  const memory = findMemory(profileId);
  if (memory) {
    return { accountId: memory.accountId, public: toPublic(memory) };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("provider_profiles")
    .select(METADATA_COLUMNS)
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw cadInternal("Failed to load provider profile");
  if (!data) return null;
  const row = data as DbRow;
  return { accountId: row.account_id, public: rowToPublic(row) };
};

const assertOwnedActive = (
  meta: { accountId: string; public: ProviderProfilePublic },
  accountId: string
): ProviderProfilePublic => {
  if (meta.accountId !== accountId) {
    throw cadForbidden("You do not own this provider profile");
  }
  if (meta.public.status !== "active") {
    throw cadForbidden("Provider profile is revoked");
  }
  return meta.public;
};

export const rotateProviderProfileSecret = async (input: {
  accountId: string;
  profileId: string;
  secret: string;
}): Promise<ProviderProfilePublic> => {
  assertAccountId(input.accountId);
  const secret = input.secret.trim();
  if (!secret) throw cadBadRequest("secret is required");

  const meta = await loadMetadata(input.profileId);
  if (!meta) throw cadNotFound("Provider profile not found");
  assertOwnedActive(meta, input.accountId);

  const encrypted = encryptProfileSecret(secret);
  const updatedAt = nowIso();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const record = findMemory(input.profileId);
    if (!record) throw cadNotFound("Provider profile not found");
    record.secret = encrypted;
    record.updatedAt = updatedAt;
    return toPublic(record);
  }

  const { data, error } = await supabase
    .from("provider_profiles")
    .update({
      secret_ciphertext: encrypted.ciphertext,
      secret_iv: encrypted.iv,
      secret_auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
      updated_at: updatedAt,
    })
    .eq("id", input.profileId)
    .eq("account_id", input.accountId)
    .eq("status", "active")
    .select(METADATA_COLUMNS)
    .maybeSingle();

  if (error) throw cadInternal("Failed to rotate provider profile");
  if (!data) throw cadNotFound("Provider profile not found");
  return rowToPublic(data as DbRow);
};

export const revokeProviderProfile = async (input: {
  accountId: string;
  profileId: string;
}): Promise<ProviderProfilePublic> => {
  assertAccountId(input.accountId);
  const meta = await loadMetadata(input.profileId);
  if (!meta) throw cadNotFound("Provider profile not found");
  if (meta.accountId !== input.accountId) {
    throw cadForbidden("You do not own this provider profile");
  }
  if (meta.public.status === "revoked") return meta.public;

  const revokedAt = nowIso();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const record = findMemory(input.profileId);
    if (!record) throw cadNotFound("Provider profile not found");
    record.status = "revoked";
    record.revokedAt = revokedAt;
    record.updatedAt = revokedAt;
    return toPublic(record);
  }

  const { data, error } = await supabase
    .from("provider_profiles")
    .update({
      status: "revoked",
      revoked_at: revokedAt,
      updated_at: revokedAt,
    })
    .eq("id", input.profileId)
    .eq("account_id", input.accountId)
    .select(METADATA_COLUMNS)
    .maybeSingle();

  if (error) throw cadInternal("Failed to revoke provider profile");
  if (!data) throw cadNotFound("Provider profile not found");
  return rowToPublic(data as DbRow);
};

export interface ResolvedProviderSecret {
  profile: ProviderProfilePublic;
  provider: CadProvider;
  plaintext: string;
}

/**
 * Authz first (ownership + active). Decrypt only after both succeed.
 * Ciphertext never leaves this function except as in-memory plaintext.
 */
export const resolveOwnedActiveProfileSecret = async (input: {
  accountId: string;
  profileId: string;
}): Promise<ResolvedProviderSecret> => {
  assertAccountId(input.accountId);
  const meta = await loadMetadata(input.profileId);
  if (!meta) throw cadNotFound("Provider profile not found");
  const profile = assertOwnedActive(meta, input.accountId);

  const decryptOwned = (encrypted: EncryptedProfileSecret): string => {
    try {
      return decryptProfileSecret(encrypted);
    } catch (error) {
      if (error instanceof ProfileEncryptionError) {
        throw cadInternal("Provider profile cannot be decrypted");
      }
      throw error;
    }
  };

  const memory = findMemory(input.profileId);
  if (memory) {
    return {
      profile,
      provider: memory.provider,
      plaintext: decryptOwned(memory.secret),
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw cadNotFound("Provider profile not found");

  const { data, error } = await supabase
    .from("provider_profiles")
    .select("secret_ciphertext, secret_iv, secret_auth_tag, key_version")
    .eq("id", input.profileId)
    .eq("account_id", input.accountId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw cadInternal("Failed to resolve provider profile");
  if (!data) throw cadForbidden("Provider profile is revoked");

  const row = data as DbSecretRow;
  const plaintext = decryptOwned({
    ciphertext: row.secret_ciphertext,
    iv: row.secret_iv,
    authTag: row.secret_auth_tag,
    keyVersion: row.key_version,
  });

  return { profile, provider: profile.provider, plaintext };
};

export const applyResolvedSecretToCadInput = <T extends Record<string, unknown>>(
  body: T,
  resolved: ResolvedProviderSecret
): T => {
  const next: Record<string, unknown> = { ...body };
  delete next.openRouterApiKey;
  delete next.meshApiKey;
  delete next.piapiApiKey;
  if (resolved.provider === "openrouter") next.openRouterApiKey = resolved.plaintext;
  if (resolved.provider === "meshy") next.meshApiKey = resolved.plaintext;
  if (resolved.provider === "piapi") next.piapiApiKey = resolved.plaintext;
  return next as T;
};
