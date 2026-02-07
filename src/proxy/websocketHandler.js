/**
 * WebSocket Proxy Handler
 * معالج بروكسي WebSocket
 */

const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');

/**
 * Setup WebSocket proxy server
 * إعداد خادم بروكسي WebSocket
 */
const setupWebSocketProxy = (server) => {
  if (!config.features.websockets) {
    logger.info('WebSocket proxy disabled');
    return;
  }

  const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    verifyClient: (info, cb) => {
      // Verify client connection
      const token = info.req.url.split('?token=')[1];
      // Add token validation here if needed
      cb(true);
    }
  });

  wss.on('connection', (ws, req) => {
    logger.info(`WebSocket connection from ${req.socket.remoteAddress}`);

    // Parse target URL from query parameters or headers
    let targetUrl;
    try {
      const urlParams = new URL(req.url, `http://${req.headers.host}`);
      const encodedUrl = urlParams.searchParams.get('url');
      if (encodedUrl) {
        targetUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8');
      }
    } catch (error) {
      logger.error('Invalid WebSocket URL:', error);
      ws.close(1002, 'Invalid URL');
      return;
    }

    if (!targetUrl) {
      ws.close(1002, 'Target URL required');
      return;
    }

    // Convert ws:// to http:// and wss:// to https://
    const httpUrl = targetUrl.replace(/^ws/, 'http');
    const targetUrlObj = new URL(httpUrl);

    // Check if WebSocket URL is allowed
    const isAllowed = checkWebSocketAllowed(targetUrlObj);
    if (!isAllowed) {
      ws.close(1008, 'Connection not allowed');
      return;
    }

    // Create connection to target WebSocket
    const wsProtocol = targetUrlObj.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsTargetUrl = targetUrl.replace(/^http/, 'ws');

    logger.info(`Proxying WebSocket to: ${wsTargetUrl}`);

    let targetWs;
    try {
      targetWs = new WebSocket(wsTargetUrl, {
        rejectUnauthorized: config.isProduction, // Validate certificates in production
        headers: {
          'User-Agent': config.userAgents[0],
          'Origin': targetUrlObj.origin
        }
      });
    } catch (error) {
      logger.error('WebSocket connection error:', error);
      ws.close(1011, 'Connection failed');
      return;
    }

    // Handle connection open
    targetWs.on('open', () => {
      logger.info('WebSocket connected to target');
    });

    // Handle messages from client to target
    ws.on('message', (data) => {
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(data);
      }
    });

    // Handle messages from target to client
    targetWs.on('message', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle close
    ws.on('close', (code, reason) => {
      logger.info(`Client WebSocket closed: ${code}`);
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.close();
      }
    });

    targetWs.on('close', (code, reason) => {
      logger.info(`Target WebSocket closed: ${code}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('Client WebSocket error:', error);
    });

    targetWs.on('error', (error) => {
      logger.error('Target WebSocket error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Target error');
      }
    });

    // Ping/Pong keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  wss.on('error', (error) => {
    logger.error('WebSocket server error:', error);
  });

  logger.info('WebSocket proxy server initialized');
  return wss;
};

/**
 * Check if WebSocket connection is allowed
 * التحقق مما إذا كان الاتصال مسموحًا به
 */
const checkWebSocketAllowed = (urlObj) => {
  // Check blocked domains
  if (config.blockedDomains.some(domain => 
    urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
  )) {
    return false;
  }

  // Check private IPs
  const isPrivateIP = (ip) => {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
    ];
    return privateRanges.some(range => range.test(ip));
  };

  if (isPrivateIP(urlObj.hostname)) {
    return false;
  }

  return true;
};

module.exports = { setupWebSocketProxy };
