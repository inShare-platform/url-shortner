/**
 * Validates metadata object structure and types
 * @param {object} metadata - The metadata object to validate
 * @returns {object} - { valid: boolean, error?: string, sanitized?: object }
 */
const validateMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return { valid: true, sanitized: null }; // Metadata is optional
  }

  const sanitized = {};

  // Validate boolean fields
  const booleanFields = [
    'isDownloadEnable',
    'isScreenShotEnable',
    'isChatbotEnable',
    'isInterestForm',
    'isFollowUp'
  ];

  for (const field of booleanFields) {
    if (metadata.hasOwnProperty(field)) {
      if (typeof metadata[field] !== 'boolean') {
        return { 
          valid: false, 
          error: `${field} must be a boolean value` 
        };
      }
      sanitized[field] = metadata[field];
    }
  }

  // Validate expireTime
  if (metadata.hasOwnProperty('isExpireTime')) {
    if (metadata.isExpireTime === null) {
      sanitized.isExpireTime = null;
    } else {
      const expireDate = new Date(metadata.isExpireTime);
      if (isNaN(expireDate.getTime())) {
        return { 
          valid: false, 
          error: 'isExpireTime must be a valid ISO 8601 date string or null' 
        };
      }
      
      // Check if the date is in the future
      if (expireDate <= new Date()) {
        return { 
          valid: false, 
          error: 'isExpireTime must be a future date' 
        };
      }
      
      sanitized.isExpireTime = expireDate.toISOString();
    }
  }

  return { valid: true, sanitized };
};

/**
 * Converts API metadata format to database format
 * @param {object} metadata - Metadata from API request
 * @returns {object} - Database-formatted metadata
 */
const convertToDatabaseFormat = (metadata) => {
  if (!metadata) return null;

  return {
    is_download_enable: metadata.isDownloadEnable || false,
    is_screenshot_enable: metadata.isScreenShotEnable || false,
    is_chatbot_enable: metadata.isChatbotEnable || false,
    is_interest_form: metadata.isInterestForm || false,
    is_follow_up: metadata.isFollowUp || false,
    expire_time: metadata.isExpireTime || null
  };
};

/**
 * Converts database metadata format to API format
 * @param {object} dbMetadata - Metadata from database
 * @returns {object} - API-formatted metadata
 */
const convertToApiFormat = (dbMetadata) => {
  if (!dbMetadata) return null;

  return {
    isDownloadEnable: dbMetadata.is_download_enable || false,
    isScreenShotEnable: dbMetadata.is_screenshot_enable || false,
    isChatbotEnable: dbMetadata.is_chatbot_enable || false,
    isInterestForm: dbMetadata.is_interest_form || false,
    isFollowUp: dbMetadata.is_follow_up || false,
    isExpireTime: dbMetadata.expire_time || null
  };
};

module.exports = {
  validateMetadata,
  convertToDatabaseFormat,
  convertToApiFormat
};
