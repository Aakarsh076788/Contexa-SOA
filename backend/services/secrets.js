import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
let cachedKey;
function secretKey() {
  if (cachedKey) return cachedKey;
  if (process.env.CONTEXA_SECRET_KEY) {
    const key = Buffer.from(process.env.CONTEXA_SECRET_KEY, 'hex');
    if (key.length !== 32 || !/^[a-f0-9]{64}$/i.test(process.env.CONTEXA_SECRET_KEY)) throw new Error('CONTEXA_SECRET_KEY must be 64 hexadecimal characters.');
    return (cachedKey = key);
  }
  const directory = fileURLToPath(new URL('../../.local/', import.meta.url));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'secrets.key');
  try { cachedKey = readFileSync(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { writeFileSync(file, randomBytes(32), { mode: 0o600, flag: 'wx' }); } catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
    cachedKey = readFileSync(file);
  }
  if (cachedKey.length !== 32) throw new Error('Invalid local encryption key.');
  return cachedKey;
}
export function sealSecret(value) {
  if (!value || value.startsWith('enc:v1:')) return value;
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}
export function openSecret(value) {
  if (!value?.startsWith('enc:v1:')) return value; // Existing credentials remain usable until migrated.
  const [, , iv, tag, data] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
