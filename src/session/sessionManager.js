/**
 * Session & Proxy Cookie Management
 * إدارة الجلسات وملفات تعريف الارتباط الخاصة بالبروكسي
 */

const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');

let RedisStore = null;
let createRedisClient = null;

try {
  ({ RedisStore } = require('connect-redis'));
  ({ createClient: createRedisClient } = require('redis'));
} catch (error) {
  if (config.redisUrl) {
    logger.warn('Redis session dependencies are missing. Run `npm install redis connect-redis` to enable persistent sessions.');
  }
}

let redisClient = null;
let redisStore = null;
let redisConnectStarted = false;

const getSessionCookieSecure = () => {
  if (config.sessionCookieSecure === 'auto') {
    return 'auto';
  }
  return config.sessionCookieSecure;
};

const connectRedis = () => {
  if (!config.redisUrl || !createRedisClient || redisConnectStarted) {
    return;
  }

  redisConnectStarted = true;
  redisClient = createRedisClient({
    url: config.redisUrl
  });

  redisClient.on('error', (error) => {
    logger.error(`Redis session client error: ${error.message}`);
  });

  redisClient.on('ready', () => {
    logger.info('Redis session client is ready');
  });

  redisClient.connect().catch((error) => {
    logger.error(`Failed to connect Redis session client: ${error.message}`);
  });
};

const getSessionStore = () => {
  if (!config.redisUrl || !RedisStore || !createRedisClient) {
    return undefined;
  }

  if (!redisStore) {
    connectRedis();
    redisStore = new RedisStore({
      client: redisClient,
      prefix: config.sessionStorePrefix,
      ttl: Math.ceil(config.sessionMaxAge / 1000)
    });
  }

  return redisStore;
};

const createSessionMiddleware = () => {
  const store = getSessionStore();

  if (store) {
    logger.info('Using Redis-backed session store');
  } else {
    logger.warn('Using express-session MemoryStore. Configure REDIS_URL for distributed persistent sessions.');
  }

  return session({
    store,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: config.sessionRolling,
    unset: 'destroy',
    name: config.sessionCookieName,
    proxy: config.isProduction,
    cookie: {
      secure: getSessionCookieSecure(),
      httpOnly: config.sessionCookieHttpOnly,
      maxAge: config.sessionMaxAge,
      sameSite: config.sessionCookieSameSite
    }
  });
};

const ensureSession = (req, res, next) => {
  if (!req.session.proxySessionId) {
    req.session.proxySessionId = uuidv4();
    req.session.createdAt = new Date().toISOString();
    req.session.bandwidthUsed = 0;
    req.session.requestCount = 0;
    req.session.tier = req.session.tier || 'free';
    req.session.proxyCookies = req.session.proxyCookies || {};
  }

  req.session.lastActive = new Date().toISOString();
  req.session.requestCount = (req.session.requestCount || 0) + 1;

  next();
};

const checkBandwidthLimit = (req, res, next) => {
  const tier = req.session?.tier || 'free';
  const limit = tier === 'premium' ? config.premiumTierBandwidth : config.freeTierBandwidth;
  const bandwidthUsed = req.session?.bandwidthUsed || 0;

  if (bandwidthUsed >= limit) {
    return res.status(429).render('error', {
      title: 'تم تجاوز الحد - Limit Exceeded',
      error: 'لقد تجاوزت حد النطاق الترددي. يرجى الترقية إلى الباقة المميزة.',
      code: 429
    });
  }

  next();
};

const trackBandwidth = () => {
  return (req, res, next) => {
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    let dataLength = 0;

    res.write = function writePatched(chunk, ...args) {
      if (chunk) {
        dataLength += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      }
      return originalWrite(chunk, ...args);
    };

    res.end = function endPatched(chunk, ...args) {
      if (chunk) {
        dataLength += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      }

      if (req.session) {
        req.session.bandwidthUsed = (req.session.bandwidthUsed || 0) + dataLength;
      }

      return originalEnd(chunk, ...args);
    };

    next();
  };
};

const parseCookie = (cookieStr) => {
  const parts = cookieStr.split(';').map((part) => part.trim());
  const [nameValue, ...attrs] = parts;
  const separatorIndex = nameValue.indexOf('=');

  if (separatorIndex === -1) {
    return {};
  }

  const cookie = {
    name: nameValue.slice(0, separatorIndex).trim(),
    value: nameValue.slice(separatorIndex + 1).trim()
  };

  for (const attr of attrs) {
    const attrSeparatorIndex = attr.indexOf('=');
    const key = (attrSeparatorIndex === -1 ? attr : attr.slice(0, attrSeparatorIndex)).trim().toLowerCase();
    const value = attrSeparatorIndex === -1 ? '' : attr.slice(attrSeparatorIndex + 1).trim();

    switch (key) {
      case 'expires':
        cookie.expires = new Date(value).toISOString();
        break;
      case 'max-age':
        cookie.expires = new Date(Date.now() + parseInt(value, 10) * 1000).toISOString();
        break;
      case 'domain':
        cookie.domain = value.toLowerCase();
        break;
      case 'path':
        cookie.path = value || '/';
        break;
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'secure':
        cookie.secure = true;
        break;
      case 'samesite':
        cookie.sameSite = value;
        break;
    }
  }

  return cookie;
};

const getDomainCookieJar = (req, domain) => {
  req.session.proxyCookies = req.session.proxyCookies || {};

  if (!req.session.proxyCookies[domain]) {
    req.session.proxyCookies[domain] = {};
  }

  return req.session.proxyCookies[domain];
};

const storeProxyCookies = (req, domain, setCookieHeaders) => {
  if (!req.session) {
    return;
  }

  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const jar = getDomainCookieJar(req, domain);

  for (const cookieStr of headers) {
    if (!cookieStr) continue;

    const parsed = parseCookie(cookieStr);
    if (!parsed.name) continue;

    jar[parsed.name] = {
      value: parsed.value,
      domain: parsed.domain || domain,
      path: parsed.path || '/',
      expires: parsed.expires,
      httpOnly: parsed.httpOnly,
      secure: parsed.secure,
      sameSite: parsed.sameSite
    };
  }

  req.session.proxyCookies = req.session.proxyCookies;
};

const getProxyCookies = (req, domain) => {
  const jar = req.session?.proxyCookies?.[domain];

  if (!jar) {
    return '';
  }

  const cookieStrings = [];
  const now = Date.now();

  Object.entries(jar).forEach(([name, cookie]) => {
    if (cookie.expires && new Date(cookie.expires).getTime() < now) {
      delete jar[name];
      return;
    }

    cookieStrings.push(`${name}=${cookie.value}`);
  });

  if (Object.keys(jar).length === 0 && req.session?.proxyCookies) {
    delete req.session.proxyCookies[domain];
  }

  return cookieStrings.join('; ');
};

const clearProxyCookies = (req) => {
  if (req.session) {
    req.session.proxyCookies = {};
  }
};

const getSessionRuntimeStats = () => ({
  store: config.redisUrl ? 'redis' : 'memory',
  persistent: Boolean(config.redisUrl),
  redisConfigured: Boolean(config.redisUrl),
  redisConnected: Boolean(redisClient?.isOpen)
});

module.exports = {
  createSessionMiddleware,
  ensureSession,
  checkBandwidthLimit,
  trackBandwidth,
  storeProxyCookies,
  getProxyCookies,
  clearProxyCookies,
  getSessionRuntimeStats
};
