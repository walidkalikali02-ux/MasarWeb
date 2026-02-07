/**
 * URL Rewriting Engine
 * محرك إعادة كتابة الروابط
 */

const { URL } = require('url');
const { config } = require('../utils/config');

class URLRewriter {
  constructor(proxyBaseUrl) {
    this.proxyBaseUrl = proxyBaseUrl;
  }

  /**
   * Rewrite a URL to go through the proxy
   * إعادة كتابة الرابط للمرور عبر البروكسي
   */
  rewriteURL(originalUrl, baseUrl) {
    try {
      if (!originalUrl || typeof originalUrl !== 'string') {
        return originalUrl;
      }

      // Skip data URIs and javascript:
      if (originalUrl.startsWith('data:') || 
          originalUrl.startsWith('javascript:') ||
          originalUrl.startsWith('mailto:') ||
          originalUrl.startsWith('tel:') ||
          originalUrl.startsWith('#')) {
        return originalUrl;
      }

      // Skip already proxied URLs
      if (originalUrl.includes('/proxy/') || originalUrl.startsWith('/proxy/')) {
        return originalUrl;
      }

      // Resolve relative URLs
      let absoluteUrl;
      if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
        absoluteUrl = originalUrl;
      } else if (originalUrl.startsWith('//')) {
        const protocol = new URL(baseUrl).protocol;
        absoluteUrl = protocol + originalUrl;
      } else if (originalUrl.startsWith('/')) {
        const base = new URL(baseUrl);
        absoluteUrl = `${base.protocol}//${base.host}${originalUrl}`;
      } else {
        // Relative path
        const base = new URL(baseUrl);
        const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
        absoluteUrl = `${base.protocol}//${base.host}${basePath}${originalUrl}`;
      }

      // Validate URL
      const urlObj = new URL(absoluteUrl);
      
      // Check if domain is blocked
      if (this.isDomainBlocked(urlObj.hostname)) {
        return '#';
      }

      // Encode the URL for proxy
      const encodedUrl = Buffer.from(absoluteUrl).toString('base64url');
      return `/proxy/${encodedUrl}`;

    } catch (error) {
      return originalUrl;
    }
  }

  /**
   * Check if domain is blocked
   * التحقق مما إذا كان النطاق محظورًا
   */
  isDomainBlocked(hostname) {
    const blocked = config.blockedDomains;
    return blocked.some(domain => 
      hostname === domain || 
      hostname.endsWith('.' + domain)
    );
  }

  /**
   * Rewrite HTML content
   * إعادة كتابة محتوى HTML
   */
  rewriteHTML(html, baseUrl) {
    const self = this;

    // Rewrite <a> tags
    html = html.replace(
      /<a\s+([^>]*?)href\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<a ${before}href="${rewritten}"${after}>`;
      }
    );

    // Rewrite <link> tags
    html = html.replace(
      /<link\s+([^>]*?)href\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<link ${before}href="${rewritten}"${after}>`;
      }
    );

    // Rewrite <script> tags
    html = html.replace(
      /<script\s+([^>]*?)src\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<script ${before}src="${rewritten}"${after} data-original="${url}">`;
      }
    );

    // Rewrite <img> tags
    html = html.replace(
      /<img\s+([^>]*?)src\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<img ${before}src="${rewritten}"${after}>`;
      }
    );

    // Rewrite srcset attributes
    html = html.replace(
      /srcset\s*=\s*["']([^"']*)["']/gi,
      (match, srcset) => {
        const rewritten = srcset.split(',').map(src => {
          const [url, descriptor] = src.trim().split(/\s+/);
          const rewrittenUrl = self.rewriteURL(url, baseUrl);
          return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
        }).join(', ');
        return `srcset="${rewritten}"`;
      }
    );

    // Rewrite <source> tags (for video/audio)
    html = html.replace(
      /<source\s+([^>]*?)src\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<source ${before}src="${rewritten}"${after}>`;
      }
    );

    // Rewrite <video> and <audio> tags
    html = html.replace(
      /<(video|audio)\s+([^>]*?)src\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, tag, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<${tag} ${before}src="${rewritten}"${after}>`;
      }
    );

    // Rewrite poster attribute (video thumbnail)
    html = html.replace(
      /poster\s*=\s*["']([^"']*)["']/gi,
      (match, url) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `poster="${rewritten}"`;
      }
    );

    // Rewrite <form> actions
    html = html.replace(
      /<form\s+([^>]*?)action\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<form ${before}action="${rewritten}"${after}>`;
      }
    );

    // Rewrite background attributes
    html = html.replace(
      /background\s*=\s*["']([^"']*)["']/gi,
      (match, url) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `background="${rewritten}"`;
      }
    );

    // Rewrite <iframe> src
    html = html.replace(
      /<iframe\s+([^>]*?)src\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `<iframe ${before}src="${rewritten}"${after} sandbox="allow-scripts allow-same-origin allow-forms">`;
      }
    );

    // Rewrite <object> and <embed> data/src
    html = html.replace(
      /<(object|embed)\s+([^>]*?)(?:data|src)\s*=\s*["']([^"']*)["']([^>]*)>/gi,
      (match, tag, before, url, after) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        const attr = tag === 'object' ? 'data' : 'src';
        return `<${tag} ${before}${attr}="${rewritten}"${after}>`;
      }
    );

    // Inject proxy script for JS interception
    html = this.injectProxyScript(html, baseUrl);

    return html;
  }

  /**
   * Rewrite CSS content
   * إعادة كتابة محتوى CSS
   */
  rewriteCSS(css, baseUrl) {
    const self = this;

    // Rewrite url() references
    css = css.replace(
      /url\s*\(\s*["']?([^"')\s]+)["']?\s*\)/gi,
      (match, url) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `url("${rewritten}")`;
      }
    );

    // Rewrite @import rules
    css = css.replace(
      /@import\s+(?:url\s*\()?\s*["']([^"']+)["']\s*\)?/gi,
      (match, url) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `@import "${rewritten}";`;
      }
    );

    // Rewrite @font-face src
    css = css.replace(
      /src:\s*([^;]+);/gi,
      (match, sources) => {
        const rewritten = sources.replace(
          /url\s*\(\s*["']?([^"')\s]+)["']?\s*\)/gi,
          (m, url) => {
            const rw = self.rewriteURL(url, baseUrl);
            return `url("${rw}")`;
          }
        );
        return `src: ${rewritten};`;
      }
    );

    return css;
  }

  /**
   * Rewrite JavaScript content
   * إعادة كتابة محتوى JavaScript
   */
  rewriteJS(js, baseUrl) {
    // This is a simplified JS rewriter
    // For production, consider using a proper AST parser
    
    const self = this;

    // Rewrite fetch() calls
    js = js.replace(
      /fetch\s*\(\s*["']([^"']+)["']/gi,
      (match, url) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `fetch("${rewritten}"`;
      }
    );

    // Rewrite XMLHttpRequest.open
    js = js.replace(
      /\.open\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/gi,
      (match, method, url) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `.open("${method}", "${rewritten}"`;
      }
    );

    // Rewrite new WebSocket
    if (config.features.websockets) {
      js = js.replace(
        /new\s+WebSocket\s*\(\s*["'](wss?:\/\/[^"']+)["']/gi,
        (match, url) => {
          const wsUrl = url.replace(/^wss?:\/\//, '');
          const protocol = url.startsWith('wss:') ? 'wss' : 'ws';
          const rewritten = self.rewriteURL(`http://${wsUrl}`, baseUrl)
            .replace(/^http/, protocol)
            .replace('/proxy/', '/ws/');
          return `new WebSocket("${rewritten}"`;
        }
      );
    }

    // Rewrite new Request
    js = js.replace(
      /new\s+Request\s*\(\s*["']([^"']+)["']/gi,
      (match, url) => {
        const rewritten = self.rewriteURL(url, baseUrl);
        return `new Request("${rewritten}"`;
      }
    );

    return js;
  }

  /**
   * Inject proxy script for runtime URL rewriting
   * إضافة سكربت البروكسي لإعادة الكتابة في وقت التشغيل
   */
  injectProxyScript(html, baseUrl) {
    const proxyScript = `
<script>
(function() {
  'use strict';
  
  const PROXY_BASE = '${this.proxyBaseUrl}';
  const ORIGIN_BASE = '${baseUrl}';
  
  // Store original methods
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalWebSocket = window.WebSocket;
  const originalSendBeacon = navigator.sendBeacon;
  
  // Helper to rewrite URLs
  function rewriteUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) return url;
    if (url.startsWith('/proxy/')) return url;
    
    try {
      let absoluteUrl;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        absoluteUrl = url;
      } else if (url.startsWith('//')) {
        absoluteUrl = window.location.protocol + url;
      } else if (url.startsWith('/')) {
        const origin = new URL(ORIGIN_BASE);
        absoluteUrl = origin.protocol + '//' + origin.host + url;
      } else {
        const origin = new URL(ORIGIN_BASE);
        const path = origin.pathname.substring(0, origin.pathname.lastIndexOf('/') + 1);
        absoluteUrl = origin.protocol + '//' + origin.host + path + url;
      }
      
      const encoded = btoa(absoluteUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      return PROXY_BASE + '/proxy/' + encoded;
    } catch (e) {
      return url;
    }
  }
  
  // Override fetch
  window.fetch = function(url, options) {
    if (typeof url === 'string') {
      url = rewriteUrl(url);
    } else if (url instanceof Request) {
      const newRequest = new Request(rewriteUrl(url.url), url);
      return originalFetch.call(this, newRequest, options);
    }
    return originalFetch.call(this, url, options);
  };
  
  // Override XMLHttpRequest
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    const rewritten = rewriteUrl(url);
    return originalXHROpen.call(this, method, rewritten, async, user, password);
  };
  
  // Override WebSocket
  if (originalWebSocket) {
    window.WebSocket = function(url, protocols) {
      if (typeof url === 'string') {
        url = rewriteUrl(url.replace(/^wss?:\\/\\//, 'https://'));
      }
      return new originalWebSocket(url, protocols);
    };
    window.WebSocket.prototype = originalWebSocket.prototype;
  }
  
  // Override sendBeacon
  navigator.sendBeacon = function(url, data) {
    return originalSendBeacon.call(this, rewriteUrl(url), data);
  };
  
  // Handle dynamically added elements
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          // Rewrite src attributes
          if (node.src && !node.src.startsWith('data:')) {
            node.src = rewriteUrl(node.src);
          }
          // Rewrite href attributes
          if (node.href && !node.href.startsWith('javascript:')) {
            node.href = rewriteUrl(node.href);
          }
          // Rewrite action attributes
          if (node.action) {
            node.action = rewriteUrl(node.action);
          }
        }
      });
    });
  });
  
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  
})();
</script>`;

    // Inject before closing </head> or at the beginning of <body>
    if (html.includes('</head>')) {
      return html.replace('</head>', proxyScript + '</head>');
    } else if (html.includes('<body>')) {
      return html.replace('<body>', '<body>' + proxyScript);
    }
    
    return proxyScript + html;
  }

  /**
   * Decode proxied URL
   * فك ترميز الرابط المُعاد كتابته
   */
  static decodeURL(encodedUrl) {
    try {
      // Add padding if needed
      const padding = 4 - (encodedUrl.length % 4);
      if (padding !== 4) {
        encodedUrl += '='.repeat(padding);
      }
      // Replace URL-safe characters back
      encodedUrl = encodedUrl.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(encodedUrl, 'base64').toString('utf8');
    } catch (error) {
      throw new Error('Invalid encoded URL');
    }
  }
}

module.exports = { URLRewriter };
