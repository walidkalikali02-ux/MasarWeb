/**
 * MasarWeb - Advanced Web Proxy
 * Main Application Entry Point
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const hpp = require('hpp');
const path = require('path');
require('dotenv').config();

// Sentry Error Monitoring
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: "https://e0d21a59fd0857615b5b6f58e9c6af25@o4510857759817728.ingest.de.sentry.io/4510857776005200",
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV || 'development',
});

const { securityMiddleware, rateLimiters } = require('./security/security');
const { sessionManager } = require('./session/sessionManager');
const { proxyRouter } = require('./proxy/proxyRouter');
const { logger } = require('./utils/logger');
const { config } = require('./utils/config');
const { setupWebSocketProxy } = require('./proxy/websocketHandler');
const locales = require('./locales');
const articles = require('./data/articles');
const toolsRouter = require('./tools/toolsRouter');

const app = express();
const PORT = process.env.PORT || 3000;

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');
const getBaseUrl = (req) => {
  if (config.publicBaseUrl) return normalizeBaseUrl(config.publicBaseUrl);
  return `${req.protocol}://${req.get('host')}`;
};
const DEFAULT_LANG = 'ar';
const buildLocalizedUrl = (baseUrl, path, lang) => {
  if (lang && lang !== DEFAULT_LANG) {
    return `${baseUrl}${path}?lang=${lang}`;
  }
  return `${baseUrl}${path}`;
};

// Trust proxy for accurate IP detection
app.set('trust proxy', 1);

// Sentry middleware disabled due to SDK API changes; using manual capture in error handler

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "wss:", "ws:", "https:", "http:"],
      fontSrc: ["'self'", "https:", "data:"],
      mediaSrc: ["'self'", "https:", "http:"],
      frameSrc: ["'self'", "https:", "http:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: config.allowedOrigins,
  credentials: true
}));

app.use(compression());
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(config.cookieSecret));

// Session configuration
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'proxySession',
  cookie: {
    secure: config.isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  }
}));

// Language Middleware
app.use((req, res, next) => {
  let lang = req.query.lang || req.cookies.lang || 'ar';
  if (!locales[lang]) lang = 'ar';
  
  if (req.query.lang && locales[req.query.lang]) {
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
  }

  req.lang = lang;
  res.locals.t = locales[lang];
  res.locals.currentLang = lang;
  res.locals.currentUrl = req.path;
  res.locals.dir = locales[lang].dir;
  next();
});

// SEO defaults
app.use((req, res, next) => {
  const baseUrl = getBaseUrl(req);
  const siteName = res.locals.t?.title || 'MasarWeb';
  const siteDescription = res.locals.t?.description || res.locals.t?.tagline || 'Secure web proxy';
  const logoUrl = `${baseUrl}/static/images/logo.svg`;
  const currentLang = res.locals.currentLang || DEFAULT_LANG;

  res.locals.baseUrl = baseUrl;
  res.locals.canonicalUrl = buildLocalizedUrl(baseUrl, req.path, currentLang);
  res.locals.ogImage = logoUrl;
  res.locals.robots = 'index, follow';
  res.locals.xDefaultUrl = buildLocalizedUrl(baseUrl, req.path, DEFAULT_LANG);
  res.locals.hreflang = Object.keys(locales).reduce((acc, code) => {
    acc[code] = buildLocalizedUrl(baseUrl, req.path, code);
    return acc;
  }, {});
  res.locals.structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": siteName,
      "url": baseUrl,
      "logo": logoUrl
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": siteName,
      "url": baseUrl,
      "description": siteDescription,
      "inLanguage": res.locals.currentLang
    }
  ];
  next();
});

// Apply security middleware
app.use(securityMiddleware);

// Apply rate limiting
app.use(rateLimiters.general);

// Static files
app.use('/static', express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('../package.json').version
  });
});

// Static Pages
app.get('/support', (req, res) => res.render('support', {
  pageTitle: `${res.locals.t.support_page.title} - ${res.locals.t.title}`,
  description: res.locals.t.support_page.desc
}));
app.get('/terms', (req, res) => res.render('terms', {
  pageTitle: `${res.locals.t.terms_page.title} - ${res.locals.t.title}`,
  description: res.locals.t.terms_page.intro_text
}));
app.get('/privacy', (req, res) => res.render('privacy', {
  pageTitle: `${res.locals.t.privacy_page.title} - ${res.locals.t.title}`,
  description: res.locals.t.privacy_page.collection_text
}));

// Tools Routes
app.use('/tools', toolsRouter);

// Blog Routes
app.get('/blog', (req, res) => {
    const sorted = [...articles].sort((a, b) => {
      const da = new Date(a.date);
      const db = new Date(b.date);
      return db - da;
    });
    res.render('blog', {
      articles: sorted,
      pageTitle: res.locals.t.blog_title || 'Blog',
      description: res.locals.currentLang === 'ar'
        ? 'أحدث مقالات MasarWeb حول الخصوصية والأمان وأدوات الحماية.'
        : 'Latest MasarWeb articles on privacy, security, and protection tools.'
    });
});

app.get('/blog/:slug', (req, res) => {
    const article = articles.find(a => a.slug === req.params.slug);
    if (!article) {
        return res.status(404).render('error', {
            title: 'Not Found',
            error: 'Article not found',
            code: 404
        });
    }
    const baseStructuredData = res.locals.structuredData || [];
    res.render('article', {
      article,
      pageTitle: article.title,
      description: article.excerpt,
      ogType: 'article',
      articleMeta: {
        publishedTime: article.date
      },
      structuredData: [
        ...baseStructuredData,
        {
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": article.title,
          "datePublished": article.date,
          "dateModified": article.date,
          "author": {
            "@type": "Organization",
            "name": res.locals.t.title
          },
          "publisher": {
            "@type": "Organization",
            "name": res.locals.t.title,
            "logo": {
              "@type": "ImageObject",
              "url": res.locals.ogImage
            }
          },
          "description": article.excerpt,
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": `${res.locals.baseUrl}/blog/${article.slug}`
          }
        }
      ]
    });
});

// Sitemap
app.get('/sitemap.xml', (req, res) => {
    const baseUrl = getBaseUrl(req);
    const staticPages = [
        '/',
        '/support',
        '/terms',
        '/privacy',
        '/blog',
        '/tools',
        '/tools/password-analyzer',
        '/tools/key-strength',
        '/tools/absence-deduction',
        '/tools/virus-scanner',
        '/tools/team-password-vault',
        '/tools/bcrypt-calculator',
        '/tools/entropy-calculator',
        '/tools/password-expiration',
        '/tools/2fa-generator',
        '/tools/hash-identifier',
        '/tools/breach-checker',
        '/tools/diceware-passphrase',
        '/tools/password-generator'
    ];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    // Add static pages
    staticPages.forEach(page => {
        xml += '<url>';
        xml += `<loc>${baseUrl}${page}</loc>`;
        xml += '<changefreq>monthly</changefreq>';
        xml += '<priority>0.8</priority>';
        xml += '</url>';
    });

    // Add blog articles
    articles.forEach(article => {
        xml += '<url>';
        xml += `<loc>${baseUrl}/blog/${article.slug}</loc>`;
        xml += `<lastmod>${article.date}</lastmod>`;
        xml += '<changefreq>weekly</changefreq>';
        xml += '<priority>0.9</priority>';
        xml += '</url>';
    });

    xml += '</urlset>';

    res.header('Content-Type', 'application/xml');
    res.send(xml);
});

// Robots.txt
app.get('/robots.txt', (req, res) => {
    const baseUrl = getBaseUrl(req);
    const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /proxy/
Disallow: /browse
Disallow: /health
Sitemap: ${baseUrl}/sitemap.xml`;

    res.header('Content-Type', 'text/plain');
    res.send(robots);
});

// Proxy routes (main functionality)
app.use('/', proxyRouter);

// Error handling
app.use((err, req, res, next) => {
  try { Sentry.captureException(err); } catch (_) {}
  logger.error('Unhandled error:', err);
  
  const t = res.locals.t || { error: { title_generic: 'Error' } };

  if (req.accepts('html')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(500).render('error', {
      title: t.error.title_generic,
      error: config.isProduction ? t.error.title_generic : err.message,
      code: 500
    });
  } else {
    res.status(500).json({
      error: 'Internal Server Error',
      message: config.isProduction ? 'An error occurred' : err.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  const t = res.locals.t || { error: { title_404: 'Not Found' } };

  if (req.accepts('html')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(404).render('error', {
      title: t.error.title_404,
      error: t.error.title_404,
      code: 404
    });
  } else {
    res.status(404).json({ error: 'Not Found' });
  }
});

// Start server if running directly
if (require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info(`MasarWeb running on port ${PORT}`);
    logger.info(`Environment: ${config.isProduction ? 'production' : 'development'}`);
    logger.info(`WebSocket proxy: ${config.features.websockets ? 'enabled' : 'disabled'}`);
  });

  // Initialize WebSocket proxy
  setupWebSocketProxy(server);
}

module.exports = app;
