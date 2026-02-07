/**
 * Configuration Utility
 * إعدادات التطبيق
 */

const crypto = require('crypto');

// Generate secure secrets if not provided
const generateSecret = () => crypto.randomBytes(64).toString('hex');

const config = {
  // Server settings
  port: parseInt(process.env.PORT) || 3000,
  isProduction: process.env.NODE_ENV === 'production',
  
  // Security
  sessionSecret: process.env.SESSION_SECRET || generateSecret(),
  cookieSecret: process.env.COOKIE_SECRET || generateSecret(),
  
  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  
  // Proxy settings
  proxyTimeout: parseInt(process.env.PROXY_TIMEOUT) || 30000,
  maxResponseSize: parseInt(process.env.MAX_RESPONSE_SIZE) || 50 * 1024 * 1024, // 50MB
  
  // Rate limiting
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  
  // Session settings
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 hours
  
  // Blocked resources
  blockedDomains: (process.env.BLOCKED_DOMAINS || '').split(',').filter(Boolean),
  blockedIPs: (process.env.BLOCKED_IPS || '').split(',').filter(Boolean),
  
  // Private IP ranges to block
  privateIPRanges: [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '0.0.0.0/8',
    'fc00::/7',
    'fe80::/10',
    '::1/128'
  ],
  
  // Cloud metadata endpoints to block
  blockedMetadataEndpoints: [
    '169.254.169.254', // AWS, GCP, Azure metadata
    'metadata.google.internal',
    'metadata.google',
    '169.254.170.2', // AWS ECS
    '100.100.100.200', // Alibaba Cloud
  ],
  
  // User agent rotation
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0'
  ],
  
  // Cache settings
  cacheEnabled: process.env.CACHE_ENABLED === 'true',
  cacheMaxAge: parseInt(process.env.CACHE_MAX_AGE) || 3600, // 1 hour
  
  // Feature toggles
  features: {
    websockets: process.env.ENABLE_WEBSOCKETS !== 'false',
    mediaStreaming: process.env.ENABLE_MEDIA_STREAMING !== 'false',
    javascriptRewrite: process.env.ENABLE_JS_REWRITE !== 'false',
    cookieSync: process.env.ENABLE_COOKIE_SYNC !== 'false',
  },
  
  // Admin settings
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  
  // Monetization
  freeTierBandwidth: parseInt(process.env.FREE_TIER_BANDWIDTH) || 100 * 1024 * 1024, // 100MB
  premiumTierBandwidth: parseInt(process.env.PREMIUM_TIER_BANDWIDTH) || 10 * 1024 * 1024 * 1024, // 10GB
};

module.exports = { config };
