const express = require('express');

describe('upload route', () => {
  const originalEnv = process.env;

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
      .attach('file', Buffer.from('small-image'), 'avatar.jpg');

    expect(response.status).toBe(200);
    expect(putFile).toHaveBeenCalled();
    expect(response.body.url).toBe('https://assets.example.com/api/processed/file/file-upload-1');
    expect(response.body.publicUrl).toBe('https://assets.example.com/api/processed/public/file/file-upload-1');
    expect(response.body.isPublic).toBe(true);
    expect(savedFile.uploadedBy).toBeUndefined();
  });
});
