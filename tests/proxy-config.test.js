describe('proxy trust configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('defaults to trusting the first proxy hop', () => {
    const { getTrustProxySetting } = require('../src/config/proxy');

    expect(getTrustProxySetting()).toBe(1);
  });

  test('allows disabling proxy trust through environment configuration', () => {
    process.env.TRUST_PROXY = 'false';

    const { getTrustProxySetting } = require('../src/config/proxy');

    expect(getTrustProxySetting()).toBe(false);
  });

  test('supports numeric trust proxy values for multi-hop proxy setups', () => {
    process.env.TRUST_PROXY = '2';

    const { getTrustProxySetting } = require('../src/config/proxy');

    expect(getTrustProxySetting()).toBe(2);
  });

  test('skips rate limiting for public file delivery and upload routes', () => {
    const { shouldSkipRateLimit } = require('../src/config/proxy');

    expect(shouldSkipRateLimit({ method: 'GET', path: '/api/processed/public/file/abc' })).toBe(true);
    expect(shouldSkipRateLimit({ method: 'GET', path: '/api/processed/public/file/abc?width=300' })).toBe(true);
    expect(shouldSkipRateLimit({ method: 'POST', path: '/api/upload/generate-signed-url' })).toBe(true);
    expect(shouldSkipRateLimit({ method: 'POST', path: '/api/upload/chunked/init' })).toBe(true);
    expect(shouldSkipRateLimit({ method: 'POST', path: '/api/upload/chunked/upload/abc' })).toBe(true);
    expect(shouldSkipRateLimit({ method: 'GET', path: '/api/upload/chunked/status/abc' })).toBe(true);
    expect(shouldSkipRateLimit({ method: 'POST', path: '/api/processed/public/file/abc' })).toBe(false);
    expect(shouldSkipRateLimit({ method: 'GET', path: '/api/processing/jobs/abc' })).toBe(false);
  });
});
