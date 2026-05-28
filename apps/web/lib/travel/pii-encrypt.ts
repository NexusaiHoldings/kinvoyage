/**
 * Field-level AES-256-GCM encryption for traveler PII.
 *
 * Encrypts passport_number and payment_reference at rest.
 * Key sourced from PII_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 * Encoded output format: base64(iv):base64(authTag):base64(ciphertext)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cryptoMod: typeof import("crypto") = eval("require")("crypto") as typeof import("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 16;
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "PII_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns a colon-delimited base64 string: iv:authTag:ciphertext
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = cryptoMod.randomBytes(IV_BYTES);
  const cipher = cryptoMod.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypts an AES-256-GCM ciphertext produced by encryptField.
 * Input format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function decryptField(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted field format — expected iv:authTag:ciphertext");
  }
  const [ivB64, authTagB64, dataB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = cryptoMod.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag.subarray(0, AUTH_TAG_BYTES));
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Returns a redacted passport number suitable for display: first 2 chars + asterisks + last 2 chars.
 */
export function maskPassport(passportNumber: string): string {
  if (passportNumber.length <= 4) {
    return "*".repeat(passportNumber.length);
  }
  const visible = 2;
  const masked = "*".repeat(passportNumber.length - visible * 2);
  return (
    passportNumber.slice(0, visible) +
    masked +
    passportNumber.slice(passportNumber.length - visible)
  );
}
