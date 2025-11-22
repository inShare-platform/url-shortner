const crypto = require('crypto');

/**
 * Hash a password using crypto
 */
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

/**
 * Verify a password against a hash
 */
const verifyPassword = (password, storedHash) => {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
};

/**
 * Generate a simple session token
 */
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken
};
