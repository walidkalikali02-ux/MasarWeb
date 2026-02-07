/**
 * Logging Utility
 * نظام التسجيل
 */

const winston = require('winston');
const path = require('path');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Custom format for file output (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'arabic-web-proxy' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),
    // Error log file
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      format: fileFormat,
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10
    })
  ]
});

// Create a separate audit logger for security events
const auditLogger = winston.createLogger({
  level: 'info',
  defaultMeta: { service: 'arabic-web-proxy-audit' },
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/audit.log'),
      format: fileFormat,
      maxsize: 50 * 1024 * 1024,
      maxFiles: 10
    })
  ]
});

// Helper function to anonymize IP addresses
const anonymizeIP = (ip) => {
  if (!ip) return 'unknown';
  // Remove last octet for IPv4
  if (ip.includes('.')) {
    return ip.split('.').slice(0, 3).join('.') + '.0';
  }
  // Remove last 80 bits for IPv6
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::';
  }
  return ip;
};

// Log security events
const logSecurityEvent = (event, details) => {
  auditLogger.info('Security Event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Log proxy requests (anonymized)
const logProxyRequest = (req, targetUrl, status) => {
  auditLogger.info('Proxy Request', {
    anonymizedIP: anonymizeIP(req.ip),
    method: req.method,
    targetDomain: new URL(targetUrl).hostname,
    status,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  auditLogger,
  logSecurityEvent,
  logProxyRequest,
  anonymizeIP
};
