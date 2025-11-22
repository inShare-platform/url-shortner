const supabase = require('../config/supabase');

/**
 * Middleware to identify user (registered or anonymous by IP)
 * Attaches user info to req.user
 */
const identifyUser = async (req, res, next) => {
  try {
    // Try to get session token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Look up user by session token
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', token) // Simplified: using user ID as token
        .single();
      
      if (!error && userData) {
        req.user = {
          id: userData.id,
          email: userData.email,
          isAuthenticated: true
        };
        return next();
      }
    }
    
    // If no valid token, treat as anonymous user with IP tracking
    const ipAddress = req.ip || 
                      req.headers['x-forwarded-for']?.split(',')[0] || 
                      req.connection.remoteAddress || 
                      req.socket.remoteAddress;
    
    req.user = {
      ip: ipAddress,
      isAuthenticated: false
    };
    
    next();
  } catch (error) {
    console.error('Error in identifyUser middleware:', error);
    // On error, treat as anonymous
    req.user = {
      ip: req.ip || req.connection.remoteAddress,
      isAuthenticated: false
    };
    next();
  }
};

/**
 * Middleware to require authentication
 */
const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.isAuthenticated) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please login to access this resource'
    });
  }
  next();
};

module.exports = {
  identifyUser,
  requireAuth
};
