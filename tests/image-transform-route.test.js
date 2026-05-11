const express = require('express');
const sharp = require('sharp');

async function createImageBuffer(width, height, format = 'jpeg') {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#336699'
    }
  })[format]().toBuffer();
}

describe('processed image delivery route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('transforms an image to a target width and format', async () => {
    const request = require('supertest');
    const imageBuffer = await createImageBuffer(600, 400);

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => next(),
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/models/File', () => ({
      findById: jest.fn().mockResolvedValue({
        _id: 'file-1',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'uploads/photo.jpg'
      })
    }));
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        driverName: 'local',
        getBuffer: jest.fn().mockImplementation(async (key) => {
          if (key === 'uploads/photo.jpg') {
            return {
              body: imageBuffer,
              contentType: 'image/jpeg'
            };
          }

          throw new Error('Not found');
        }),
        putBuffer: jest.fn().mockResolvedValue({})
      })
    }));

    const processedRoutes = require('../src/routes/processed');
    const app = express();
    app.use('/', processedRoutes);

    const response = await request(app).get('/file/file-1?width=300&format=webp');

    const metadata = await sharp(response.body).metadata();
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/webp');
    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(200);
  });

  test('keeps aspect ratio when only height is provided', async () => {
    const request = require('supertest');
    const imageBuffer = await createImageBuffer(600, 400);

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => next(),
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/models/File', () => ({
      findById: jest.fn().mockResolvedValue({
        _id: 'file-2',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'uploads/photo.jpg'
      })
    }));
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        driverName: 'local',
        getBuffer: jest.fn().mockImplementation(async (key) => {
          if (key === 'uploads/photo.jpg') {
            return {
              body: imageBuffer,
              contentType: 'image/jpeg'
            };
          }

          throw new Error('Not found');
        }),
        putBuffer: jest.fn().mockResolvedValue({})
      })
    }));

    const processedRoutes = require('../src/routes/processed');
    const app = express();
    app.use('/', processedRoutes);

    const response = await request(app).get('/file/file-2?height=200');

    const metadata = await sharp(response.body).metadata();
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(metadata.height).toBe(200);
    expect(metadata.width).toBe(300);
  });

  test('serves a public direct link without API-key middleware', async () => {
    const request = require('supertest');
    const imageBuffer = await createImageBuffer(320, 240);

    const authSpy = jest.fn((req, res, next) => next());

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: authSpy,
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/models/File', () => ({
      findById: jest.fn().mockResolvedValue({
        _id: 'file-public',
        originalName: 'public.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'uploads/public.jpg',
        isPublic: true
      })
    }));
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        driverName: 'local',
        getBuffer: jest.fn().mockResolvedValue({
          body: imageBuffer,
          contentType: 'image/jpeg'
        }),
        putBuffer: jest.fn().mockResolvedValue({})
      })
    }));

    const processedRoutes = require('../src/routes/processed');
    const app = express();
    app.use('/', processedRoutes);

    const response = await request(app).get('/public/file/file-public');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(authSpy).not.toHaveBeenCalled();
  });

  test('rejects the public route for files that were not uploaded as public', async () => {
    const request = require('supertest');
    const imageBuffer = await createImageBuffer(320, 240);

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => next(),
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/models/File', () => ({
      findById: jest.fn().mockResolvedValue({
        _id: 'file-private',
        originalName: 'private.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'uploads/private.jpg',
        isPublic: false
      })
    }));
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        driverName: 'local',
        getBuffer: jest.fn().mockResolvedValue({
          body: imageBuffer,
          contentType: 'image/jpeg'
        }),
        putBuffer: jest.fn().mockResolvedValue({})
      })
    }));

    const processedRoutes = require('../src/routes/processed');
    const app = express();
    app.use('/', processedRoutes);

    const response = await request(app).get('/public/file/file-private');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'File is not publicly accessible' });
  });

  test('ignores image transform parameters for non-image files and returns the original object', async () => {
    const request = require('supertest');
    const videoBuffer = Buffer.from('fake-video-bytes');

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => next(),
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/models/File', () => ({
      findById: jest.fn().mockResolvedValue({
        _id: 'file-video',
        originalName: 'movie.mp4',
        mimeType: 'video/mp4',
        storageKey: 'uploads/movie.mp4'
      })
    }));
    const getBuffer = jest.fn().mockResolvedValue({
      body: videoBuffer,
      contentType: 'video/mp4'
    });
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        driverName: 'local',
        getBuffer,
        putBuffer: jest.fn().mockResolvedValue({})
      })
    }));

    const processedRoutes = require('../src/routes/processed');
    const app = express();
    app.use('/', processedRoutes);

    const response = await request(app).get('/file/file-video?width=300&format=webp');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('video/mp4');
    expect(Buffer.compare(response.body, videoBuffer)).toBe(0);
    expect(getBuffer).toHaveBeenCalledTimes(1);
  });
});
