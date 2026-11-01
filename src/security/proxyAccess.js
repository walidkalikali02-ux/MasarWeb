const { config } = require('../utils/config');

const isProxyAvailable = () => config.features.proxy && config.allowedTargetDomains.length > 0;

// Apply to every method and before any session, decoding, DNS, or upstream request.
const requireProxyAccess = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  // Third-party pages must not run scripts, submit forms, open popups, download
  // files, or share the application origin, even for an approved destination.
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src https: data:; style-src https: 'unsafe-inline'; font-src https: data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!isProxyAvailable()) {
    return res.status(410).type('text/plain').send('Web proxy unavailable. Third-party pages are no longer served here.');
  }
  next();
};

module.exports = { isProxyAvailable, requireProxyAccess };
