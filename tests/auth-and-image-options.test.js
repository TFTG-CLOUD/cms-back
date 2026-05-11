const bcrypt = require('bcryptjs');

describe('auth middleware environment credentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('authenticates requests with API key and secret from environment', async () => {
    process.env.API_KEY = 'env-key';
    process.env.API_SECRET = 'env-secret';

    jest.doMock('../src/models/ApiKey', () => ({
      findOne: jest.fn()
    }));

    const { authenticateApiKey } = require('../src/middleware/auth');

    const req = {
      headers: {
        'x-api-key': 'env-key',
        'x-api-secret': 'env-secret'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.apiKey).toMatchObject({
      name: 'Environment API Key',
      permissions: ['upload', 'process', 'read', 'delete']
    });
  });

  test('rejects invalid environment secret', async () => {
    process.env.API_KEY = 'env-key';
    process.env.API_SECRET = 'env-secret';

    jest.doMock('../src/models/ApiKey', () => ({
      findOne: jest.fn()
    }));

    const { authenticateApiKey } = require('../src/middleware/auth');

    const req = {
      headers: {
        'x-api-key': 'env-key',
        'x-api-secret': 'wrong-secret'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API secret' });
  });

  test('skips default database key creation when environment credentials are configured', async () => {
    process.env.API_KEY = 'env-key';
    process.env.API_SECRET = 'env-secret';

    const countDocuments = jest.fn();
    const save = jest.fn();

    jest.doMock('../src/models/ApiKey', () =>
      Object.assign(
        jest.fn().mockImplementation(function MockApiKey() {
          this.save = save;
        }),
        { countDocuments }
      )
    );

    const DatabaseInitializer = require('../src/services/DatabaseInitializer');
    const result = await DatabaseInitializer.initializeDefaultApiKey();

    expect(countDocuments).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      message: 'Environment API key configuration is active'
    });
  });
});

describe('image variant option parsing', () => {
  test('keeps a single width and leaves height adaptive', () => {
    const { normalizeImageTransformOptions } = require('../src/services/ImageVariantService');

    expect(normalizeImageTransformOptions({ width: '300' })).toEqual({
      width: 300,
      height: undefined,
      format: undefined,
      quality: undefined,
      fit: 'inside'
    });
  });

  test('normalizes format aliases and preserves both dimensions', () => {
    const { normalizeImageTransformOptions } = require('../src/services/ImageVariantService');

    expect(
      normalizeImageTransformOptions({
        width: '300',
        height: '200',
        format: 'jpg',
        quality: '82'
      })
    ).toEqual({
      width: 300,
      height: 200,
      format: 'jpeg',
      quality: 82,
      fit: 'cover'
    });
  });

  test('returns no transform when width height and format are absent', () => {
    const { normalizeImageTransformOptions } = require('../src/services/ImageVariantService');

    expect(normalizeImageTransformOptions({})).toEqual(null);
  });

  test('throws on unsupported formats', () => {
    const { normalizeImageTransformOptions } = require('../src/services/ImageVariantService');

    expect(() => normalizeImageTransformOptions({ format: 'tiff' })).toThrow(
      'Unsupported image format'
    );
  });
});
