const supabase = require('../config/supabase');
const { hashPassword, verifyPassword } = require('../utils/auth');

/**
 * Register a new individual user
 * POST /api/auth/register
 * Body: { email: string, password: string }
 */
const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(409).json({ 
        error: 'User with this email already exists' 
      });
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Create user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([
        {
          email,
          password_hash: passwordHash
        }
      ])
      .select('id, email, created_at')
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return res.status(500).json({ 
        error: 'Failed to create user account' 
      });
    }

    // Get free plan
    const { data: freePlan } = await supabase
      .from('plans')
      .select('id')
      .eq('name', 'free')
      .single();

    // Auto-assign free plan to new users
    if (freePlan) {
      await supabase
        .from('user_subscriptions')
        .insert([
          {
            user_id: newUser.id,
            plan_id: freePlan.id,
            status: 'active'
          }
        ]);
    }

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          createdAt: newUser.created_at
        },
        token: newUser.id // Simplified: using user ID as token
      }
    });

  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Login user
 * POST /api/auth/login
 * Body: { email: string, password: string }
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }

    // Verify password
    const isValidPassword = verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email
        },
        token: user.id // Simplified: using user ID as token
      }
    });

  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, created_at')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // Get active subscription
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select(`
        id,
        status,
        started_at,
        expires_at,
        plans (
          id,
          name,
          display_name,
          url_limit,
          price
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.created_at
        },
        subscription: subscription ? {
          id: subscription.id,
          status: subscription.status,
          startedAt: subscription.started_at,
          expiresAt: subscription.expires_at,
          plan: subscription.plans
        } : null
      }
    });

  } catch (error) {
    console.error('Error in getProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Register a new enterprise user
 * POST /api/auth/register/enterprise
 * Body: { 
 *   organizationName: string, 
 *   password: string, 
 *   website: string,
 *   logoUrl: string (optional),
 *   primaryColor: string (optional),
 *   secondaryColor: string (optional)
 * }
 */
const registerEnterprise = async (req, res) => {
  try {
    const { 
      organizationName, 
      password, 
      website,
      logoUrl,
      primaryColor,
      secondaryColor 
    } = req.body;

    // Validate input
    if (!organizationName || !password || !website) {
      return res.status(400).json({ 
        error: 'Organization name, password, and website are required' 
      });
    }

    // Validate organization name format (alphanumeric, spaces, hyphens allowed)
    const orgNameRegex = /^[a-zA-Z0-9\s\-_]+$/;
    if (!orgNameRegex.test(organizationName)) {
      return res.status(400).json({ 
        error: 'Organization name can only contain letters, numbers, spaces, hyphens, and underscores' 
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }

    // Validate website URL format
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlRegex.test(website)) {
      return res.status(400).json({ 
        error: 'Invalid website URL format' 
      });
    }

    // Validate color format if provided
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (primaryColor && !colorRegex.test(primaryColor)) {
      return res.status(400).json({ 
        error: 'Primary color must be in hex format (e.g., #007bff)' 
      });
    }
    if (secondaryColor && !colorRegex.test(secondaryColor)) {
      return res.status(400).json({ 
        error: 'Secondary color must be in hex format (e.g., #6c757d)' 
      });
    }

    // Check if organization already exists
    const { data: existingOrg } = await supabase
      .from('users')
      .select('id')
      .eq('organization_name', organizationName)
      .single();

    if (existingOrg) {
      return res.status(409).json({ 
        error: 'Organization with this name already exists' 
      });
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Create enterprise user with pending_payment status
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([
        {
          user_type: 'enterprise',
          organization_name: organizationName,
          password_hash: passwordHash,
          website: website,
          logo_url: logoUrl || null,
          primary_color: primaryColor || '#007bff',
          secondary_color: secondaryColor || '#6c757d',
          account_status: 'pending_payment'
        }
      ])
      .select('id, organization_name, website, logo_url, primary_color, secondary_color, account_status, created_at')
      .single();

    if (userError) {
      console.error('Error creating enterprise user:', userError);
      return res.status(500).json({ 
        error: 'Failed to create enterprise account' 
      });
    }

    // Create registration fee invoice ($10)
    const { error: invoiceError } = await supabase
      .from('enterprise_invoices')
      .insert([
        {
          user_id: newUser.id,
          invoice_type: 'registration_fee',
          amount: 10.00,
          currency: 'USD',
          status: 'pending',
          usage_details: { description: 'One-time registration fee' }
        }
      ]);

    if (invoiceError) {
      console.error('Error creating registration invoice:', invoiceError);
      // Continue anyway - invoice can be created manually
    }

    // Get enterprise plan
    const { data: enterprisePlan } = await supabase
      .from('plans')
      .select('id')
      .eq('name', 'enterprise')
      .single();

    // Assign enterprise plan (with pending_payment status)
    if (enterprisePlan) {
      await supabase
        .from('user_subscriptions')
        .insert([
          {
            user_id: newUser.id,
            plan_id: enterprisePlan.id,
            status: 'pending_payment'
          }
        ]);
    }

    res.status(201).json({
      success: true,
      message: 'Enterprise account created successfully. Please complete the $10 registration fee payment to activate your account.',
      data: {
        user: {
          id: newUser.id,
          organizationName: newUser.organization_name,
          website: newUser.website,
          logoUrl: newUser.logo_url,
          primaryColor: newUser.primary_color,
          secondaryColor: newUser.secondary_color,
          accountStatus: newUser.account_status,
          createdAt: newUser.created_at
        },
        token: newUser.id, // Simplified: using user ID as token
        registrationFee: {
          amount: 10.00,
          currency: 'USD',
          status: 'pending'
        }
      }
    });

  } catch (error) {
    console.error('Error in registerEnterprise:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Login enterprise user (using organization name)
 * POST /api/auth/login/enterprise
 * Body: { organizationName: string, password: string }
 */
const loginEnterprise = async (req, res) => {
  try {
    const { organizationName, password } = req.body;

    // Validate input
    if (!organizationName || !password) {
      return res.status(400).json({ 
        error: 'Organization name and password are required' 
      });
    }

    // Find enterprise user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, organization_name, password_hash, account_status, website, logo_url, primary_color, secondary_color')
      .eq('organization_name', organizationName)
      .eq('user_type', 'enterprise')
      .single();

    if (userError || !user) {
      return res.status(401).json({ 
        error: 'Invalid organization name or password' 
      });
    }

    // Verify password
    const isValidPassword = verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid organization name or password' 
      });
    }

    // Check account status
    if (user.account_status === 'pending_payment') {
      return res.status(403).json({ 
        error: 'Account pending payment',
        message: 'Please complete the $10 registration fee payment to activate your account.',
        accountStatus: 'pending_payment'
      });
    }

    if (user.account_status === 'suspended') {
      return res.status(403).json({ 
        error: 'Account suspended',
        message: 'Your account has been suspended. Please contact support.',
        accountStatus: 'suspended'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          organizationName: user.organization_name,
          website: user.website,
          logoUrl: user.logo_url,
          primaryColor: user.primary_color,
          secondaryColor: user.secondary_color,
          accountStatus: user.account_status
        },
        token: user.id // Simplified: using user ID as token
      }
    });

  } catch (error) {
    console.error('Error in loginEnterprise:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Activate enterprise account after payment
 * POST /api/auth/enterprise/activate
 * Body: { userId: string, paymentReference: string }
 */
const activateEnterpriseAccount = async (req, res) => {
  try {
    const { userId, paymentReference } = req.body;

    if (!userId || !paymentReference) {
      return res.status(400).json({ 
        error: 'User ID and payment reference are required' 
      });
    }

    // Verify user exists and is enterprise
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, organization_name, user_type, account_status')
      .eq('id', userId)
      .eq('user_type', 'enterprise')
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        error: 'Enterprise user not found' 
      });
    }

    if (user.account_status === 'active') {
      return res.status(400).json({ 
        error: 'Account is already active' 
      });
    }

    // Update user account status to active
    const { error: updateUserError } = await supabase
      .from('users')
      .update({ account_status: 'active' })
      .eq('id', userId);

    if (updateUserError) {
      console.error('Error activating user:', updateUserError);
      return res.status(500).json({ error: 'Failed to activate account' });
    }

    // Update registration invoice to paid
    const { error: invoiceError } = await supabase
      .from('enterprise_invoices')
      .update({ 
        status: 'paid',
        payment_date: new Date().toISOString(),
        payment_reference: paymentReference
      })
      .eq('user_id', userId)
      .eq('invoice_type', 'registration_fee')
      .eq('status', 'pending');

    if (invoiceError) {
      console.error('Error updating invoice:', invoiceError);
      // Continue anyway
    }

    // Update subscription status to active
    const { error: subError } = await supabase
      .from('user_subscriptions')
      .update({ 
        status: 'active',
        started_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('status', 'pending_payment');

    if (subError) {
      console.error('Error activating subscription:', subError);
    }

    // Initialize usage tracking for current month
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    await supabase
      .from('usage_tracking')
      .insert([
        {
          user_id: userId,
          tracking_period: currentMonth.toISOString(),
          urls_created: 0,
          files_uploaded: 0,
          storage_used_bytes: 0,
          features_used: {}
        }
      ]);

    res.json({
      success: true,
      message: 'Enterprise account activated successfully',
      data: {
        userId: userId,
        organizationName: user.organization_name,
        accountStatus: 'active'
      }
    });

  } catch (error) {
    console.error('Error in activateEnterpriseAccount:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  registerEnterprise,
  loginEnterprise,
  activateEnterpriseAccount
};
