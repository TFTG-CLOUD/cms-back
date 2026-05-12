const express = require('express');

describe('processing route storage integration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function buildApp() {
    const processingRoutes = require('../src/routes/processing');
    const app = express();
    app.use(express.json());
    app.use('/api/processing', processingRoutes);
    return app;
  }

  test('deletes processed output through the configured storage service', async () => {
    const request = require('supertest');
    const deleteObject = jest.fn().mockResolvedValue();

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => next(),
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/services/QueueManager', () => ({
      QueueManager: class MockQueueManager {}
    }));
    jest.doMock('../src/models/ProcessingJob', () => ({
      findByIdAndDelete: jest.fn().mockResolvedValue({
        _id: 'job-1',
        result: { outputPath: 'processed/output.mp4' }
      })
    }));
    jest.doMock('../src/services/storage/StorageService', () => ({
      getStorageService: () => ({
        deleteObject
      })
    }));

    const app = buildApp();
    const response = await request(app).delete('/api/processing/job/job-1');

    expect(response.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith('processed/output.mp4');
  });
});
