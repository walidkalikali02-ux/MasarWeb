jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logSecurityEvent: jest.fn(), logProxyRequest: jest.fn()
}));
jest.mock('@sentry/node', () => ({ init: jest.fn(), captureException: jest.fn() }));

const { once } = require('node:events');
const dns = require('node:dns').promises;
const https = require('node:https');
const { PassThrough } = require('node:stream');
const { config } = require('../src/utils/config');
const { validateAndNormalizeURL } = require('../src/security/security');
const app = require('../src/app');
let server;
let base;

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
  config.features.proxy = false;
  config.allowedTargetDomains = [];
});
afterEach(() => jest.restoreAllMocks());

test.each([
  ['GET', '/proxy/aHR0cHM6Ly9leGFtcGxlLmNvbS8'],
  ['HEAD', '/proxy/arbitrary'], ['POST', '/proxy/arbitrary'],
  ['OPTIONS', '/proxy/arbitrary'], ['PUT', '/proxy/arbitrary'],
  ['GET', '/proxy'], ['GET', '/browse'], ['POST', '/browse']
])('disabled proxy rejects %s %s without outbound requests', async (method, path) => {
  const lookup = jest.spyOn(dns, 'lookup');
  const upstream = jest.spyOn(https, 'request');
  const res = await fetch(base + path, { method });
  expect(res.status).toBe(410);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('content-security-policy')).toContain('sandbox;');
  expect(lookup).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
  await res.text();
});

test('proxy flag without an allowlist still returns 410', async () => {
  config.features.proxy = true;
  const res = await fetch(base + '/proxy/anything');
  expect(res.status).toBe(410);
  await res.text();
});

test('homepage removes proxy form while tools and blog remain available', async () => {
  const homepage = await (await fetch(base)).text();
  expect(homepage).not.toContain('id="search-form"');
  expect(homepage).toContain('href="/tools"');
  for (const path of ['/tools', '/blog', '/health']) {
    const res = await fetch(base + path);
    expect(res.status).toBe(200);
    await res.text();
  }
});

test.each(['/tools/virus-scanner', '/tools/virus-scanner/scan', '/tools/virus-scanner/scan-url', '/tools/simulations/virus-scanner/scan', '/tools/simulations/virus-scanner/scan-url'])('retired scanner %s never returns fabricated results', async path => {
  for (const method of ['GET', 'POST']) {
    const res = await fetch(base + path, { method });
    expect(res.status).toBe(410);
    expect(await res.text()).not.toContain('positives');
  }
});

test('destination policy allows only exact approved HTTPS hosts and public DNS', async () => {
  config.allowedTargetDomains = ['example.com'];
  const lookup = jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  expect((await validateAndNormalizeURL('https://example.com')).valid).toBe(true);
  lookup.mockClear();
  for (const url of ['https://sub.example.com', 'https://example.com.attacker.test', 'https://untrusted.test', 'http://example.com', 'https://user:pass@example.com', 'https://example.com:444']) {
    expect((await validateAndNormalizeURL(url)).valid).toBe(false);
  }
  expect(lookup).not.toHaveBeenCalled();
  lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
  expect((await validateAndNormalizeURL('https://example.com')).valid).toBe(false);
});

test.each([
  ['text/html', undefined, undefined, 200],
  ['application/octet-stream', undefined, undefined, 403],
  ['text/html', 'attachment; filename=page.html', undefined, 403],
  ['text/html', undefined, 'https://untrusted.test/login', 403],
  ['text/html', undefined, 'javascript:alert(1)', 403]
])('restricted proxy handles %s disposition=%s redirect=%s safely', async (type, disposition, location, expected) => {
  config.features.proxy = true;
  config.allowedTargetDomains = ['example.com'];
  jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  const upstream = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
    const request = new PassThrough();
    request.end = () => {
      const response = new PassThrough();
      response.statusCode = location ? 302 : 200;
      response.headers = { 'content-type': type, 'content-disposition': disposition, location };
      callback(response);
      response.end('<html><head></head><body><form><input></form><script>alert(1)</script></body></html>');
    };
    return request;
  });
  const encoded = Buffer.from('https://example.com').toString('base64url');
  const res = await fetch(`${base}/proxy/${encoded}`, { redirect: 'manual' });
  expect(res.status).toBe(expected);
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const csp = res.headers.get('content-security-policy');
  expect(csp).toContain('sandbox;');
  expect(csp).toContain("form-action 'none'");
  expect(csp).not.toContain('allow-scripts');
  expect(csp).not.toContain('allow-same-origin');
  await res.text();
});
