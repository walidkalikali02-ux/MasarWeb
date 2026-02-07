/**
 * Proxy Router - Main Proxy Functionality
 * جهاز التوجيه الرئيسي للبروكسي
 */

const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');
const { pipeline } = require('stream');
const locales = require('../locales');

const { URLRewriter } = require('../rewriter/urlRewriter');
const { cookieStore } = require('../session/sessionManager');
const { 
  isBlockedURL, 
  getSanitizedHeaders,
  validateAndNormalizeURL,
  rateLimiters 
} = require('../security/security');
const { config } = require('../utils/config');
const { logger, logProxyRequest } = require('../utils/logger');

const router = express.Router();
const { ensureSession, checkBandwidthLimit } = require('../session/sessionManager');

// Helper to translate error keys
const translateError = (t, key) => {
  if (key && typeof key === 'string' && key.startsWith('error.')) {
    const k = key.split('.')[1];
    return (t.error && t.error[k]) ? t.error[k] : key;
  }
  return key;
};

// Get proxy base URL
const getProxyBaseUrl = (req) => {
  return `${req.protocol}://${req.get('host')}`;
};

/**
 * Homepage route
 * صفحة البداية
 */
router.get('/', (req, res) => {
  res.render('index', {
    currentUrl: ''
  });
});

/**
 * Handle GET /browse - Redirect to home
 */
router.get('/browse', (req, res) => {
  res.redirect('/');
});

/**
 * Process URL submission
 * معالجة إرسال الرابط
 */
router.post('/browse', ensureSession, (req, res) => {
  let { url } = req.body;
  
  const validation = validateAndNormalizeURL(url);
  if (!validation.valid) {
    const t = res.locals.t;
    return res.render('index', {
      error: translateError(t, validation.error),
      currentUrl: url
    });
  }

  // Encode and redirect
  const encodedUrl = Buffer.from(validation.url).toString('base64url');
  res.redirect(`/proxy/${encodedUrl}`);
});

/**
 * Main proxy handler
 * معالج البروكسي الرئيسي
 */
router.get('/proxy/:encodedUrl(*)', rateLimiters.proxy, checkBandwidthLimit, async (req, res) => {
  const encodedUrl = req.params.encodedUrl;
  const t = res.locals.t;
  
  try {
    // Decode URL
    let targetUrl;
    try {
      targetUrl = URLRewriter.decodeURL(encodedUrl);
    } catch (e) {
      return res.status(400).render('error', {
        title: translateError(t, 'error.invalid_url'),
        error: translateError(t, 'error.invalid_format'),
        code: 400
      });
    }

    // Validate URL
    const validation = validateAndNormalizeURL(targetUrl);
    if (!validation.valid) {
      return res.status(403).render('error', {
        title: translateError(t, 'error.access_denied'),
        error: translateError(t, validation.error),
        code: 403
      });
    }

    targetUrl = validation.url;
    const targetUrlObj = new URL(targetUrl);

    // Check if blocked
    const blocked = isBlockedURL(targetUrl);
    if (blocked.blocked) {
      return res.status(403).render('error', {
        title: translateError(t, 'error.blocked_site'),
        error: `${translateError(t, 'error.blocked_access')}: ${translateError(t, blocked.reason)}`,
        code: 403
      });
    }

    // Get sanitized headers
    const headers = getSanitizedHeaders(req, targetUrl);

    // Add cookies for this domain
    if (req.session?.proxySessionId) {
      const cookies = cookieStore.getCookies(req.session.proxySessionId, targetUrlObj.hostname);
      if (cookies) {
        headers['cookie'] = cookies;
      }
    }

    // Set accept headers
    headers['accept'] = req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
    headers['accept-language'] = req.headers['accept-language'] || 'ar,en-US;q=0.9,en;q=0.8';

    logger.info(`Proxying: ${targetUrl}`);

    // Make request
    const protocol = targetUrlObj.protocol === 'https:' ? https : http;
    const requestOptions = {
      hostname: targetUrlObj.hostname,
      port: targetUrlObj.port || (targetUrlObj.protocol === 'https:' ? 443 : 80),
      path: targetUrlObj.pathname + targetUrlObj.search,
      method: req.method,
      headers,
      timeout: config.proxyTimeout,
      rejectUnauthorized: true // Validate TLS certificates
    };

    const proxyReq = protocol.request(requestOptions, (proxyRes) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        let location = proxyRes.headers.location;
        if (location) {
          const rewriter = new URLRewriter(getProxyBaseUrl(req));
          const rewrittenLocation = rewriter.rewriteURL(location, targetUrl);
          res.redirect(proxyRes.statusCode, rewrittenLocation);
          return;
        }
      }

      // Store cookies
      if (req.session?.proxySessionId && proxyRes.headers['set-cookie']) {
        cookieStore.storeCookies(
          req.session.proxySessionId,
          targetUrlObj.hostname,
          proxyRes.headers['set-cookie']
        );
      }

      // Get content type
      const contentType = proxyRes.headers['content-type'] || '';
      
      // Prepare response headers
      const responseHeaders = {};
      
      // Copy safe headers
      const safeHeaders = [
        'content-type',
        'last-modified',
        'etag',
        'cache-control',
        'expires',
        'content-language',
        'vary'
      ];

      for (const header of safeHeaders) {
        if (proxyRes.headers[header]) {
          responseHeaders[header] = proxyRes.headers[header];
        }
      }

      // Handle content length for streaming
      if (proxyRes.headers['content-length']) {
        responseHeaders['content-length'] = proxyRes.headers['content-length'];
      }

      // Handle range requests for media
      if (proxyRes.headers['accept-ranges']) {
        responseHeaders['accept-ranges'] = proxyRes.headers['accept-ranges'];
      }
      if (proxyRes.headers['content-range']) {
        responseHeaders['content-range'] = proxyRes.headers['content-range'];
      }

      // Set security headers
      responseHeaders['x-content-type-options'] = 'nosniff';
      responseHeaders['x-frame-options'] = 'SAMEORIGIN';

      // Log the request
      logProxyRequest(req, targetUrl, proxyRes.statusCode);

      // Handle streaming content (media, large files)
      if (isStreamingContent(contentType)) {
        res.writeHead(proxyRes.statusCode, responseHeaders);
        
        // Handle compression
        let stream = proxyRes;
        const encoding = proxyRes.headers['content-encoding'];
        
        if (encoding === 'gzip') {
          stream = proxyRes.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = proxyRes.pipe(zlib.createInflate());
        } else if (encoding === 'br') {
          stream = proxyRes.pipe(zlib.createBrotliDecompress());
        }

        pipeline(stream, res, (err) => {
          if (err) {
            logger.error('Stream error:', err);
          }
        });
        return;
      }

      // Collect response body for rewriting
      let body = [];
      let stream = proxyRes;
      const encoding = proxyRes.headers['content-encoding'];

      if (encoding === 'gzip') {
        stream = proxyRes.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = proxyRes.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = proxyRes.pipe(zlib.createBrotliDecompress());
      }

      stream.on('data', chunk => body.push(chunk));
      stream.on('end', () => {
        const bodyBuffer = Buffer.concat(body);
        
        // Check size limit
        if (bodyBuffer.length > config.maxResponseSize) {
          return res.status(413).render('error', {
            title: translateError(t, 'error.title_generic'),
            error: 'Response size exceeds limit', // You might want to localize this too if you have a key
            code: 413
          });
        }

        let content = bodyBuffer.toString('utf8');

        // Rewrite content based on type
        const rewriter = new URLRewriter(getProxyBaseUrl(req));

        if (contentType.includes('text/html')) {
          content = rewriter.rewriteHTML(content, targetUrl);
          // Inject proxy toolbar
          content = injectProxyToolbar(content, targetUrl, getProxyBaseUrl(req), req.lang);
        } else if (contentType.includes('text/css')) {
          content = rewriter.rewriteCSS(content, targetUrl);
        } else if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
          if (config.features.javascriptRewrite) {
            content = rewriter.rewriteJS(content, targetUrl);
          }
        }

        // Update content length
        const finalBuffer = Buffer.from(content, 'utf8');
        responseHeaders['content-length'] = finalBuffer.length;

        res.writeHead(proxyRes.statusCode, responseHeaders);
        res.end(finalBuffer);
      });

      stream.on('error', (err) => {
        logger.error('Stream processing error:', err);
        res.status(500).render('error', {
          title: translateError(t, 'error.title_502'),
          error: translateError(t, 'error.title_generic'),
          code: 500
        });
      });
    });

    proxyReq.on('error', (err) => {
      logger.error('Proxy request error:', err);
      res.status(502).render('error', {
        title: translateError(t, 'error.title_502'),
        error: translateError(t, 'error.title_503'),
        code: 502
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).render('error', {
        title: translateError(t, 'error.title_503'),
        error: translateError(t, 'error.title_503'),
        code: 504
      });
    });

    proxyReq.end();

  } catch (error) {
    logger.error('Proxy error:', error);
    res.status(500).render('error', {
      title: translateError(t, 'error.title_generic'),
      error: translateError(t, 'error.title_generic'),
      code: 500
    });
  }
});

/**
 * Handle POST requests through proxy
 * معالجة طلبات POST عبر البروكسي
 */
router.post('/proxy/:encodedUrl(*)', rateLimiters.proxy, (req, res) => {
  // Similar to GET but with body forwarding
  // Implementation similar to GET handler
  res.status(501).json({ error: 'POST forwarding in development' });
});

/**
 * Check if content should be streamed
 * التحقق مما إذا كان يجب بث المحتوى
 */
const isStreamingContent = (contentType) => {
  const streamingTypes = [
    'video/',
    'audio/',
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    'application/x-rar',
    'image/',
    'font/'
  ];

  return streamingTypes.some(type => contentType.includes(type));
};

/**
 * Inject proxy toolbar into HTML
 * إضافة شريط أدوات البروكسي إلى HTML
 */
const injectProxyToolbar = (html, currentUrl, proxyBaseUrl, lang = 'ar') => {
  const t = locales[lang] || locales['ar'];
  const encodedCurrentUrl = Buffer.from(currentUrl).toString('base64url');
  const dir = t.dir;
  
  const toolbarHTML = `
<div id="proxy-toolbar" style="
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #000000;
  color: white;
  padding: 10px 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 14px;
  z-index: 9999999;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: space-between;
  direction: ${dir};
  border-bottom: 1px solid #333;
">
  <div style="display: flex; align-items: center; gap: 15px;">
    <span style="font-weight: bold; font-size: 16px;">🌐 ${t.title}</span>
    <span style="opacity: 0.8; font-size: 12px;">|</span>
    <span style="font-size: 12px; opacity: 0.9; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
      ${new URL(currentUrl).hostname}
    </span>
  </div>
  
  <div style="display: flex; align-items: center; gap: 10px;">
    <button onclick="history.back()" style="
      background: #333;
      border: 1px solid #555;
      color: white;
      padding: 6px 12px;
      border-radius: 0;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.3s;
      outline: none;
    " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#333'">⬅️</button>
    
    <button onclick="history.forward()" style="
      background: #333;
      border: 1px solid #555;
      color: white;
      padding: 6px 12px;
      border-radius: 0;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.3s;
      outline: none;
    " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#333'">➡️</button>
    
    <button onclick="location.reload()" style="
      background: #333;
      border: 1px solid #555;
      color: white;
      padding: 6px 12px;
      border-radius: 0;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.3s;
      outline: none;
    " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#333'">🔄</button>
    
    <form action="${proxyBaseUrl}/browse" method="POST" style="display: flex; gap: 5px; margin: 0;">
      <input type="url" name="url" placeholder="${t.placeholder}" style="
        padding: 6px 10px;
        border: 1px solid #555;
        border-radius: 0;
        width: 200px;
        font-size: 12px;
        direction: ltr;
        background: #222;
        color: white;
        outline: none;
      ">
      <button type="submit" style="
        background: #fff;
        border: none;
        color: black;
        padding: 6px 15px;
        border-radius: 0;
        cursor: pointer;
        font-size: 12px;
        font-weight: bold;
        transition: background 0.3s;
      " onmouseover="this.style.background='#ddd'" onmouseout="this.style.background='#fff'">${t.browse}</button>
    </form>
    
    <a href="${proxyBaseUrl}/" style="
      background: #333;
      color: white;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 0;
      font-size: 12px;
      font-weight: bold;
      border: 1px solid #555;
      transition: background 0.3s;
    " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#333'">❌</a>
  </div>
</div>
<div style="height: 50px;"></div>
<script>
  // Adjust page for toolbar
  document.documentElement.style.paddingTop = '50px';
</script>
`;

  // Insert after <body> tag or at the beginning
  if (html.includes('<body')) {
    const bodyMatch = html.match(/<body[^>]*>/i);
    if (bodyMatch) {
      const insertPos = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
      return html.slice(0, insertPos) + toolbarHTML + html.slice(insertPos);
    }
  }
  
  return toolbarHTML + html;
};

module.exports = { proxyRouter: router };
