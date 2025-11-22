const { nanoid } = require('nanoid');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2Client = require('../config/r2');
const supabase = require('../config/supabase');
const { isValidUrl, isValidAlias } = require('../utils/urlValidator');
const { validateMetadata, convertToDatabaseFormat, convertToApiFormat } = require('../utils/metadataValidator');
const { verifyPassword } = require('../utils/auth');
const { trackUrlCreation, trackFeatureUsage } = require('./billingController');

/**
 * Check quota for user or IP address
 */
const checkQuota = async (user) => {
  try {
    if (user.isAuthenticated) {
      // For authenticated users, check subscription and plan limits
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
          message: 'No active subscription found. Please purchase a plan to shorten URLs.'
        };
      }

      const urlLimit = subscription.plans.url_limit;
      const planId = subscription.plan_id;

      // If unlimited (Enterprise)
      if (urlLimit === null) {
        return { allowed: true, planId, isUnlimited: true };
      }

      // Count user's URLs
      const { count: urlCount, error: countError } = await supabase
        .from('urls')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) {
        console.error('Error counting URLs:', countError);
        return { 
          allowed: false, 
          error: 'Failed to check quota' 
        };
      }

      const remaining = urlLimit - (urlCount || 0);

      if (remaining <= 0) {
        return { 
          allowed: false, 
          error: 'quota_exceeded',
          message: `You have reached your plan limit of ${urlLimit} URLs. Please upgrade your plan.`,
          usage: { used: urlCount, limit: urlLimit, remaining: 0 }
        };
      }

      return { 
        allowed: true, 
        planId,
        isUnlimited: false,
        usage: { used: urlCount, limit: urlLimit, remaining }
      };

    } else {
      // For anonymous users, check IP-based free quota (2 URLs)
      const { data: freePlan } = await supabase
        .from('plans')
        .select('id, url_limit')
        .eq('name', 'free')
        .single();

      if (!freePlan) {
        return { 
          allowed: false, 
          error: 'Free plan not configured' 
        };
      }

      const freeLimit = freePlan.url_limit || 2;
      const planId = freePlan.id;

      // Count URLs created by this IP
      const { count: urlCount, error: countError } = await supabase
        .from('urls')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', user.ip)
        .is('user_id', null);

      if (countError) {
        console.error('Error counting URLs:', countError);
        return { 
          allowed: false, 
          error: 'Failed to check quota' 
        };
      }

      const remaining = freeLimit - (urlCount || 0);

      if (remaining <= 0) {
        return { 
          allowed: false, 
          error: 'quota_exceeded',
          message: `Anonymous users are limited to ${freeLimit} URLs. Please register for more URLs.`,
          usage: { used: urlCount, limit: freeLimit, remaining: 0 }
        };
      }

      return { 
        allowed: true, 
        planId,
        isUnlimited: false,
        usage: { used: urlCount, limit: freeLimit, remaining }
      };
    }
  } catch (error) {
    console.error('Error in checkQuota:', error);
    return { 
      allowed: false, 
      error: 'Internal error checking quota' 
    };
  }
};

/**
 * Shorten a URL
 * POST /api/shorten
 * Body: { url: string, alias?: string, urlType?: string, expiryTime?: string, metadata?: object }
 */
const shortenUrl = async (req, res) => {
  try {
    const { url, alias, urlType, expiryTime, metadata } = req.body;
    const user = req.user;

    // Validate URL
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format. Must include http:// or https://' });
    }

    // Check quota before proceeding
    const quotaCheck = await checkQuota(user);
    if (!quotaCheck.allowed) {
      return res.status(403).json({ 
        error: quotaCheck.error,
        message: quotaCheck.message,
        usage: quotaCheck.usage
      });
    }

    // Validate metadata if provided
    const metadataValidation = validateMetadata(metadata);
    if (!metadataValidation.valid) {
      return res.status(400).json({ error: metadataValidation.error });
    }

    let shortCode;
    let isCustomAlias = false;

    // If alias is provided, validate and use it
    if (alias) {
      if (!isValidAlias(alias)) {
        return res.status(400).json({ 
          error: 'Invalid alias. Must be 3-20 characters, alphanumeric with dashes or underscores only' 
        });
      }

      // Check if alias already exists
      const { data: existingAlias } = await supabase
        .from('urls')
        .select('short_code')
        .eq('short_code', alias)
        .single();

      if (existingAlias) {
        return res.status(409).json({ error: 'Alias already exists. Please choose a different one.' });
      }

      shortCode = alias;
      isCustomAlias = true;
    } else {
      // Generate a unique short code
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
    }

    // Validate expiry time if provided
    let validExpiryTime = null;
    if (expiryTime) {
      const expiryDate = new Date(expiryTime);
      if (isNaN(expiryDate.getTime())) {
        return res.status(400).json({ error: 'Invalid expiry time format. Use ISO 8601 format.' });
      }
      if (expiryDate <= new Date()) {
        return res.status(400).json({ error: 'Expiry time must be in the future.' });
      }
      validExpiryTime = expiryDate.toISOString();
    }

    // Prepare URL data
    const urlData = {
      short_code: shortCode,
      original_url: url,
      custom_alias: isCustomAlias,
      clicks: 0,
      plan_id: quotaCheck.planId,
      url_type: urlType || 'standard'
    };

    // Add user tracking
    if (user.isAuthenticated) {
      urlData.user_id = user.id;
      urlData.ip_address = null;
    } else {
      urlData.ip_address = user.ip;
      urlData.user_id = null;
    }

    // Add expiry time if provided
    if (validExpiryTime) {
      urlData.expiry_time = validExpiryTime;
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
        // Track URL creation for billing
        await trackUrlCreation(user.id);
      }
    }

    // Insert metadata if provided
    let metadataResponse = null;
    if (metadataValidation.sanitized) {
      const dbMetadata = convertToDatabaseFormat(metadataValidation.sanitized);
      const { data: metaData, error: metaError } = await supabase
        .from('url_metadata')
        .insert([
          {
            url_id: createdUrl.id,
            ...dbMetadata
          }
        ])
        .select()
        .single();

      if (metaError) {
        console.error('Metadata insertion error:', metaError);
        // Delete the URL if metadata fails
        await supabase.from('urls').delete().eq('id', createdUrl.id);
        return res.status(500).json({ error: 'Failed to save URL metadata' });
      }

      metadataResponse = convertToApiFormat(metaData);

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

    const response = {
      success: true,
      data: {
        shortCode: createdUrl.short_code,
        shortUrl: `${baseUrl}/${createdUrl.short_code}`,
        originalUrl: createdUrl.original_url,
        urlType: createdUrl.url_type,
        expiryTime: createdUrl.expiry_time,
        createdAt: createdUrl.created_at
      },
      quota: quotaCheck.usage
    };

    if (metadataResponse) {
      response.data.metadata = metadataResponse;
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Redirect to original URL or generate signed R2 URL for files
 * GET /:shortCode
 * Query params: ?password=xxx (for password-protected files)
 */
const redirectUrl = async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { password } = req.query;

    // Get URL from database
    const { data: urlData, error: urlError } = await supabase
      .from('urls')
      .select('*')
      .eq('short_code', shortCode)
      .single();

    if (urlError || !urlData) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Check if URL has expired
    if (urlData.expiry_time) {
      const expirationDate = new Date(urlData.expiry_time);
      const now = new Date();
      
      if (now > expirationDate) {
        return res.status(410).json({ 
          error: 'This short URL has expired',
          expiredAt: urlData.expiry_time
        });
      }
    }

    // Check for metadata and expiration from metadata table
    const { data: metaData } = await supabase
      .from('url_metadata')
      .select('*')
      .eq('url_id', urlData.id)
      .single();

    if (metaData && metaData.expire_time) {
      const expirationDate = new Date(metaData.expire_time);
      const now = new Date();
      
      if (now > expirationDate) {
        return res.status(410).json({ 
          error: 'This short URL has expired',
          expiredAt: metaData.expire_time
        });
      }
    }

    // Check if password protected
    if (urlData.is_password_protected) {
      if (!password) {
        return res.status(401).json({ 
          error: 'Password required',
          message: 'This link is password protected. Please provide password in query parameter: ?password=xxx'
        });
      }

      // Verify password
      const isValidPassword = verifyPassword(password, urlData.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ 
          error: 'Invalid password',
          message: 'The password you provided is incorrect'
        });
      }
    }

    // Increment click count
    await supabase
      .from('urls')
      .update({ clicks: urlData.clicks + 1 })
      .eq('short_code', shortCode);

    // Handle file URLs (from R2) - generate signed URL
    if (urlData.url_type === 'file' && urlData.r2_bucket && urlData.r2_key) {
      try {
        // Generate signed URL (valid for 1 hour)
        const command = new GetObjectCommand({
          Bucket: urlData.r2_bucket,
          Key: urlData.r2_key,
        });

        const signedUrl = await getSignedUrl(r2Client, command, { 
          expiresIn: 3600 // 1 hour in seconds
        });

        // Redirect to signed R2 URL
        return res.redirect(signedUrl);
      } catch (error) {
        console.error('Error generating signed URL:', error);
        return res.status(500).json({ error: 'Failed to generate file access URL' });
      }
    }

    // For regular URLs, redirect directly
    res.redirect(urlData.original_url);

  } catch (error) {
    console.error('Error redirecting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get URL statistics
 * GET /api/stats/:shortCode
 */
const getStats = async (req, res) => {
  try {
    const { shortCode } = req.params;

    const { data: urlData, error: urlError } = await supabase
      .from('urls')
      .select('*')
      .eq('short_code', shortCode)
      .single();

    if (urlError || !urlData) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Get metadata if exists
    const { data: metaData } = await supabase
      .from('url_metadata')
      .select('*')
      .eq('url_id', urlData.id)
      .single();

    const response = {
      success: true,
      data: {
        shortCode: urlData.short_code,
        originalUrl: urlData.original_url,
        clicks: urlData.clicks,
        customAlias: urlData.custom_alias,
        urlType: urlData.url_type,
        expiryTime: urlData.expiry_time,
        createdAt: urlData.created_at,
        createdBy: urlData.user_id ? 'registered_user' : 'anonymous'
      }
    };

    // Include metadata if it exists
    if (metaData) {
      response.data.metadata = convertToApiFormat(metaData);
    }

    res.json(response);

  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  shortenUrl,
  redirectUrl,
  getStats
};
