const express = require('express');

describe('upload route', () => {
  const originalEnv = process.env;

  async function createJpegBuffer(width = 8, height = 8) {
    const sharp = require('sharp');
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: '#336699'
      }
    }).jpeg().toBuffer();
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'upload-route-test-secret',
      UPLOAD_DIR: './tmp-upload-tests',
      PUBLIC_BASE_URL: 'https://assets.example.com'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns both protected and public URLs after a regular upload', async () => {
    const request = require('supertest');
    let savedFile = null;
    const imageBuffer = await createJpegBuffer();

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => {
        req.apiKey = { _id: 'env-api-key', permissions: ['upload', 'read'] };
        next();
      },
      validatePermission: () => (req, res, next) => next(),
      generateSignedUrl: () => 'signed-token',
      validateSignedUploadToken: (req, res, next) => next()
    }));

    jest.doMock('../src/models/File', () =>
      jest.fn().mockImplementation(function MockFile(data) {
        savedFile = data;
        Object.assign(this, data, {
          _id: 'file-upload-1',
          uploadDate: new Date('2026-05-11T00:00:00.000Z')
        });
        this.save = jest.fn().mockResolvedValue(this);
      })
    );

    const putFile = jest.fn().mockResolvedValue({});
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        driverName: 'local',
        putFile
      })
    }));

    const uploadRoutes = require('../src/routes/upload');
    const app = express();
    app.use('/api/upload', uploadRoutes);

    const response = await request(app)
      .post('/api/upload/file/signed-token')
      .set('X-Public-Access', 'true')
      .attach('file', imageBuffer, 'avatar.jpg');

    expect(response.status).toBe(200);
    expect(putFile).toHaveBeenCalled();
    expect(response.body.url).toBe('https://assets.example.com/api/processed/file/file-upload-1');
    expect(response.body.publicUrl).toBe('https://assets.example.com/api/processed/public/file/file-upload-1');
    expect(response.body.isPublic).toBe(true);
    expect(savedFile.uploadedBy).toBeUndefined();
  });

  test('rejects corrupted image uploads before saving metadata', async () => {
    const request = require('supertest');

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => {
        req.apiKey = { _id: 'env-api-key', permissions: ['upload', 'read'] };
        next();
      },
      validatePermission: () => (req, res, next) => next(),
      generateSignedUrl: () => 'signed-token',
      validateSignedUploadToken: (req, res, next) => next()
    }));

    const save = jest.fn();
    jest.doMock('../src/models/File', () =>
      jest.fn().mockImplementation(function MockFile(data) {
        Object.assign(this, data);
        this.save = save;
      })
    );

    const putFile = jest.fn().mockResolvedValue({});
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        driverName: 'local',
        putFile
      })
    }));

    const uploadRoutes = require('../src/routes/upload');
    const app = express();
    app.use('/api/upload', uploadRoutes);

    const response = await request(app)
      .post('/api/upload/file/signed-token')
      .attach('file', Buffer.from('not-a-real-image'), 'broken.jpg');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid or corrupted image file' });
    expect(save).not.toHaveBeenCalled();
  });

  test('does not try to send a timeout response after the request has already finished', async () => {
    const request = require('supertest');
    let capturedTimeoutHandler = null;

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => {
        req.apiKey = { _id: 'env-api-key', permissions: ['upload', 'read'] };
        next();
      },
      validatePermission: () => (req, res, next) => next(),
      generateSignedUrl: () => 'signed-token',
      validateSignedUploadToken: (req, res, next) => next()
    }));

    const uploadRoutes = require('../src/routes/upload');
    const app = express();

    app.use((req, res, next) => {
      req.socket.setTimeout = jest.fn();
      req.socket.on = jest.fn((event, handler) => {
        if (event === 'timeout') {
          capturedTimeoutHandler = handler;
        }
        return req.socket;
      });
      next();
    });

    app.use('/api/upload', uploadRoutes);

    const response = await request(app)
      .post('/api/upload/file/signed-token');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'No file uploaded' });
    expect(typeof capturedTimeoutHandler).toBe('function');
    expect(() => capturedTimeoutHandler()).not.toThrow();
  });
});
