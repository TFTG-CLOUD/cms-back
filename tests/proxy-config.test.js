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
});
