const supabase = require('../config/supabase');

/**
 * Track URL creation for enterprise billing
 * This should be called whenever an enterprise user creates a URL
 */
const trackUrlCreation = async (userId) => {
  try {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    // Get or create usage tracking for current month
    const { data: existingTracking } = await supabase
      .from('usage_tracking')
      .select('id, urls_created')
      .eq('user_id', userId)
      .eq('tracking_period', currentMonth.toISOString())
      .single();

    if (existingTracking) {
      // Update existing tracking
      await supabase
        .from('usage_tracking')
        .update({ urls_created: existingTracking.urls_created + 1 })
        .eq('id', existingTracking.id);
    } else {
      // Create new tracking record
      await supabase
        .from('usage_tracking')
        .insert([
          {
            user_id: userId,
            tracking_period: currentMonth.toISOString(),
            urls_created: 1,
            files_uploaded: 0,
            storage_used_bytes: 0,
            features_used: {}
          }
        ]);
    }
  } catch (error) {
    console.error('Error tracking URL creation:', error);
  }
};

/**
 * Track file upload for enterprise billing
 */
const trackFileUpload = async (userId, fileSize) => {
  try {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const { data: existingTracking } = await supabase
      .from('usage_tracking')
      .select('id, files_uploaded, storage_used_bytes')
      .eq('user_id', userId)
      .eq('tracking_period', currentMonth.toISOString())
      .single();

    if (existingTracking) {
      await supabase
        .from('usage_tracking')
        .update({ 
          files_uploaded: existingTracking.files_uploaded + 1,
          storage_used_bytes: existingTracking.storage_used_bytes + fileSize
        })
        .eq('id', existingTracking.id);
    } else {
      await supabase
        .from('usage_tracking')
        .insert([
          {
            user_id: userId,
            tracking_period: currentMonth.toISOString(),
            urls_created: 0,
            files_uploaded: 1,
            storage_used_bytes: fileSize,
            features_used: {}
          }
        ]);
    }
  } catch (error) {
    console.error('Error tracking file upload:', error);
  }
};

/**
 * Track feature usage for enterprise billing
 */
const trackFeatureUsage = async (userId, featureName) => {
  try {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const { data: existingTracking } = await supabase
      .from('usage_tracking')
      .select('id, features_used')
      .eq('user_id', userId)
      .eq('tracking_period', currentMonth.toISOString())
      .single();

    if (existingTracking) {
      const featuresUsed = existingTracking.features_used || {};
      featuresUsed[featureName] = (featuresUsed[featureName] || 0) + 1;

      await supabase
        .from('usage_tracking')
        .update({ features_used: featuresUsed })
        .eq('id', existingTracking.id);
    } else {
      const featuresUsed = { [featureName]: 1 };
      await supabase
        .from('usage_tracking')
        .insert([
          {
            user_id: userId,
            tracking_period: currentMonth.toISOString(),
            urls_created: 0,
            files_uploaded: 0,
            storage_used_bytes: 0,
            features_used: featuresUsed
          }
        ]);
    }
  } catch (error) {
    console.error('Error tracking feature usage:', error);
  }
};

/**
 * Get current month usage for an enterprise user
 * GET /api/billing/usage
 */
const getCurrentUsage = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is enterprise
    const { data: user } = await supabase
      .from('users')
      .select('user_type, organization_name')
      .eq('id', userId)
      .single();

    if (!user || user.user_type !== 'enterprise') {
      return res.status(403).json({ 
        error: 'This endpoint is only available for enterprise users' 
      });
    }

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const { data: usage, error } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('tracking_period', currentMonth.toISOString())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching usage:', error);
      return res.status(500).json({ error: 'Failed to fetch usage data' });
    }

    res.json({
      success: true,
      data: {
        trackingPeriod: currentMonth.toISOString(),
        usage: usage || {
          urls_created: 0,
          files_uploaded: 0,
          storage_used_bytes: 0,
          features_used: {}
        }
      }
    });

  } catch (error) {
    console.error('Error in getCurrentUsage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Calculate monthly bill based on usage
 * GET /api/billing/calculate
 */
const calculateMonthlyBill = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is enterprise
    const { data: user } = await supabase
      .from('users')
      .select('user_type, organization_name')
      .eq('id', userId)
      .single();

    if (!user || user.user_type !== 'enterprise') {
      return res.status(403).json({ 
        error: 'This endpoint is only available for enterprise users' 
      });
    }

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('tracking_period', currentMonth.toISOString())
      .single();

    if (!usage) {
      return res.json({
        success: true,
        data: {
          trackingPeriod: currentMonth.toISOString(),
          totalAmount: 0,
          breakdown: {
            urls: { count: 0, rate: 0.10, amount: 0 },
            files: { count: 0, rate: 0.05, amount: 0 },
            storage: { bytes: 0, rate: 0.01, amount: 0 },
            features: []
          }
        }
      });
    }

    // Pricing rates (example rates - adjust as needed)
    const RATES = {
      url: 0.10, // $0.10 per URL
      file: 0.05, // $0.05 per file
      storagePerGB: 0.01, // $0.01 per GB
      features: {
        chatbot: 0.50,
        screenshot: 0.25,
        interest_form: 0.30,
        download_enable: 0.15,
        follow_up: 0.40
      }
    };

    // Calculate charges
    const urlCharge = usage.urls_created * RATES.url;
    const fileCharge = usage.files_uploaded * RATES.file;
    const storageGB = usage.storage_used_bytes / (1024 * 1024 * 1024);
    const storageCharge = storageGB * RATES.storagePerGB;

    const featuresUsed = usage.features_used || {};
    const featureCharges = [];
    let totalFeatureCharge = 0;

    for (const [feature, count] of Object.entries(featuresUsed)) {
      const rate = RATES.features[feature] || 0;
      const amount = count * rate;
      totalFeatureCharge += amount;
      featureCharges.push({
        feature,
        count,
        rate,
        amount: parseFloat(amount.toFixed(2))
      });
    }

    const totalAmount = urlCharge + fileCharge + storageCharge + totalFeatureCharge;

    res.json({
      success: true,
      data: {
        trackingPeriod: currentMonth.toISOString(),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        breakdown: {
          urls: {
            count: usage.urls_created,
            rate: RATES.url,
            amount: parseFloat(urlCharge.toFixed(2))
          },
          files: {
            count: usage.files_uploaded,
            rate: RATES.file,
            amount: parseFloat(fileCharge.toFixed(2))
          },
          storage: {
            bytes: usage.storage_used_bytes,
            gigabytes: parseFloat(storageGB.toFixed(4)),
            rate: RATES.storagePerGB,
            amount: parseFloat(storageCharge.toFixed(2))
          },
          features: featureCharges
        }
      }
    });

  } catch (error) {
    console.error('Error in calculateMonthlyBill:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Generate monthly invoice for enterprise user
 * POST /api/billing/generate-invoice
 * Body: { month: string (optional, format: YYYY-MM) }
 */
const generateMonthlyInvoice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { month } = req.body;

    // Verify user is enterprise
    const { data: user } = await supabase
      .from('users')
      .select('user_type, organization_name')
      .eq('id', userId)
      .single();

    if (!user || user.user_type !== 'enterprise') {
      return res.status(403).json({ 
        error: 'This endpoint is only available for enterprise users' 
      });
    }

    // Determine billing period
    let billingPeriodStart;
    if (month) {
      billingPeriodStart = new Date(month + '-01');
    } else {
      // Previous month
      billingPeriodStart = new Date();
      billingPeriodStart.setMonth(billingPeriodStart.getMonth() - 1);
      billingPeriodStart.setDate(1);
    }
    billingPeriodStart.setHours(0, 0, 0, 0);

    const billingPeriodEnd = new Date(billingPeriodStart);
    billingPeriodEnd.setMonth(billingPeriodEnd.getMonth() + 1);
    billingPeriodEnd.setDate(0); // Last day of month
    billingPeriodEnd.setHours(23, 59, 59, 999);

    // Get usage for the period
    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('tracking_period', billingPeriodStart.toISOString())
      .single();

    if (!usage) {
      return res.status(404).json({ 
        error: 'No usage data found for the specified period' 
      });
    }

    // Calculate charges (same logic as calculateMonthlyBill)
    const RATES = {
      url: 0.10,
      file: 0.05,
      storagePerGB: 0.01,
      features: {
        chatbot: 0.50,
        screenshot: 0.25,
        interest_form: 0.30,
        download_enable: 0.15,
        follow_up: 0.40
      }
    };

    const urlCharge = usage.urls_created * RATES.url;
    const fileCharge = usage.files_uploaded * RATES.file;
    const storageGB = usage.storage_used_bytes / (1024 * 1024 * 1024);
    const storageCharge = storageGB * RATES.storagePerGB;

    const featuresUsed = usage.features_used || {};
    const featureCharges = {};
    let totalFeatureCharge = 0;

    for (const [feature, count] of Object.entries(featuresUsed)) {
      const rate = RATES.features[feature] || 0;
      const amount = count * rate;
      totalFeatureCharge += amount;
      featureCharges[feature] = {
        count,
        rate,
        amount: parseFloat(amount.toFixed(2))
      };
    }

    const totalAmount = urlCharge + fileCharge + storageCharge + totalFeatureCharge;

    const usageDetails = {
      urls: { count: usage.urls_created, rate: RATES.url, amount: parseFloat(urlCharge.toFixed(2)) },
      files: { count: usage.files_uploaded, rate: RATES.file, amount: parseFloat(fileCharge.toFixed(2)) },
      storage: { 
        bytes: usage.storage_used_bytes, 
        gigabytes: parseFloat(storageGB.toFixed(4)),
        rate: RATES.storagePerGB, 
        amount: parseFloat(storageCharge.toFixed(2)) 
      },
      features: featureCharges
    };

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('enterprise_invoices')
      .insert([
        {
          user_id: userId,
          invoice_type: 'monthly_usage',
          billing_period_start: billingPeriodStart.toISOString(),
          billing_period_end: billingPeriodEnd.toISOString(),
          amount: parseFloat(totalAmount.toFixed(2)),
          currency: 'USD',
          status: 'pending',
          usage_details: usageDetails
        }
      ])
      .select('*')
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }

    res.status(201).json({
      success: true,
      message: 'Monthly invoice generated successfully',
      data: {
        invoice: {
          id: invoice.id,
          invoiceType: invoice.invoice_type,
          billingPeriod: {
            start: invoice.billing_period_start,
            end: invoice.billing_period_end
          },
          amount: invoice.amount,
          currency: invoice.currency,
          status: invoice.status,
          usageDetails: invoice.usage_details,
          createdAt: invoice.created_at
        }
      }
    });

  } catch (error) {
    console.error('Error in generateMonthlyInvoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get all invoices for enterprise user
 * GET /api/billing/invoices
 */
const getInvoices = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is enterprise
    const { data: user } = await supabase
      .from('users')
      .select('user_type')
      .eq('id', userId)
      .single();

    if (!user || user.user_type !== 'enterprise') {
      return res.status(403).json({ 
        error: 'This endpoint is only available for enterprise users' 
      });
    }

    const { data: invoices, error } = await supabase
      .from('enterprise_invoices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invoices:', error);
      return res.status(500).json({ error: 'Failed to fetch invoices' });
    }

    res.json({
      success: true,
      data: {
        invoices: invoices.map(inv => ({
          id: inv.id,
          invoiceType: inv.invoice_type,
          billingPeriod: inv.billing_period_start && inv.billing_period_end ? {
            start: inv.billing_period_start,
            end: inv.billing_period_end
          } : null,
          amount: inv.amount,
          currency: inv.currency,
          status: inv.status,
          paymentDate: inv.payment_date,
          paymentReference: inv.payment_reference,
          usageDetails: inv.usage_details,
          createdAt: inv.created_at
        }))
      }
    });

  } catch (error) {
    console.error('Error in getInvoices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Mark invoice as paid
 * POST /api/billing/invoices/:invoiceId/pay
 * Body: { paymentReference: string, paymentMethod: string (optional) }
 */
const markInvoicePaid = async (req, res) => {
  try {
    const userId = req.user.id;
    const { invoiceId } = req.params;
    const { paymentReference, paymentMethod } = req.body;

    if (!paymentReference) {
      return res.status(400).json({ 
        error: 'Payment reference is required' 
      });
    }

    // Verify invoice belongs to user
    const { data: invoice } = await supabase
      .from('enterprise_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', userId)
      .single();

    if (!invoice) {
      return res.status(404).json({ 
        error: 'Invoice not found' 
      });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ 
        error: 'Invoice is already marked as paid' 
      });
    }

    // Update invoice
    const { error: updateError } = await supabase
      .from('enterprise_invoices')
      .update({ 
        status: 'paid',
        payment_date: new Date().toISOString(),
        payment_reference: paymentReference,
        payment_method: paymentMethod || null
      })
      .eq('id', invoiceId);

    if (updateError) {
      console.error('Error updating invoice:', updateError);
      return res.status(500).json({ error: 'Failed to update invoice' });
    }

    res.json({
      success: true,
      message: 'Invoice marked as paid successfully'
    });

  } catch (error) {
    console.error('Error in markInvoicePaid:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  trackUrlCreation,
  trackFileUpload,
  trackFeatureUsage,
  getCurrentUsage,
  calculateMonthlyBill,
  generateMonthlyInvoice,
  getInvoices,
  markInvoicePaid
};
