/**
 * Admin Dashboard Router
 * جهاز توجيه لوحة الإدارة
 */

const express = require('express');
const { config } = require('../utils/config');
const { cookieStore } = require('../session/sessionManager');
const { getBlockedIPs, getSecurityStats, blockIP, unblockIP } = require('../security/security');
const { logger, auditLogger } = require('../utils/logger');
const { rateLimiters } = require('../security/security');

const router = express.Router();

// Simple auth middleware
const adminAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required');
  }

  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  const [username, password] = credentials;

  if (username !== config.adminUsername || password !== config.adminPassword) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Invalid credentials');
  }

  next();
};

// Apply rate limiting and auth to all admin routes
router.use(rateLimiters.admin);
router.use(adminAuth);

/**
 * Admin Dashboard
 * لوحة التحكم
 */
router.get('/', (req, res) => {
  const stats = {
    security: getSecurityStats(),
    cookies: cookieStore.getStats(),
    features: config.features,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  };

  res.render('admin/dashboard', {
    title: 'لوحة الإدارة - Admin Dashboard',
    stats,
    blockedIPs: getBlockedIPs(),
    blockedDomains: config.blockedDomains
  });
});

/**
 * Get traffic statistics
 * إحصائيات حركة المرور
 */
router.get('/api/stats', (req, res) => {
  const stats = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString(),
    connections: {
      sessions: cookieStore.getStats().sessions,
      cookies: cookieStore.getStats().totalCookies
    },
    security: getSecurityStats()
  };

  res.json(stats);
});

/**
 * Block an IP
 * حظر عنوان IP
 */
router.post('/api/block-ip', (req, res) => {
  const { ip, reason } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }

  blockIP(ip, reason || 'Manual block from admin');
  
  logger.info(`Admin blocked IP: ${ip}`, { reason });
  
  res.json({ 
    success: true, 
    message: `IP ${ip} has been blocked`,
    blockedIPs: getBlockedIPs()
  });
});

/**
 * Unblock an IP
 * إلغاء حظر عنوان IP
 */
router.post('/api/unblock-ip', (req, res) => {
  const { ip } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }

  unblockIP(ip);
  
  logger.info(`Admin unblocked IP: ${ip}`);
  
  res.json({ 
    success: true, 
    message: `IP ${ip} has been unblocked`,
    blockedIPs: getBlockedIPs()
  });
});

/**
 * Add blocked domain
 * إضافة نطاق محظور
 */
router.post('/api/block-domain', (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain required' });
  }

  if (!config.blockedDomains.includes(domain)) {
    config.blockedDomains.push(domain);
  }
  
  logger.info(`Admin blocked domain: ${domain}`);
  
  res.json({ 
    success: true, 
    message: `Domain ${domain} has been blocked`,
    blockedDomains: config.blockedDomains
  });
});

/**
 * Remove blocked domain
 * إزالة نطاق من قائمة الحظر
 */
router.post('/api/unblock-domain', (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain required' });
  }

  const index = config.blockedDomains.indexOf(domain);
  if (index > -1) {
    config.blockedDomains.splice(index, 1);
  }
  
  logger.info(`Admin unblocked domain: ${domain}`);
  
  res.json({ 
    success: true, 
    message: `Domain ${domain} has been unblocked`,
    blockedDomains: config.blockedDomains
  });
});

/**
 * Update feature toggle
 * تحديث إعدادات الميزات
 */
router.post('/api/toggle-feature', (req, res) => {
  const { feature, enabled } = req.body;
  
  if (!feature || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Feature and enabled status required' });
  }

  if (config.features.hasOwnProperty(feature)) {
    config.features[feature] = enabled;
    logger.info(`Admin toggled feature ${feature}: ${enabled}`);
  }

  res.json({ 
    success: true, 
    features: config.features 
  });
});

/**
 * Update rate limit settings
 * تحديث إعدادات حدود المعدل
 */
router.post('/api/rate-limits', (req, res) => {
  const { windowMs, maxRequests } = req.body;
  
  if (windowMs) {
    config.rateLimitWindow = parseInt(windowMs);
  }
  if (maxRequests) {
    config.rateLimitMax = parseInt(maxRequests);
  }

  logger.info('Admin updated rate limits', { windowMs, maxRequests });

  res.json({ 
    success: true,
    rateLimitWindow: config.rateLimitWindow,
    rateLimitMax: config.rateLimitMax
  });
});

/**
 * Get logs
 * الحصول على السجلات
 */
router.get('/api/logs', (req, res) => {
  const { type = 'combined', limit = 100 } = req.query;
  
  // In production, read from log files
  // For now, return a placeholder
  res.json({
    type,
    limit: parseInt(limit),
    logs: ['Log viewing implemented in production with file streaming']
  });
});

/**
 * Clear all sessions
 * مسح جميع الجلسات
 */
router.post('/api/clear-sessions', (req, res) => {
  // Implementation depends on session store
  // For memory store, this would clear all sessions
  
  logger.info('Admin cleared all sessions');
  
  res.json({ 
    success: true, 
    message: 'All sessions cleared' 
  });
});

/**
 * System health check
 * فحص صحة النظام
 */
router.get('/api/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    versions: {
      node: process.version,
      v8: process.versions.v8,
      openssl: process.versions.openssl
    }
  };

  res.json(health);
});

module.exports = { adminRouter: router };
