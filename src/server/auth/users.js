import bcrypt from 'bcryptjs';

// Server-only user store with bcrypt-hashed passwords.
// Plaintext passwords have been removed from the codebase.
export const USERS = [
  { id: 'u1', username: 'lior', passwordHash: '$2b$10$2c5gpnPpwZxhTahSEr7/X.m98WeR0f8hp4.qaGR.z.rYsyDpgBvBW', name: 'Lior Perry', email: 'lior@lp-law.co.il', role: 'ADMIN' },
  { id: 'u2', username: 'lidor', passwordHash: '$2b$10$cQJy8sZrxRLW8qqmAp8PreKM5ClhaHaBtRAu8seJ2tK11nMPwfV/K', name: 'Lidor Kabilo', email: 'Lidor@lp-law.co.il', role: 'SUB_ADMIN' },
  { id: 'u3', username: 'iris', passwordHash: '$2b$10$Pyv.hFI2uudgdCDIvuUL5OEAGrwiTjFAPUElnC2lRB3n05dC0i0Km', name: 'Iris Alfman', email: 'Iris@lp-law.co.il', role: 'FINANCE' },
  { id: 'u4', username: 'hava', passwordHash: '$2b$10$al4Vir.S56cIJV0FJG0FouEpNPaNwozj.g7kUJ4YlXtW8Gp75ikLe', name: 'Hava Kabilo', email: 'Hava@lp-law.co.il', role: 'LAWYER' },
  { id: 'u5', username: 'may', passwordHash: '$2b$10$sshgiWjCD5Q6TJqxTyuSSOqVkkJhcuHH5wS79Px5TWDRE/FE5A5ZG', name: 'May Harari', email: 'May@lp-law.co.il', role: 'LAWYER' },
  { id: 'u6', username: 'vlada', passwordHash: '$2b$10$BDt1PvReYOR/EDS1jfH1Eub/37IRmLmuFZNhaCzeCX3F5l5wMSwrG', name: 'Vlada Boltach', email: 'Vlada@lp-law.co.il', role: 'LAWYER' },
  { id: 'u7', username: 'orly', passwordHash: '$2b$10$ty/RG.3LzTVLhNsCYx.VJ.w3R4tYZD3LcZYoUnUawA7M9oibeIC7S', name: 'Orly Day', email: 'Orly@lp-law.co.il', role: 'LAWYER' },
];

/**
 * Verify a plaintext password against a bcrypt hash.
 * @param {string} plaintext
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export const verifyPassword = (plaintext, hash) => bcrypt.compare(plaintext, hash);
