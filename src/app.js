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

const { securityMiddleware, rateLimiters } = require('./security/security');
const { sessionManager } = require('./session/sessionManager');
const { proxyRouter } = require('./proxy/proxyRouter');
const { logger } = require('./utils/logger');
const { config } = require('./utils/config');
const { setupWebSocketProxy } = require('./proxy/websocketHandler');
const locales = require('./locales');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP detection
app.set('trust proxy', 1);

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
  res.locals.dir = locales[lang].dir;
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
app.get('/support', (req, res) => res.render('support'));
app.get('/terms', (req, res) => res.render('terms'));
app.get('/privacy', (req, res) => res.render('privacy'));

// Proxy routes (main functionality)
app.use('/', proxyRouter);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  const t = res.locals.t || { error: { title_generic: 'Error' } };

  if (req.accepts('html')) {
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
    res.status(404).render('error', {
      title: t.error.title_404,
      error: t.error.title_404,
      code: 404
    });
  } else {
    res.status(404).json({ error: 'Not Found' });
  }
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`MasarWeb running on port ${PORT}`);
  logger.info(`Environment: ${config.isProduction ? 'production' : 'development'}`);
  logger.info(`WebSocket proxy: ${config.features.websockets ? 'enabled' : 'disabled'}`);
});

// Initialize WebSocket proxy
setupWebSocketProxy(server);

module.exports = app;
