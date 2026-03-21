/**
 * Security & Privacy Features
 * ميزات الأمان والخصوصية
 */

const dns = require('node:dns').promises;
const net = require('node:net');
const rateLimit = require('express-rate-limit');
const { URL } = require('url');
const { config } = require('../utils/config');
const { logger, logSecurityEvent } = require('../utils/logger');

const blockedIPs = new Set(config.blockedIPs);
const getRateLimitKey = (req) => req.sessionID || req.session?.proxySessionId || req.ip;

const IPV4_BLOCKED_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
];

const IPV6_BLOCKED_CIDRS = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32]
];

const normalizeHostname = (hostname) => hostname.toLowerCase().replace(/\.$/, '');

const normalizeIp = (ip) => {
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
};

const parseIPv4 = (ip) => ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);

const ipv4Mask = (prefix) => (prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0));

const isIPv4InCidr = (ip, base, prefix) => {
  const mask = ipv4Mask(prefix);
  return (parseIPv4(ip) & mask) === (parseIPv4(base) & mask);
};

const expandIpv6 = (ip) => {
  const normalized = normalizeIp(ip);

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4Part = normalized.slice(lastColon + 1);
    const ipv6Part = normalized.slice(0, lastColon);
    const ipv4Number = parseIPv4(ipv4Part);
    const high = ((ipv4Number >>> 16) & 0xffff).toString(16);
    const low = (ipv4Number & 0xffff).toString(16);
    return expandIpv6(`${ipv6Part}:${high}:${low}`);
  }

  const halves = normalized.split('::');
  if (halves.length > 2) {
    throw new Error('Invalid IPv6 address');
  }

  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = 8 - (left.length + right.length);

  if (missing < 0) {
    throw new Error('Invalid IPv6 address');
  }

  return [
    ...left,
    ...Array(missing).fill('0'),
    ...right
  ].map((part) => part.padStart(4, '0'));
};

const parseIPv6 = (ip) => expandIpv6(ip).reduce((acc, part) => (acc << 16n) + BigInt(`0x${part}`), 0n);

const isIPv6InCidr = (ip, base, prefix) => {
  if (prefix === 0) {
    return true;
  }

  const address = parseIPv6(ip);
  const baseAddress = parseIPv6(base);
  const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);

  return (address & mask) === (baseAddress & mask);
};

const classifyIp = (ip) => {
  const normalizedIp = normalizeIp(ip);
  const family = net.isIP(normalizedIp);

  if (!family) {
    return { blocked: true, reason: 'error.invalid_url' };
  }

  if (family === 4) {
    const blocked = IPV4_BLOCKED_CIDRS.some(([base, prefix]) => isIPv4InCidr(normalizedIp, base, prefix));
    return blocked ? { blocked: true, reason: 'error.private_ip' } : { blocked: false, family };
  }

  const blocked = IPV6_BLOCKED_CIDRS.some(([base, prefix]) => isIPv6InCidr(normalizedIp, base, prefix));
  return blocked ? { blocked: true, reason: 'error.private_ip' } : { blocked: false, family };
};

const isHostnameAllowlisted = (hostname) => {
  if (!config.allowedTargetDomains.length) {
    return true;
  }

  return config.allowedTargetDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
};

const evaluateHostnamePolicy = (hostname) => {
  const normalizedHostname = normalizeHostname(hostname);

  if (!isHostnameAllowlisted(normalizedHostname)) {
    return { blocked: true, reason: 'error.blocked_domain' };
  }

  if (/^localhost$/i.test(normalizedHostname) || normalizedHostname.endsWith('.localhost')) {
    return { blocked: true, reason: 'error.localhost' };
  }

  if (config.blockedMetadataEndpoints.some((endpoint) =>
    normalizedHostname === endpoint || normalizedHostname.endsWith(`.${endpoint}`)
  )) {
    return { blocked: true, reason: 'error.cloud_metadata' };
  }

  if (config.blockedDomains.some((domain) =>
    normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
  )) {
    return { blocked: true, reason: 'error.blocked_domain' };
  }

  const ipClassification = classifyIp(normalizedHostname);
  if (ipClassification.blocked) {
    return ipClassification;
  }

  return { blocked: false };
};

const resolveHostname = async (hostname) => {
  const normalizedHostname = normalizeHostname(hostname);
  const hostnamePolicy = evaluateHostnamePolicy(normalizedHostname);

  if (hostnamePolicy.blocked) {
    return hostnamePolicy;
  }

  if (net.isIP(normalizedHostname)) {
    return {
      blocked: false,
      addresses: [{ address: normalizeIp(normalizedHostname), family: net.isIP(normalizedHostname) }]
    };
  }

  let addresses;

  try {
    addresses = await dns.lookup(normalizedHostname, {
      all: true,
      verbatim: true
    });
  } catch (error) {
    logger.warn(`DNS lookup failed for ${normalizedHostname}: ${error.message}`);
    return { blocked: true, reason: 'error.invalid_url' };
  }

  if (!addresses.length) {
    return { blocked: true, reason: 'error.invalid_url' };
  }

  const normalizedAddresses = addresses.map(({ address, family }) => ({
    address: normalizeIp(address),
    family
  }));

  for (const entry of normalizedAddresses) {
    const classification = classifyIp(entry.address);
    if (classification.blocked) {
      logger.warn(`Blocked SSRF target after DNS resolution: ${normalizedHostname} -> ${entry.address}`);
      return { blocked: true, reason: classification.reason };
    }
  }

  return { blocked: false, addresses: normalizedAddresses };
};

const isBlockedURL = (url) => {
  try {
    const urlObj = new URL(url);

    if (urlObj.protocol === 'file:') {
      return { blocked: true, reason: 'error.file_protocol' };
    }

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { blocked: true, reason: 'error.invalid_protocol' };
    }

    return evaluateHostnamePolicy(urlObj.hostname);
  } catch (error) {
    return { blocked: true, reason: 'error.invalid_url' };
  }
};

const validateAndNormalizeURL = async (url) => {
  if (!url) {
    return { valid: false, error: 'error.url_required' };
  }

  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  let urlObj;

  try {
    urlObj = new URL(normalizedUrl);
  } catch (error) {
    return { valid: false, error: 'error.invalid_format' };
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    return { valid: false, error: 'error.invalid_protocol' };
  }

  const blocked = isBlockedURL(urlObj.toString());
  if (blocked.blocked) {
    return { valid: false, error: blocked.reason };
  }

  const resolution = await resolveHostname(urlObj.hostname);
  if (resolution.blocked) {
    return { valid: false, error: resolution.reason };
  }

  const [primaryAddress] = resolution.addresses;

  return {
    valid: true,
    url: urlObj.toString(),
    protocol: urlObj.protocol,
    hostname: normalizeHostname(urlObj.hostname),
    pathname: urlObj.pathname,
    search: urlObj.search,
    resolvedAddress: primaryAddress.address,
    resolvedFamily: primaryAddress.family,
    resolvedAddresses: resolution.addresses
  };
};

const rateLimiters = {
  general: rateLimit({
    windowMs: config.rateLimitWindow,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRateLimitKey,
    handler: (req, res, next, options) => {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip: req.ip,
        path: req.path
      });
      const t = res.locals.t || { error: { rate_limit: 'Too many requests' } };
      res.status(options.statusCode).json({ error: t.error.rate_limit });
    }
  }),

  proxy: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    keyGenerator: getRateLimitKey,
    handler: (req, res, next, options) => {
      const t = res.locals.t || { error: { proxy_rate_limit: 'Proxy rate limit exceeded' } };
      res.status(options.statusCode).json({ error: t.error.proxy_rate_limit });
    }
  }),

  admin: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    handler: (req, res, next, options) => {
      const t = res.locals.t || { error: { admin_rate_limit: 'Admin rate limit exceeded' } };
      res.status(options.statusCode).json({ error: t.error.admin_rate_limit });
    }
  })
};

const securityMiddleware = (req, res, next) => {
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

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  delete req.headers['x-forwarded-for'];
  delete req.headers['x-real-ip'];
  delete req.headers['x-client-ip'];
  delete req.headers['cf-connecting-ip'];

  next();
};

const getSanitizedHeaders = (req, targetUrl) => {
  const headers = { ...req.headers };

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

  delete headers['x-forwarded-for'];
  delete headers['x-real-ip'];
  delete headers['x-client-ip'];
  delete headers['cf-connecting-ip'];
  delete headers['cf-ray'];
  delete headers['cf-visitor'];

  headers.host = new URL(targetUrl).host;

  if (config.userAgents.length > 0) {
    headers['user-agent'] = config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
  }

  headers.accept = req.headers.accept || '*/*';
  headers['accept-encoding'] = req.headers['accept-encoding'] || 'gzip, deflate, br';
  headers['accept-language'] = req.headers['accept-language'] || 'en-US,en;q=0.9';

  return headers;
};

const blockIP = (ip, reason) => {
  blockedIPs.add(ip);
  logSecurityEvent('IP_BLOCKED', { ip, reason });
  logger.info(`IP ${ip} blocked: ${reason}`);
};

const unblockIP = (ip) => {
  blockedIPs.delete(ip);
  logger.info(`IP ${ip} unblocked`);
};

const getBlockedIPs = () => Array.from(blockedIPs);

const getSecurityStats = () => ({
  blockedIPs: blockedIPs.size,
  blockedDomains: config.blockedDomains.length,
  allowlistedDomains: config.allowedTargetDomains.length,
  privateRanges: config.privateIPRanges.length,
  metadataEndpoints: config.blockedMetadataEndpoints.length
});

module.exports = {
  securityMiddleware,
  getSanitizedHeaders,
  validateAndNormalizeURL,
  rateLimiters,
  blockIP,
  unblockIP,
  getBlockedIPs,
  getSecurityStats,
  isBlockedURL,
  resolveHostname,
  evaluateHostnamePolicy
};
