import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

/**
 * Hashes a password using scrypt.
 * @param {string} password - The password to hash.
 * @returns {Promise<string>} The hashed password with salt.
 */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}

/**
 * Verifies a password against a stored hash.
 * @param {string} password - The password to verify.
 * @param {string} storedHash - The stored hash to verify against.
 * @returns {Promise<boolean>} True if the password matches, false otherwise.
 */
export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !/^[a-f0-9]{128}$/i.test(hash || '')) return false;
  return timingSafeEqual(Buffer.from(hash, 'hex'), await scrypt(password, salt, 64));
}
