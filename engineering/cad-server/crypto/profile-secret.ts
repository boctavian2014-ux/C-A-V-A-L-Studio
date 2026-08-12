import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface EncryptedProfileSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export class ProfileEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileEncryptionError";
  }
}

const parseKeyMaterial = (raw: string, label: string): Buffer => {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const fromB64 = Buffer.from(trimmed, "base64");
  if (fromB64.length === KEY_BYTES) return fromB64;
  throw new ProfileEncryptionError(`${label} must be 32 bytes (64 hex chars or base64)`);
};

export const previousProfileKeyEnv = (version: number): string =>
  `CAD_PROFILE_ENCRYPTION_KEY_V${version}`;

export const readProfileEncryptionKeyVersion = (): number => {
  const raw = process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION?.trim();
  const version = raw ? Number(raw) : 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new ProfileEncryptionError("CAD_PROFILE_ENCRYPTION_KEY_VERSION must be a positive integer");
  }
  return version;
};

export const loadProfileEncryptionKey = (): { key: Buffer; version: number } => {
  const raw = process.env.CAD_PROFILE_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new ProfileEncryptionError("CAD_PROFILE_ENCRYPTION_KEY is not configured");
  }
  const key = parseKeyMaterial(raw, "CAD_PROFILE_ENCRYPTION_KEY");
  if (key.length !== KEY_BYTES) {
    throw new ProfileEncryptionError("CAD_PROFILE_ENCRYPTION_KEY must be 32 bytes");
  }
  return { key, version: readProfileEncryptionKeyVersion() };
};

/** Decrypt key for a stored keyVersion. Current version uses CAD_PROFILE_ENCRYPTION_KEY; older rows use CAD_PROFILE_ENCRYPTION_KEY_Vn. */
export const loadKeyForVersion = (version: number): Buffer => {
  if (!Number.isInteger(version) || version < 1) {
    throw new ProfileEncryptionError("Invalid profile secret keyVersion");
  }
  const current = readProfileEncryptionKeyVersion();
  if (version === current) {
    return loadProfileEncryptionKey().key;
  }
  const label = previousProfileKeyEnv(version);
  const raw = process.env[label]?.trim();
  if (!raw) {
    throw new ProfileEncryptionError(
      `No decryption key for keyVersion ${version}; set ${label}`
    );
  }
  return parseKeyMaterial(raw, label);
};

export const isProfileEncryptionConfigured = (): boolean => {
  try {
    loadProfileEncryptionKey();
    return true;
  } catch {
    return false;
  }
};

export const encryptProfileSecret = (plaintext: string): EncryptedProfileSecret => {
  const { key, version } = loadProfileEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new ProfileEncryptionError("Unexpected GCM auth tag length");
  }
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: version,
  };
};

export const decryptProfileSecret = (input: EncryptedProfileSecret): string => {
  const key = loadKeyForVersion(input.keyVersion);
  const iv = Buffer.from(input.iv, "base64");
  const authTag = Buffer.from(input.authTag, "base64");
  const ciphertext = Buffer.from(input.ciphertext, "base64");
  if (iv.length !== IV_BYTES) {
    throw new ProfileEncryptionError("Invalid profile secret IV length");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
};
