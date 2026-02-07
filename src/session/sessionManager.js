/**
 * Session & Cookie Management
 * إدارة الجلسات وملفات تعريف الارتباط
 */

const { v4: uuidv4 } = require('uuid');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');

// In-memory session store (use Redis in production)
class MemorySessionStore {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 60 * 1000); // Cleanup every hour
  }

  get(sid) {
    const session = this.sessions.get(sid);
    if (session && session.expires > Date.now()) {
      return session;
    }
    if (session) {
      this.sessions.delete(sid);
    }
    return null;
  }

  set(sid, session) {
    this.sessions.set(sid, {
      ...session,
      expires: Date.now() + config.sessionMaxAge
    });
  }

  destroy(sid) {
    this.sessions.delete(sid);
  }

  cleanup() {
    const now = Date.now();
    for (const [sid, session] of this.sessions.entries()) {
      if (session.expires <= now) {
        this.sessions.delete(sid);
      }
    }
    logger.info(`Session cleanup completed. Active sessions: ${this.sessions.size}`);
  }

  getStore() {
    return {
      get: (sid, cb) => {
        const session = this.get(sid);
        cb(null, session);
      },
      set: (sid, session, cb) => {
        this.set(sid, session);
        cb(null);
      },
      destroy: (sid, cb) => {
        this.destroy(sid);
        cb(null);
      }
    };
  }
}

// Per-target cookie store
class CookieStore {
  constructor() {
    this.cookies = new Map(); // sessionId -> { domain -> [cookies] }
  }

  /**
   * Store cookies for a session and domain
   * تخزين ملفات تعريف الارتباط للجلسة والنطاق
   */
  storeCookies(sessionId, domain, setCookieHeaders) {
    if (!this.cookies.has(sessionId)) {
      this.cookies.set(sessionId, new Map());
    }
    
    const sessionCookies = this.cookies.get(sessionId);
    if (!sessionCookies.has(domain)) {
      sessionCookies.set(domain, new Map());
    }

    const domainCookies = sessionCookies.get(domain);

    if (!Array.isArray(setCookieHeaders)) {
      setCookieHeaders = [setCookieHeaders];
    }

    for (const cookieStr of setCookieHeaders) {
      if (!cookieStr) continue;
      
      const parsed = this.parseCookie(cookieStr);
      if (parsed.name) {
        domainCookies.set(parsed.name, {
          value: parsed.value,
          domain: parsed.domain || domain,
          path: parsed.path || '/',
          expires: parsed.expires,
          httpOnly: parsed.httpOnly,
          secure: parsed.secure,
          sameSite: parsed.sameSite
        });
      }
    }
  }

  /**
   * Get cookies for a session and domain
   * الحصول على ملفات تعريف الارتباط للجلسة والنطاق
   */
  getCookies(sessionId, domain) {
    const sessionCookies = this.cookies.get(sessionId);
    if (!sessionCookies) return '';

    const domainCookies = sessionCookies.get(domain);
    if (!domainCookies) return '';

    const cookieStrings = [];
    const now = new Date();

    for (const [name, cookie] of domainCookies.entries()) {
      if (cookie.expires && new Date(cookie.expires) < now) {
        domainCookies.delete(name);
        continue;
      }
      cookieStrings.push(`${name}=${cookie.value}`);
    }

    return cookieStrings.join('; ');
  }

  /**
   * Parse a Set-Cookie header value
   * تحليل قيمة ترويسة Set-Cookie
   */
  parseCookie(cookieStr) {
    const parts = cookieStr.split(';').map(p => p.trim());
    const [nameValue, ...attrs] = parts;
    const [name, value] = nameValue.split('=').map(s => s.trim());

    const cookie = { name, value };

    for (const attr of attrs) {
      const [key, val] = attr.split('=').map(s => s.trim().toLowerCase());
      
      switch (key) {
        case 'expires':
          cookie.expires = new Date(val).toISOString();
          break;
        case 'max-age':
          cookie.expires = new Date(Date.now() + parseInt(val) * 1000).toISOString();
          break;
        case 'domain':
          cookie.domain = val;
          break;
        case 'path':
          cookie.path = val;
          break;
        case 'httponly':
          cookie.httpOnly = true;
          break;
        case 'secure':
          cookie.secure = true;
          break;
        case 'samesite':
          cookie.sameSite = val;
          break;
      }
    }

    return cookie;
  }

  /**
   * Clear session cookies
   * مسح ملفات تعريف الارتباط للجلسة
   */
  clearSession(sessionId) {
    this.cookies.delete(sessionId);
  }

  /**
   * Get session stats
   * الحصول على إحصائيات الجلسة
   */
  getStats() {
    let totalCookies = 0;
    for (const sessionCookies of this.cookies.values()) {
      for (const domainCookies of sessionCookies.values()) {
        totalCookies += domainCookies.size;
      }
    }
    return {
      sessions: this.cookies.size,
      totalCookies
    };
  }
}

// Session management middleware
const sessionManager = new MemorySessionStore();
const cookieStore = new CookieStore();

/**
 * Middleware to ensure session exists
 * وسيط للتأكد من وجود الجلسة
 */
const ensureSession = (req, res, next) => {
  if (!req.session) {
    req.session = {};
  }
  
  if (!req.session.proxySessionId) {
    req.session.proxySessionId = uuidv4();
    req.session.createdAt = new Date().toISOString();
    req.session.bandwidthUsed = 0;
    req.session.requestCount = 0;
    req.session.tier = req.session.tier || 'free';
  }

  req.session.lastActive = new Date().toISOString();
  req.session.requestCount++;

  next();
};

/**
 * Check bandwidth limits
   * التحقق من حدود النطاق الترددي
 */
const checkBandwidthLimit = (req, res, next) => {
  const tier = req.session.tier || 'free';
  const limit = tier === 'premium' ? config.premiumTierBandwidth : config.freeTierBandwidth;
  
  if (req.session.bandwidthUsed >= limit) {
    return res.status(429).render('error', {
      title: 'تم تجاوز الحد - Limit Exceeded',
      error: 'لقد تجاوزت حد النطاق الترددي. يرجى الترقية إلى الباقة المميزة.',
      code: 429
    });
  }
  
  next();
};

/**
 * Track bandwidth usage
 * تتبع استخدام النطاق الترددي
 */
const trackBandwidth = (bytes) => {
  return (req, res, next) => {
    const originalEnd = res.end;
    let dataLength = 0;

    res.write = function(chunk) {
      if (chunk) {
        dataLength += chunk.length;
      }
      return originalEnd.apply(this, arguments);
    };

    res.end = function(chunk) {
      if (chunk) {
        dataLength += chunk.length;
      }
      if (req.session) {
        req.session.bandwidthUsed = (req.session.bandwidthUsed || 0) + dataLength;
      }
      return originalEnd.apply(this, arguments);
    };

    next();
  };
};

module.exports = {
  sessionManager,
  cookieStore,
  ensureSession,
  checkBandwidthLimit,
  trackBandwidth
};
