const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Initialize R2 client with S3-compatible API
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = r2Client;
