/**
 * Validate file type (PDF or images only)
 */
const isValidFileType = (mimetype) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/svg+xml'
  ];
  return allowedTypes.includes(mimetype);
};

/**
 * Get file size limit based on plan
 * Returns size in bytes
 */
const getFileSizeLimit = (planName) => {
  const limits = {
    'free': 5 * 1024 * 1024,      // 5 MB
    'lite': 10 * 1024 * 1024,     // 10 MB
    'pro': 25 * 1024 * 1024,      // 25 MB
    'enterprise': 50 * 1024 * 1024, // 50 MB
    'custom': 50 * 1024 * 1024     // 50 MB
  };
  return limits[planName] || limits.free;
};

/**
 * Validate file size against plan limit
 */
const isValidFileSize = (fileSize, planName) => {
  const limit = getFileSizeLimit(planName);
  return fileSize <= limit;
};

/**
 * Format file size for display
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Generate unique filename
 */
const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  const nameWithoutExt = originalName.split('.').slice(0, -1).join('.');
  const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${timestamp}-${randomString}-${sanitizedName}.${extension}`;
};

module.exports = {
  isValidFileType,
  getFileSizeLimit,
  isValidFileSize,
  formatFileSize,
  generateUniqueFilename
};
