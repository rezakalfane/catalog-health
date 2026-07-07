/**
 * Symmetric encryption for secrets at rest (BigCommerce tokens, LLM API keys).
 *
 * AES-256-GCM (authenticated) with a key from the APP_ENCRYPTION_KEY env var.
 * Encrypted values are tagged with a version prefix so plaintext (legacy) and
 * ciphertext can coexist during migration and be told apart.
 *
 *   stored form: "enc:v1:" + base64( iv[12] | authTag[16] | ciphertext )
 *
 * Key custody is the whole point: the key lives in the environment (an
 * untracked .env.local for local dev; a real secrets manager in production),
 * never in the database or the repo. Without it, the data file is inert.
 */
import crypto from "node:crypto";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey; // undefined = not resolved yet, null = no key configured

function resolveKey() {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    cachedKey = null;
    return null;
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY must decode to 32 bytes for AES-256. " +
        "Generate one with:  openssl rand -base64 32"
    );
  }
  cachedKey = key;
  return key;
}

export function hasEncryptionKey() {
  return Boolean(process.env.APP_ENCRYPTION_KEY);
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a secret for storage. Returns the value unchanged if no key is
 * configured (plaintext fallback) or if it's already encrypted. Empty/nullish
 * values are passed through.
 */
export function encryptSecret(plaintext) {
  const key = resolveKey();
  if (!key || plaintext == null || plaintext === "" || isEncrypted(plaintext)) {
    return plaintext;
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt a stored secret. Plaintext (unprefixed, legacy) values pass through
 * so reads keep working before the one-time migration runs.
 */
export function decryptSecret(value) {
  if (!isEncrypted(value)) return value;
  const key = resolveKey();
  if (!key) {
    throw new Error(
      "The database contains encrypted secrets but APP_ENCRYPTION_KEY is not set. " +
        "Set it to the key used to encrypt them."
    );
  }
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ct = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(
      "Could not decrypt a stored secret — APP_ENCRYPTION_KEY does not match " +
        "the key it was encrypted with (or the value is corrupt)."
    );
  }
}
