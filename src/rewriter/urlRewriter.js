/**
 * URL Rewriting Engine
 * محرك إعادة كتابة الروابط
 */

const cheerio = require('cheerio');
const { URL } = require('url');
const { config } = require('../utils/config');

class URLRewriter {
  constructor(proxyBaseUrl) {
    this.proxyBaseUrl = proxyBaseUrl;
  }

  shouldSkipUrl(originalUrl) {
    if (!originalUrl || typeof originalUrl !== 'string') {
      return true;
    }

    const trimmed = originalUrl.trim();
    return (
      trimmed.startsWith('data:') ||
      trimmed.startsWith('javascript:') ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('about:') ||
      trimmed.startsWith('#')
    );
  }

  resolveAbsoluteUrl(originalUrl, baseUrl) {
    if (!originalUrl || typeof originalUrl !== 'string') {
      return originalUrl;
    }

    const trimmed = originalUrl.trim();

    if (this.shouldSkipUrl(trimmed) || trimmed.startsWith('/proxy/') || trimmed.startsWith(`${this.proxyBaseUrl}/proxy/`)) {
      return trimmed;
    }

    try {
      return new URL(trimmed, baseUrl).toString();
    } catch (error) {
      return trimmed;
    }
  }

  encodeUrl(url) {
    return Buffer.from(url).toString('base64url');
  }

  rewriteWebSocketURL(originalUrl, baseUrl) {
    const absoluteUrl = this.resolveAbsoluteUrl(originalUrl, baseUrl);

    if (!absoluteUrl || this.shouldSkipUrl(absoluteUrl)) {
      return originalUrl;
    }

    let wsUrl = absoluteUrl;

    if (wsUrl.startsWith('http://')) {
      wsUrl = `ws://${wsUrl.slice('http://'.length)}`;
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = `wss://${wsUrl.slice('https://'.length)}`;
    }

    if (!config.features.websockets) {
      return wsUrl;
    }

    try {
      const urlObj = new URL(wsUrl);
      if (this.isDomainBlocked(urlObj.hostname)) {
        return '#';
      }

      return `${this.proxyBaseUrl}/ws?url=${encodeURIComponent(this.encodeUrl(wsUrl))}`;
    } catch (error) {
      return originalUrl;
    }
  }

  rewriteURL(originalUrl, baseUrl) {
    if (!originalUrl || typeof originalUrl !== 'string') {
      return originalUrl;
    }

    const trimmed = originalUrl.trim();
    if (this.shouldSkipUrl(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('/proxy/') || trimmed.startsWith(`${this.proxyBaseUrl}/proxy/`)) {
      return trimmed;
    }

    if (/^wss?:\/\//i.test(trimmed)) {
      return this.rewriteWebSocketURL(trimmed, baseUrl);
    }

    const absoluteUrl = this.resolveAbsoluteUrl(trimmed, baseUrl);

    try {
      const urlObj = new URL(absoluteUrl);

      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return trimmed;
      }

      if (this.isDomainBlocked(urlObj.hostname)) {
        return '#';
      }

      return `/proxy/${this.encodeUrl(absoluteUrl)}`;
    } catch (error) {
      return trimmed;
    }
  }

  isDomainBlocked(hostname) {
    const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
    const blocked = config.blockedDomains;
    const isBlocked = blocked.some((domain) =>
      normalizedHostname === domain ||
      normalizedHostname.endsWith(`.${domain}`)
    );

    if (isBlocked) {
      return true;
    }

    if (config.allowedTargetDomains.length > 0) {
      return !config.allowedTargetDomains.some((domain) =>
        normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
      );
    }

    if (/^localhost$/i.test(normalizedHostname) || normalizedHostname.endsWith('.localhost')) {
      return true;
    }

    return config.blockedMetadataEndpoints.some((endpoint) =>
      normalizedHostname === endpoint || normalizedHostname.endsWith(`.${endpoint}`)
    );
  }

  rewriteSrcset(srcset, baseUrl) {
    if (!srcset) {
      return srcset;
    }

    return srcset
      .split(',')
      .map((entry) => {
        const parts = entry.trim().split(/\s+/);
        if (!parts.length) {
          return entry;
        }

        const [url, ...descriptors] = parts;
        const rewrittenUrl = this.rewriteURL(url, baseUrl);
        return [rewrittenUrl, ...descriptors].join(' ').trim();
      })
      .join(', ');
  }

  rewriteStyleAttribute(styleValue, baseUrl) {
    if (!styleValue) {
      return styleValue;
    }

    return this.rewriteCSS(styleValue, baseUrl);
  }

  rewriteMetaRefresh(contentValue, baseUrl) {
    if (!contentValue) {
      return contentValue;
    }

    return contentValue.replace(/(url\s*=\s*)([^;]+)/i, (match, prefix, urlValue) => {
      const cleanedUrl = urlValue.trim().replace(/^['"]|['"]$/g, '');
      const rewrittenUrl = this.rewriteURL(cleanedUrl, baseUrl);
      return `${prefix}${rewrittenUrl}`;
    });
  }

  rewriteHtmlAttribute($, $elements, attributeName, baseUrl, options = {}) {
    const { sandboxIframe = false, preserveOriginal = false, removeIntegrity = false } = options;

    $elements.each((_, element) => {
      const $element = $(element);
      const originalValue = $element.attr(attributeName);
      if (!originalValue) {
        return;
      }

      const rewrittenValue = this.rewriteURL(originalValue, baseUrl);
      $element.attr(attributeName, rewrittenValue);

      if (preserveOriginal) {
        $element.attr('data-original', originalValue);
      }

      if (removeIntegrity) {
        $element.removeAttr('integrity');
        $element.removeAttr('crossorigin');
      }

      if (sandboxIframe) {
        const currentSandbox = ($element.attr('sandbox') || '').split(/\s+/).filter(Boolean);
        const requiredTokens = ['allow-scripts', 'allow-same-origin', 'allow-forms'];
        const nextSandbox = Array.from(new Set([...currentSandbox, ...requiredTokens])).join(' ');
        $element.attr('sandbox', nextSandbox);
      }
    });
  }

  rewriteHTML(html, baseUrl) {
    const $ = cheerio.load(html, {
      decodeEntities: false,
      scriptingEnabled: false
    });

    const baseTag = $('base[href]').first();
    const effectiveBase = baseTag.length
      ? (this.resolveAbsoluteUrl(baseTag.attr('href'), baseUrl) || baseUrl)
      : baseUrl;

    if (baseTag.length) {
      baseTag.attr('href', this.rewriteURL(baseTag.attr('href'), baseUrl));
    }

    this.rewriteHtmlAttribute($, $('a[href], area[href], link[href]'), 'href', effectiveBase, {
      removeIntegrity: true
    });
    this.rewriteHtmlAttribute($, $('script[src]'), 'src', effectiveBase, {
      preserveOriginal: true,
      removeIntegrity: true
    });
    this.rewriteHtmlAttribute($, $('img[src], source[src], video[src], audio[src], track[src], input[src]'), 'src', effectiveBase);
    this.rewriteHtmlAttribute($, $('form[action]'), 'action', effectiveBase);
    this.rewriteHtmlAttribute($, $('iframe[src]'), 'src', effectiveBase, { sandboxIframe: true });
    this.rewriteHtmlAttribute($, $('object[data]'), 'data', effectiveBase);
    this.rewriteHtmlAttribute($, $('embed[src]'), 'src', effectiveBase);
    this.rewriteHtmlAttribute($, $('[poster]'), 'poster', effectiveBase);
    this.rewriteHtmlAttribute($, $('[background]'), 'background', effectiveBase);

    $('[srcset], [imagesrcset]').each((_, element) => {
      const $element = $(element);
      ['srcset', 'imagesrcset'].forEach((attributeName) => {
        const currentValue = $element.attr(attributeName);
        if (currentValue) {
          $element.attr(attributeName, this.rewriteSrcset(currentValue, effectiveBase));
        }
      });
    });

    $('[style]').each((_, element) => {
      const $element = $(element);
      $element.attr('style', this.rewriteStyleAttribute($element.attr('style'), effectiveBase));
    });

    $('style').each((_, element) => {
      const $element = $(element);
      $element.text(this.rewriteCSS($element.html(), effectiveBase));
    });

    $('meta[http-equiv]').each((_, element) => {
      const $element = $(element);
      if (($element.attr('http-equiv') || '').toLowerCase() === 'refresh') {
        $element.attr('content', this.rewriteMetaRefresh($element.attr('content'), effectiveBase));
      }
    });

    this.injectProxyScript($, effectiveBase);

    return $.html();
  }

  rewriteCSS(css, baseUrl) {
    if (!css) {
      return css;
    }

    let rewrittenCss = css;

    rewrittenCss = rewrittenCss.replace(
      /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
      (match, quote, url) => {
        const rewrittenUrl = this.rewriteURL(url, baseUrl);
        return `url("${rewrittenUrl}")`;
      }
    );

    rewrittenCss = rewrittenCss.replace(
      /@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?/gi,
      (match, quote, url) => {
        const rewrittenUrl = this.rewriteURL(url, baseUrl);
        return `@import "${rewrittenUrl}"`;
      }
    );

    return rewrittenCss;
  }

  rewriteJSImportSpecifier(specifier, baseUrl, options = {}) {
    const { websocket = false } = options;

    if (!specifier || this.shouldSkipUrl(specifier)) {
      return specifier;
    }

    const looksRelativeOrRemote =
      specifier.startsWith('.') ||
      specifier.startsWith('/') ||
      specifier.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/i.test(specifier);

    if (!looksRelativeOrRemote) {
      return specifier;
    }

    return websocket
      ? this.rewriteWebSocketURL(specifier, baseUrl)
      : this.rewriteURL(specifier, baseUrl);
  }

  rewriteJS(js, baseUrl) {
    if (!js) {
      return js;
    }

    let rewrittenJs = js;

    const literalPatterns = [
      { regex: /\bfetch\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: false },
      { regex: /\bnew\s+Request\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: false },
      { regex: /\bnew\s+Worker\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: false },
      { regex: /\bnew\s+SharedWorker\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: false },
      { regex: /\bnavigator\.serviceWorker\.register\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: false },
      { regex: /\bimportScripts\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: false },
      { regex: /\bnew\s+EventSource\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: false },
      { regex: /\bnew\s+WebSocket\s*\(\s*(['"`])([^'"`]+)\1/gi, websocket: true },
      { regex: /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/gi, dynamicImport: true },
      { regex: /\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?(['"`])([^'"`]+)\1/gi, moduleSpecifier: true }
    ];

    literalPatterns.forEach((pattern) => {
      rewrittenJs = rewrittenJs.replace(pattern.regex, (match, quote, specifier) => {
        const rewrittenSpecifier = this.rewriteJSImportSpecifier(
          specifier,
          baseUrl,
          { websocket: pattern.websocket }
        );

        if (pattern.dynamicImport) {
          return match.replace(specifier, rewrittenSpecifier);
        }

        if (pattern.moduleSpecifier) {
          return match.replace(specifier, rewrittenSpecifier);
        }

        return match.replace(specifier, rewrittenSpecifier);
      });
    });

    rewrittenJs = rewrittenJs.replace(
      /\.open\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])([^'"`]+)\3/gi,
      (match, methodQuote, method, urlQuote, url) => {
        const rewrittenUrl = this.rewriteURL(url, baseUrl);
        return `.open(${methodQuote}${method}${methodQuote}, ${urlQuote}${rewrittenUrl}${urlQuote}`;
      }
    );

    return rewrittenJs;
  }

  injectProxyScript($, baseUrl) {
    const proxyBase = JSON.stringify(this.proxyBaseUrl);
    const originBase = JSON.stringify(baseUrl);

    const proxyScript = `
<script data-proxy-runtime="true">
(function() {
  'use strict';

  if (window.__masarProxyRuntime) {
    return;
  }

  window.__masarProxyRuntime = true;

  const PROXY_BASE = ${proxyBase};
  const ORIGIN_BASE = ${originBase};
  const WEBSOCKET_PROXY_ENABLED = ${JSON.stringify(config.features.websockets)};
  const SPECIAL_PROTOCOLS = /^(data:|javascript:|mailto:|tel:|blob:|about:|#)/i;
  const ATTRIBUTE_NAMES = new Set(['href', 'src', 'action', 'poster', 'data', 'background']);
  const SRCSET_ATTRIBUTES = new Set(['srcset', 'imagesrcset']);

  function encodeUrl(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach(function(byte) {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
  }

  function toAbsoluteUrl(value) {
    if (!value || typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || SPECIAL_PROTOCOLS.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/proxy/') || trimmed.indexOf(PROXY_BASE + '/proxy/') === 0) return trimmed;
    try {
      return new URL(trimmed, ORIGIN_BASE).toString();
    } catch (error) {
      return trimmed;
    }
  }

  function rewriteHttpUrl(value) {
    const absoluteUrl = toAbsoluteUrl(value);
    if (!absoluteUrl || SPECIAL_PROTOCOLS.test(absoluteUrl)) return value;
    if (absoluteUrl.startsWith('/proxy/') || absoluteUrl.indexOf(PROXY_BASE + '/proxy/') === 0) return absoluteUrl;

    try {
      const parsed = new URL(absoluteUrl);
      if (!/^https?:$/i.test(parsed.protocol)) {
        return value;
      }
      return PROXY_BASE + '/proxy/' + encodeUrl(parsed.toString());
    } catch (error) {
      return value;
    }
  }

  function rewriteWebSocketUrl(value) {
    const absoluteUrl = toAbsoluteUrl(value);
    if (!absoluteUrl || SPECIAL_PROTOCOLS.test(absoluteUrl)) return value;

    let wsUrl = absoluteUrl;
    if (wsUrl.startsWith('http://')) {
      wsUrl = 'ws://' + wsUrl.slice('http://'.length);
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = 'wss://' + wsUrl.slice('https://'.length);
    }

    if (!WEBSOCKET_PROXY_ENABLED) {
      return wsUrl;
    }

    return PROXY_BASE + '/ws?url=' + encodeURIComponent(encodeUrl(wsUrl));
  }

  function rewriteSrcset(value) {
    if (!value) return value;
    return value.split(',').map(function(entry) {
      const parts = entry.trim().split(/\\s+/);
      if (!parts.length) return entry;
      const url = parts.shift();
      return [rewriteHttpUrl(url)].concat(parts).join(' ').trim();
    }).join(', ');
  }

  function rewriteCssValue(value) {
    if (!value) return value;
    return value
      .replace(/url\\(\\s*(["']?)([^"')]+)\\1\\s*\\)/gi, function(match, quote, url) {
        return 'url("' + rewriteHttpUrl(url) + '")';
      })
      .replace(/@import\\s+(?:url\\(\\s*)?(["'])([^"']+)\\1\\s*\\)?/gi, function(match, quote, url) {
        return '@import "' + rewriteHttpUrl(url) + '"';
      });
  }

  function rewriteNode(node) {
    if (!node || node.nodeType !== 1) return;

    ATTRIBUTE_NAMES.forEach(function(attributeName) {
      const value = node.getAttribute && node.getAttribute(attributeName);
      if (value) {
        node.setAttribute(attributeName, rewriteHttpUrl(value));
      }
    });

    SRCSET_ATTRIBUTES.forEach(function(attributeName) {
      const value = node.getAttribute && node.getAttribute(attributeName);
      if (value) {
        node.setAttribute(attributeName, rewriteSrcset(value));
      }
    });

    if (node.hasAttribute && node.hasAttribute('style')) {
      node.setAttribute('style', rewriteCssValue(node.getAttribute('style')));
    }

    if (node.tagName === 'STYLE') {
      node.textContent = rewriteCssValue(node.textContent);
    }

    if (node.tagName === 'IFRAME') {
      const currentSandbox = (node.getAttribute('sandbox') || '').split(/\\s+/).filter(Boolean);
      ['allow-scripts', 'allow-same-origin', 'allow-forms'].forEach(function(token) {
        if (currentSandbox.indexOf(token) === -1) {
          currentSandbox.push(token);
        }
      });
      node.setAttribute('sandbox', currentSandbox.join(' '));
    }

    if (node.querySelectorAll) {
      node.querySelectorAll('*').forEach(rewriteNode);
    }
  }

  const originalFetch = window.fetch;
  const originalRequest = window.Request;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalWebSocket = window.WebSocket;
  const originalEventSource = window.EventSource;
  const originalSendBeacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
  const originalOpen = window.open;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const originalSetAttribute = Element.prototype.setAttribute;

  if (originalFetch) {
    window.fetch = function(input, init) {
      if (typeof input === 'string') {
        return originalFetch.call(this, rewriteHttpUrl(input), init);
      }

      if (input instanceof originalRequest) {
        const rewrittenRequest = new originalRequest(rewriteHttpUrl(input.url), input);
        return originalFetch.call(this, rewrittenRequest, init);
      }

      return originalFetch.call(this, input, init);
    };
  }

  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    return originalXHROpen.call(this, method, rewriteHttpUrl(url), async, user, password);
  };

  if (originalWebSocket && WEBSOCKET_PROXY_ENABLED) {
    window.WebSocket = function(url, protocols) {
      return new originalWebSocket(rewriteWebSocketUrl(url), protocols);
    };
    window.WebSocket.prototype = originalWebSocket.prototype;
  }

  if (originalEventSource) {
    window.EventSource = function(url, config) {
      return new originalEventSource(rewriteHttpUrl(url), config);
    };
    window.EventSource.prototype = originalEventSource.prototype;
  }

  if (navigator.serviceWorker && navigator.serviceWorker.register) {
    const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function(scriptUrl, options) {
      return originalRegister(rewriteHttpUrl(scriptUrl), options);
    };
  }

  if (typeof window.Worker === 'function') {
    const OriginalWorker = window.Worker;
    window.Worker = function(scriptUrl, options) {
      return new OriginalWorker(rewriteHttpUrl(scriptUrl), options);
    };
    window.Worker.prototype = OriginalWorker.prototype;
  }

  if (typeof window.SharedWorker === 'function') {
    const OriginalSharedWorker = window.SharedWorker;
    window.SharedWorker = function(scriptUrl, options) {
      return new OriginalSharedWorker(rewriteHttpUrl(scriptUrl), options);
    };
    window.SharedWorker.prototype = OriginalSharedWorker.prototype;
  }

  if (originalSendBeacon) {
    navigator.sendBeacon = function(url, data) {
      return originalSendBeacon(rewriteHttpUrl(url), data);
    };
  }

  window.open = function(url, target, features) {
    return originalOpen.call(window, rewriteHttpUrl(url), target, features);
  };

  history.pushState = function(state, title, url) {
    return originalPushState.call(history, state, title, url ? rewriteHttpUrl(url) : url);
  };

  history.replaceState = function(state, title, url) {
    return originalReplaceState.call(history, state, title, url ? rewriteHttpUrl(url) : url);
  };

  Element.prototype.setAttribute = function(name, value) {
    const normalizedName = String(name).toLowerCase();

    if (ATTRIBUTE_NAMES.has(normalizedName)) {
      return originalSetAttribute.call(this, name, rewriteHttpUrl(value));
    }

    if (SRCSET_ATTRIBUTES.has(normalizedName)) {
      return originalSetAttribute.call(this, name, rewriteSrcset(value));
    }

    if (normalizedName === 'style') {
      return originalSetAttribute.call(this, name, rewriteCssValue(value));
    }

    return originalSetAttribute.call(this, name, value);
  };

  document.addEventListener('click', function(event) {
    const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    anchor.setAttribute('href', rewriteHttpUrl(anchor.getAttribute('href')));
  }, true);

  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(rewriteNode);
    });
  });

  rewriteNode(document.documentElement);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
</script>`;

    if ($('head').length) {
      $('head').prepend(proxyScript);
      return;
    }

    if ($('body').length) {
      $('body').prepend(proxyScript);
      return;
    }

    $.root().prepend(proxyScript);
  }

  static decodeURL(encodedUrl) {
    try {
      let normalizedUrl = encodedUrl;
      const padding = 4 - (normalizedUrl.length % 4);
      if (padding !== 4) {
        normalizedUrl += '='.repeat(padding);
      }

      normalizedUrl = normalizedUrl.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(normalizedUrl, 'base64').toString('utf8');
    } catch (error) {
      throw new Error('Invalid encoded URL');
    }
  }
}

module.exports = { URLRewriter };
