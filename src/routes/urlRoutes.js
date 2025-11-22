const express = require('express');
const router = express.Router();
const { shortenUrl, redirectUrl, getStats } = require('../controllers/urlController');
const { register, login, getProfile, registerEnterprise, loginEnterprise, activateEnterpriseAccount } = require('../controllers/authController');
const { getPlans, purchasePlan, switchPlan, cancelSubscription, getUserQuota } = require('../controllers/subscriptionController');
const { uploadFile, getUserFiles } = require('../controllers/fileUploadController');
const { getCurrentUsage, calculateMonthlyBill, generateMonthlyInvoice, getInvoices, markInvoicePaid } = require('../controllers/billingController');
const { identifyUser, requireAuth } = require('../middleware/authMiddleware');

// Apply identifyUser middleware to all routes
router.use(identifyUser);

// Individual user authentication routes
router.post('/api/auth/register', register);
router.post('/api/auth/login', login);
router.get('/api/auth/me', requireAuth, getProfile);

// Enterprise authentication routes
router.post('/api/auth/register/enterprise', registerEnterprise);
router.post('/api/auth/login/enterprise', loginEnterprise);
router.post('/api/auth/enterprise/activate', activateEnterpriseAccount);

// Plan routes (public)
router.get('/api/plans', getPlans);

// Subscription routes (requires authentication)
router.post('/api/subscriptions/purchase', requireAuth, purchasePlan);
router.put('/api/subscriptions/switch', requireAuth, switchPlan);
router.delete('/api/subscriptions/cancel', requireAuth, cancelSubscription);

// User quota route (requires authentication)
router.get('/api/user/quota', requireAuth, getUserQuota);

// Enterprise billing routes (requires authentication)
router.get('/api/billing/usage', requireAuth, getCurrentUsage);
router.get('/api/billing/calculate', requireAuth, calculateMonthlyBill);
router.post('/api/billing/generate-invoice', requireAuth, generateMonthlyInvoice);
router.get('/api/billing/invoices', requireAuth, getInvoices);
router.post('/api/billing/invoices/:invoiceId/pay', requireAuth, markInvoicePaid);

// File upload route (works for both authenticated and anonymous users)
router.post('/api/upload', uploadFile);

// Get user's uploaded files (requires authentication)
router.get('/api/user/files', requireAuth, getUserFiles);

// URL shortening routes (works for both authenticated and anonymous users)
router.post('/api/shorten', shortenUrl);
router.get('/api/stats/:shortCode', getStats);

// Redirect route (must be last to avoid conflicts)
router.get('/:shortCode', redirectUrl);

module.exports = router;
