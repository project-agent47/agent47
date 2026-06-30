import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET = process.env.PROVIDER_SECRET ?? 'replace-with-32-char-secret';

function deriveKey() {
  return scryptSync(SECRET, 'decision-workspace', 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const key = deriveKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const binary = Buffer.from(payload, 'base64');
  const iv = binary.subarray(0, 12);
  const tag = binary.subarray(12, 28);
  const encrypted = binary.subarray(28);
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
