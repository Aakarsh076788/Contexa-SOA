import { randomBytes } from 'node:crypto';

/**
 * Generates a unique ID with a given prefix.
 * @param {string} type - The ID prefix type.
 * @returns {string} The generated ID.
 */
export const id = (type) => `${type}_${randomBytes(8).toString('hex')}`;
