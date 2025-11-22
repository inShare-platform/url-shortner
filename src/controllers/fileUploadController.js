const { nanoid } = require('nanoid');
const multer = require('multer');
const { PutObjectCommand, HeadBucketCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');
const r2Client = require('../config/r2');
const supabase = require('../config/supabase');
const { isValidFileType, isValidFileSize, formatFileSize, generateUniqueFilename } = require('../utils/fileValidator');
const { hashPassword } = require('../utils/auth');
const { validateMetadata, convertToDatabaseFormat } = require('../utils/metadataValidator');
const { trackFileUpload, trackFeatureUsage } = require('./billingController');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
  },
}).single('file');

/**
 * Check if bucket exists, create if not
 */
const ensureBucketExists = async (bucketName) => {
  try {
    // Try to head the bucket
    await r2Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return { exists: true };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      // Bucket doesn't exist, create it
      try {
        await r2Client.send(new CreateBucketCommand({ Bucket: bucketName }));
        return { exists: false, created: true };
      } catch (createError) {
        console.error('Error creating bucket:', createError);
        return { exists: false, created: false, error: createError.message };
      }
    }
    console.error('Error checking bucket:', error);
    return { exists: false, created: false, error: error.message };
  }
};

/**
 * Upload file to R2
 */
const uploadToR2 = async (bucketName, key, fileBuffer, contentType) => {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });
    
    await r2Client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Error uploading to R2:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check quota for file uploads (reusing URL quota logic)
 */
const checkQuota = async (user) => {
  try {
    if (user.isAuthenticated) {
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
          id,
          plan_id,
          plans (
            id,
            name,
            url_limit
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subError || !subscription) {
        return { 
          allowed: false, 
          error: 'no_active_plan',
          message: 'No active subscription found. Please purchase a plan to upload files.'
        };
      }

      const urlLimit = subscription.plans.url_limit;
      const planId = subscription.plan_id;
      const planName = subscription.plans.name;

      if (urlLimit === null) {
        return { allowed: true, planId, planName, isUnlimited: true };
      }

      const { count: urlCount, error: countError } = await supabase
        .from('urls')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) {
        return { allowed: false, error: 'Failed to check quota' };
      }

      const remaining = urlLimit - (urlCount || 0);

      if (remaining <= 0) {
        return { 
          allowed: false, 
          error: 'quota_exceeded',
          message: `You have reached your plan limit of ${urlLimit} uploads. Please upgrade your plan.`,
          usage: { used: urlCount, limit: urlLimit, remaining: 0 }
        };
      }

      return { 
        allowed: true, 
        planId,
        planName,
        isUnlimited: false,
        usage: { used: urlCount, limit: urlLimit, remaining }
      };

    } else {
      const { data: freePlan } = await supabase
        .from('plans')
        .select('id, name, url_limit')
        .eq('name', 'free')
        .single();

      if (!freePlan) {
        return { allowed: false, error: 'Free plan not configured' };
      }

      const freeLimit = freePlan.url_limit || 2;
      const planId = freePlan.id;
      const planName = freePlan.name;

      const { count: urlCount, error: countError } = await supabase
        .from('urls')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', user.ip)
        .is('user_id', null);

      if (countError) {
        return { allowed: false, error: 'Failed to check quota' };
      }

      const remaining = freeLimit - (urlCount || 0);

      if (remaining <= 0) {
        return { 
          allowed: false, 
          error: 'quota_exceeded',
          message: `Anonymous users are limited to ${freeLimit} uploads. Please register for more.`,
          usage: { used: urlCount, limit: freeLimit, remaining: 0 }
        };
      }

      return { 
        allowed: true, 
        planId,
        planName,
        isUnlimited: false,
        usage: { used: urlCount, limit: freeLimit, remaining }
      };
    }
  } catch (error) {
    console.error('Error in checkQuota:', error);
    return { allowed: false, error: 'Internal error checking quota' };
  }
};

/**
 * Upload file endpoint
 * POST /api/upload
 */
const uploadFile = (req, res) => {
  upload(req, res, async (err) => {
    try {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds 50 MB limit' });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(500).json({ error: 'File upload failed' });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const user = req.user;
      const file = req.file;
      const { isExpire, expiryTime, isPasswordProtected, password, metadata } = req.body;

      // Validate file type
      if (!isValidFileType(file.mimetype)) {
        return res.status(400).json({ 
          error: 'Invalid file type. Only PDF and image files are allowed.' 
        });
      }

      // Check quota
      const quotaCheck = await checkQuota(user);
      if (!quotaCheck.allowed) {
        return res.status(403).json({ 
          error: quotaCheck.error,
          message: quotaCheck.message,
          usage: quotaCheck.usage
        });
      }

      // Validate file size against plan limit
      if (!isValidFileSize(file.size, quotaCheck.planName)) {
        const limit = formatFileSize(require('../utils/fileValidator').getFileSizeLimit(quotaCheck.planName));
        return res.status(400).json({ 
          error: `File size exceeds ${limit} limit for your plan` 
        });
      }

      // Validate password if enabled
      if (isPasswordProtected === 'true' || isPasswordProtected === true) {
        if (!password) {
          return res.status(400).json({ error: 'Password is required when password protection is enabled' });
        }
        if (password.length < 4) {
          return res.status(400).json({ error: 'Password must be at least 4 characters long' });
        }
      }

      // Validate expiry time if enabled
      let validExpiryTime = null;
      if (isExpire === 'true' || isExpire === true) {
        if (!expiryTime) {
          return res.status(400).json({ error: 'Expiry time is required when expiration is enabled' });
        }
        const expiryDate = new Date(expiryTime);
        if (isNaN(expiryDate.getTime())) {
          return res.status(400).json({ error: 'Invalid expiry time format. Use ISO 8601 format.' });
        }
        if (expiryDate <= new Date()) {
          return res.status(400).json({ error: 'Expiry time must be in the future.' });
        }
        validExpiryTime = expiryDate.toISOString();
      }

      // Validate metadata if provided
      let parsedMetadata = null;
      if (metadata) {
        try {
          parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        } catch (e) {
          return res.status(400).json({ error: 'Invalid metadata format' });
        }
      }

      const metadataValidation = validateMetadata(parsedMetadata);
      if (!metadataValidation.valid) {
        return res.status(400).json({ error: metadataValidation.error });
      }

      // Determine bucket name
      const bucketName = user.isAuthenticated 
        ? `user-${user.id.substring(0, 8)}` 
        : (process.env.R2_PUBLIC_BUCKET || 'public');

      // Ensure bucket exists
      const bucketResult = await ensureBucketExists(bucketName);
      if (bucketResult.error) {
        return res.status(500).json({ error: 'Failed to access storage bucket' });
      }

      // Generate unique filename
      const uniqueFilename = generateUniqueFilename(file.originalname);
      const r2Key = uniqueFilename;

      // Upload to R2
      const uploadResult = await uploadToR2(bucketName, r2Key, file.buffer, file.mimetype);
      if (!uploadResult.success) {
        return res.status(500).json({ error: 'Failed to upload file to storage' });
      }

      // Create R2 URL
      const r2Url = `${process.env.R2_ENDPOINT}/${bucketName}/${r2Key}`;

      // Generate short code
      let shortCode;
      let isUnique = false;
      while (!isUnique) {
        shortCode = nanoid(6);
        const { data: existing } = await supabase
          .from('urls')
          .select('short_code')
          .eq('short_code', shortCode)
          .single();
        if (!existing) {
          isUnique = true;
        }
      }

      // Prepare URL data
      const urlData = {
        short_code: shortCode,
        original_url: r2Url,
        custom_alias: false,
        clicks: 0,
        plan_id: quotaCheck.planId,
        url_type: 'file',
        file_type: file.mimetype,
        file_size: file.size,
        r2_bucket: bucketName,
        r2_key: r2Key,
        is_password_protected: isPasswordProtected === 'true' || isPasswordProtected === true,
        password_hash: (isPasswordProtected === 'true' || isPasswordProtected === true) ? hashPassword(password) : null,
        expiry_time: validExpiryTime
      };

      // Add user tracking
      if (user.isAuthenticated) {
        urlData.user_id = user.id;
        urlData.ip_address = null;
      } else {
        urlData.ip_address = user.ip;
        urlData.user_id = null;
      }

      // Insert URL into database
      const { data: createdUrl, error: urlError } = await supabase
        .from('urls')
        .insert([urlData])
        .select()
        .single();

      if (urlError) {
        console.error('Database error:', urlError);
        return res.status(500).json({ error: 'Failed to create short URL' });
      }

      // Track usage for enterprise users
      if (user.isAuthenticated) {
        // Check if user is enterprise
        const { data: userData } = await supabase
          .from('users')
          .select('user_type')
          .eq('id', user.id)
          .single();

        if (userData && userData.user_type === 'enterprise') {
          // Track file upload and storage for billing
          await trackFileUpload(user.id, file.size);
        }
      }

      // Insert metadata if provided
      if (metadataValidation.sanitized) {
        const dbMetadata = convertToDatabaseFormat(metadataValidation.sanitized);
        const { error: metaError } = await supabase
          .from('url_metadata')
          .insert([
            {
              url_id: createdUrl.id,
              ...dbMetadata
            }
          ]);

        if (metaError) {
          console.error('Metadata insertion error:', metaError);
        }

        // Track feature usage for enterprise users
        if (user.isAuthenticated) {
          const { data: userData } = await supabase
            .from('users')
            .select('user_type')
            .eq('id', user.id)
            .single();

          if (userData && userData.user_type === 'enterprise') {
            // Track each enabled feature
            const sanitized = metadataValidation.sanitized;
            if (sanitized.isDownloadEnable) await trackFeatureUsage(user.id, 'download_enable');
            if (sanitized.isScreenshotEnable) await trackFeatureUsage(user.id, 'screenshot');
            if (sanitized.isChatbotEnable) await trackFeatureUsage(user.id, 'chatbot');
            if (sanitized.isInterestForm) await trackFeatureUsage(user.id, 'interest_form');
            if (sanitized.isFollowUp) await trackFeatureUsage(user.id, 'follow_up');
          }
        }
      }

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

      res.status(201).json({
        success: true,
        data: {
          shortCode: createdUrl.short_code,
          shortUrl: `${baseUrl}/${createdUrl.short_code}`,
          fileType: file.mimetype,
          fileName: file.originalname,
          fileSize: formatFileSize(file.size),
          isPasswordProtected: createdUrl.is_password_protected,
          expiryTime: createdUrl.expiry_time,
          uploadedAt: createdUrl.created_at
        },
        quota: quotaCheck.usage
      });

    } catch (error) {
      console.error('Error in uploadFile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

/**
 * Get all files uploaded by user
 * GET /api/user/files
 */
const getUserFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      sort = 'created_at', 
      order = 'desc',
      type = 'all'
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Validate sort field
    const validSortFields = ['created_at', 'clicks', 'file_size'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'asc' : 'desc';

    // Build query
    let query = supabase
      .from('urls')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('url_type', 'file');

    // Filter by file type
    if (type !== 'all') {
      if (type === 'pdf') {
        query = query.eq('file_type', 'application/pdf');
      } else if (type === 'image') {
        query = query.or('file_type.like.%image%');
      }
    }

    // Apply sorting and pagination
    query = query
      .order(sortField, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limitNum - 1);

    const { data: files, error: filesError, count } = await query;

    if (filesError) {
      console.error('Error fetching files:', filesError);
      return res.status(500).json({ error: 'Failed to fetch files' });
    }

    // Get metadata for all files
    const fileIds = files.map(f => f.id);
    const { data: metadataList } = await supabase
      .from('url_metadata')
      .select('*')
      .in('url_id', fileIds);

    // Create metadata map
    const metadataMap = {};
    if (metadataList) {
      metadataList.forEach(meta => {
        metadataMap[meta.url_id] = {
          isDownloadEnable: meta.is_download_enable,
          isScreenShotEnable: meta.is_screenshot_enable,
          isChatbotEnable: meta.is_chatbot_enable,
          isInterestForm: meta.is_interest_form,
          isFollowUp: meta.is_follow_up,
          expireTime: meta.expire_time
        };
      });
    }

    // Format files
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const formattedFiles = files.map(file => {
      const now = new Date();
      const expiryTime = file.expiry_time ? new Date(file.expiry_time) : null;
      const isExpired = expiryTime ? now > expiryTime : false;

      // Extract original filename from r2_key
      const fileName = file.r2_key || 'unknown';

      return {
        id: file.id,
        shortCode: file.short_code,
        shortUrl: `${baseUrl}/${file.short_code}`,
        fileName: fileName,
        fileType: file.file_type,
        fileSize: formatFileSize(file.file_size),
        fileSizeBytes: file.file_size,
        clicks: file.clicks,
        isPasswordProtected: file.is_password_protected,
        expiryTime: file.expiry_time,
        isExpired: isExpired,
        createdAt: file.created_at,
        metadata: metadataMap[file.id] || null
      };
    });

    // Calculate summary
    const totalClicks = files.reduce((sum, file) => sum + (file.clicks || 0), 0);
    const totalSizeBytes = files.reduce((sum, file) => sum + (file.file_size || 0), 0);

    // Pagination info
    const totalPages = Math.ceil((count || 0) / limitNum);
    const pagination = {
      page: pageNum,
      limit: limitNum,
      totalFiles: count || 0,
      totalPages: totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    };

    res.json({
      success: true,
      data: {
        files: formattedFiles,
        pagination: pagination,
        summary: {
          totalFiles: count || 0,
          totalClicks: totalClicks,
          totalSize: formatFileSize(totalSizeBytes)
        }
      }
    });

  } catch (error) {
    console.error('Error in getUserFiles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  uploadFile,
  getUserFiles
};
