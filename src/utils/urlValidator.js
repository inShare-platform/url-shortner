const validator = require('validator');

/**
 * Validates if a string is a valid URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidUrl = (url) => {
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true
  });
};

/**
 * Validates if an alias is acceptable (alphanumeric, dashes, underscores)
 * @param {string} alias - The alias to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidAlias = (alias) => {
  // Allow alphanumeric characters, dashes, and underscores
  // Length between 3 and 20 characters
  const aliasRegex = /^[a-zA-Z0-9_-]{3,20}$/;
  return aliasRegex.test(alias);
};

module.exports = {
  isValidUrl,
  isValidAlias
};
