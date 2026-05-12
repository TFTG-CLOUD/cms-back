const express = require('express');

describe('batch route', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function buildApp() {
    const batchRoutes = require('../src/routes/batch');
    const app = express();
    app.use(express.json());
    app.set('socketio', {
      to: jest.fn().mockReturnValue({ emit: jest.fn() })
    });
    app.use('/api/batch', batchRoutes);
    return app;
  }

  test('starts a batch through a BatchProcessor instance', async () => {
    const request = require('supertest');
    const startBatchProcessing = jest.fn().mockResolvedValue({
      _id: 'batch-1',
      cmsId: 'cms-1',
      name: 'Batch',
      totalFiles: 2,
      status: 'processing',
      startedAt: new Date('2026-05-12T00:00:00.000Z')
    });

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => next(),
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/services/BatchProcessor', () =>
      class MockBatchProcessor {
        startBatchProcessing = startBatchProcessing;
      }
    );

    const app = buildApp();
    const response = await request(app).post('/api/batch/batch-1/start');

    expect(response.status).toBe(200);
    expect(startBatchProcessing).toHaveBeenCalledWith('batch-1');
    expect(response.body.status).toBe('processing');
  });

  test('stats route is not captured by the dynamic batch id route', async () => {
    const request = require('supertest');
    const getBatchStatistics = jest.fn().mockResolvedValue([
      { _id: 'completed', count: 3 }
    ]);
    const getBatchStatus = jest.fn();

    jest.doMock('../src/middleware/auth', () => ({
      authenticateApiKey: (req, res, next) => next(),
      validatePermission: () => (req, res, next) => next()
    }));
    jest.doMock('../src/services/BatchProcessor', () =>
      class MockBatchProcessor {
        getBatchStatistics = getBatchStatistics;
        getBatchStatus = getBatchStatus;
      }
    );

    const app = buildApp();
    const response = await request(app).get('/api/batch/stats?cmsId=cms-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      cmsId: 'cms-1',
      statistics: [{ _id: 'completed', count: 3 }]
    });
    expect(getBatchStatistics).toHaveBeenCalledWith('cms-1');
    expect(getBatchStatus).not.toHaveBeenCalled();
  });
});
