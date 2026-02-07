/**
 * Security & Privacy Features
 * ميزات الأمان والخصوصية
 */

const rateLimit = require('express-rate-limit');
const { URL } = require('url');
const { config } = require('../utils/config');
const { logger, logSecurityEvent } = require('../utils/logger');

// In-memory rate limit store (use Redis in production)
const requestCounts = new Map();
const blockedIPs = new Set(config.blockedIPs);

/**
 * Check if IP is private/internal
 * التحقق مما إذا كان عنوان IP خاصًا/داخليًا
 */
const isPrivateIP = (ip) => {
  // Remove port if present
  ip = ip.split(':')[0];
  
  // IPv4 private ranges
  const privateRanges = [
    /^10\./,                              // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,    // 172.16.0.0/12
    /^192\.168\./,                        // 192.168.0.0/16
    /^127\./,                             // 127.0.0.0/8 (loopback)
    /^169\.254\./,                        // 169.254.0.0/16 (link-local)
    /^0\./,                               // 0.0.0.0/8
    /^::1$/,                              // IPv6 loopback
    /^fc00:/i,                            // IPv6 unique local
    /^fe80:/i,                            // IPv6 link-local
  ];

  return privateRanges.some(range => range.test(ip));
};

/**
 * Check if URL points to blocked/private resources
 * التحقق مما إذا كان الرابط يشير إلى موارد محظورة/خاصة
 */
const isBlockedURL = (url) => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const host = urlObj.host;

    // Check for private IP addresses
    if (isPrivateIP(hostname)) {
      return { blocked: true, reason: 'error.private_ip' };
    }

    // Check for cloud metadata endpoints
    if (config.blockedMetadataEndpoints.some(endpoint => 
      hostname === endpoint || hostname.endsWith('.' + endpoint)
    )) {
      return { blocked: true, reason: 'error.cloud_metadata' };
    }

    // Check for localhost variations
    if (/^localhost$/i.test(hostname) || /^127\./.test(hostname)) {
      return { blocked: true, reason: 'error.localhost' };
    }

    // Check for blocked domains
    if (config.blockedDomains.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    )) {
      return { blocked: true, reason: 'error.blocked_domain' };
    }

    // Check for file:// protocol
    if (urlObj.protocol === 'file:') {
      return { blocked: true, reason: 'error.file_protocol' };
    }

    return { blocked: false };
  } catch (error) {
    return { blocked: true, reason: 'error.invalid_url' };
  }
};

/**
 * Rate limiters configuration
 * إعدادات حدود معدل الطلبات
 */
const rateLimiters = {
  // General rate limiter
  general: rateLimit({
    windowMs: config.rateLimitWindow,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.session?.proxySessionId || req.ip;
    },
    handler: (req, res, next, options) => {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip: req.ip,
        path: req.path
      });
      const t = res.locals.t || { error: { rate_limit: 'Too many requests' } }; // Fallback
      res.status(options.statusCode).json({ error: t.error.rate_limit });
    }
  }),

  // Stricter rate limiter for proxy requests
  proxy: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per 15 minutes
    keyGenerator: (req) => {
      return req.session?.proxySessionId || req.ip;
    },
    handler: (req, res, next, options) => {
      const t = res.locals.t || { error: { proxy_rate_limit: 'Proxy rate limit exceeded' } };
      res.status(options.statusCode).json({ error: t.error.proxy_rate_limit });
    }
  }),

  // Admin rate limiter
  admin: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    handler: (req, res, next, options) => {
      const t = res.locals.t || { error: { admin_rate_limit: 'Admin rate limit exceeded' } };
      res.status(options.statusCode).json({ error: t.error.admin_rate_limit });
    }
  })
};

/**
 * Security middleware
 * وسيط الأمان
 */
const securityMiddleware = (req, res, next) => {
  // Check if IP is blocked
  if (blockedIPs.has(req.ip)) {
    logSecurityEvent('BLOCKED_IP_ACCESS_ATTEMPT', {
      ip: req.ip,
      path: req.path
    });
    const t = res.locals.t || { error: { access_denied: 'Access denied' } };
    return res.status(403).json({
      error: t.error.access_denied
    });
  }

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Remove identifying headers
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-real-ip'];
  delete req.headers['x-client-ip'];
  delete req.headers['cf-connecting-ip'];

  next();
};

/**
 * Get sanitized headers for upstream requests
 * الحصول على ترويسات مُحسّنة للطلبات الصاعدة
 */
const getSanitizedHeaders = (req, targetUrl) => {
  const headers = { ...req.headers };

  // Remove hop-by-hop headers
  const hopByHopHeaders = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'cookie',
    'host'
  ];

  for (const header of hopByHopHeaders) {
    delete headers[header];
  }

  // Remove identifying headers
  delete headers['x-forwarded-for'];
  delete headers['x-real-ip'];
  delete headers['x-client-ip'];
  delete headers['cf-connecting-ip'];
  delete headers['cf-ray'];
  delete headers['cf-visitor'];

  // Set new headers
  headers['host'] = new URL(targetUrl).host;
  
  // Rotate user agent
  if (config.userAgents.length > 0) {
    headers['user-agent'] = config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
  }

  // Accept headers
  headers['accept'] = req.headers['accept'] || '*/*';
  headers['accept-encoding'] = req.headers['accept-encoding'] || 'gzip, deflate, br';
  headers['accept-language'] = req.headers['accept-language'] || 'en-US,en;q=0.9';

  return headers;
};

/**
 * Validate and normalize URL
 * التحقق من صحة الرابط وتوحيده
 */
const validateAndNormalizeURL = (url) => {
  if (!url) {
    return { valid: false, error: 'error.url_required' };
  }

  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    const urlObj = new URL(url);
    
    // Validate protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { valid: false, error: 'error.invalid_protocol' };
    }

    // Check for blocked URL
    const blocked = isBlockedURL(url);
    if (blocked.blocked) {
      return { valid: false, error: blocked.reason };
    }

    return { 
      valid: true, 
      url: urlObj.toString(),
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      search: urlObj.search
    };
  } catch (error) {
    return { valid: false, error: 'error.invalid_format' };
  }
};

/**
 * Block an IP address
 * حظر عنوان IP
 */
const blockIP = (ip, reason) => {
  blockedIPs.add(ip);
  logSecurityEvent('IP_BLOCKED', { ip, reason });
  logger.info(`IP ${ip} blocked: ${reason}`);
};

/**
 * Unblock an IP address
 * إلغاء حظر عنوان IP
 */
const unblockIP = (ip) => {
  blockedIPs.delete(ip);
  logger.info(`IP ${ip} unblocked`);
};

/**
 * Get blocked IPs
 * الحصول على عناوين IP المحظورة
 */
const getBlockedIPs = () => {
  return Array.from(blockedIPs);
};

/**
 * Get security stats
 * الحصول على إحصائيات الأمان
 */
const getSecurityStats = () => {
  return {
    blockedIPs: blockedIPs.size,
    blockedDomains: config.blockedDomains.length,
    privateRanges: config.privateIPRanges.length,
    metadataEndpoints: config.blockedMetadataEndpoints.length
  };
};

module.exports = {
  securityMiddleware,
  getSanitizedHeaders,
  validateAndNormalizeURL,
  rateLimiters,
  blockIP,
  unblockIP,
  getBlockedIPs,
  getSecurityStats,
  isBlockedURL
};
