const { nanoid } = require('nanoid');
const supabase = require('../config/supabase');
const { isValidUrl, isValidAlias } = require('../utils/urlValidator');
const { validateMetadata, convertToDatabaseFormat, convertToApiFormat } = require('../utils/metadataValidator');

/**
 * Shorten a URL
 * POST /api/shorten
 * Body: { url: string, alias?: string, metadata?: object }
 */
const shortenUrl = async (req, res) => {
  try {
    const { url, alias, metadata } = req.body;

    // Validate URL
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format. Must include http:// or https://' });
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

    // Insert URL into database
    const { data: urlData, error: urlError } = await supabase
      .from('urls')
      .insert([
        {
          short_code: shortCode,
          original_url: url,
          custom_alias: isCustomAlias,
          clicks: 0
        }
      ])
      .select()
      .single();

    if (urlError) {
      console.error('Database error:', urlError);
      return res.status(500).json({ error: 'Failed to create short URL' });
    }

    // Insert metadata if provided
    let metadataResponse = null;
    if (metadataValidation.sanitized) {
      const dbMetadata = convertToDatabaseFormat(metadataValidation.sanitized);
      const { data: metaData, error: metaError } = await supabase
        .from('url_metadata')
        .insert([
          {
            url_id: urlData.id,
            ...dbMetadata
          }
        ])
        .select()
        .single();

      if (metaError) {
        console.error('Metadata insertion error:', metaError);
        // Delete the URL if metadata fails
        await supabase.from('urls').delete().eq('id', urlData.id);
        return res.status(500).json({ error: 'Failed to save URL metadata' });
      }

      metadataResponse = convertToApiFormat(metaData);
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    const response = {
      success: true,
      data: {
        shortCode: urlData.short_code,
        shortUrl: `${baseUrl}/${urlData.short_code}`,
        originalUrl: urlData.original_url,
        createdAt: urlData.created_at
      }
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
 * Redirect to original URL
 * GET /:shortCode
 */
const redirectUrl = async (req, res) => {
  try {
    const { shortCode } = req.params;

    // Get URL from database with metadata
    const { data: urlData, error: urlError } = await supabase
      .from('urls')
      .select('*')
      .eq('short_code', shortCode)
      .single();

    if (urlError || !urlData) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Check for metadata and expiration
    const { data: metaData } = await supabase
      .from('url_metadata')
      .select('*')
      .eq('url_id', urlData.id)
      .single();

    // Check if URL has expired
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

    // Increment click count
    await supabase
      .from('urls')
      .update({ clicks: urlData.clicks + 1 })
      .eq('short_code', shortCode);

    // Redirect to original URL
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
        createdAt: urlData.created_at
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
