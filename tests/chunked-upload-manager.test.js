describe('chunked upload manager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'chunked-upload-test-secret'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('initialization returns the chunked upload endpoint used by the router', async () => {
    const { ChunkedUploadManager } = require('../src/services/ChunkedUploadManager');
    const manager = new ChunkedUploadManager('./tmp/chunk-tests', 1024, 1000);

    const result = await manager.initializeUpload({
      filename: 'video.mp4',
      fileSize: 4096,
      contentType: 'video/mp4'
    });

    expect(result.uploadUrl).toBe(`/api/upload/chunked/upload/${result.uploadId}`);
  });

  test('handler accepts chunk index zero', async () => {
    const chunked = require('../src/services/ChunkedUploadManager');
    const uploadSpy = jest
      .spyOn(chunked.uploadManager, 'uploadChunk')
      .mockResolvedValue({ status: 'initialized' });

    const req = {
      params: { uploadId: 'upload-1' },
      body: { chunkIndex: 0 },
      file: { buffer: Buffer.from('chunk') }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await chunked.handleChunkedUpload(req, res);

    expect(uploadSpy).toHaveBeenCalledWith('upload-1', 0, req.file.buffer);
    expect(res.status).not.toHaveBeenCalled();
    uploadSpy.mockRestore();
  });

  test('completeUpload persists the assembled file through the storage service', async () => {
    const fs = require('fs').promises;
    const os = require('os');
    const path = require('path');

    const chunkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chunked-complete-'));
    const uploadDir = path.join(chunkRoot, 'chunks');
    const storage = {
      driverName: 's3',
      putFile: jest.fn().mockResolvedValue({})
    };

    jest.doMock('../src/models/File', () =>
      jest.fn().mockImplementation(function MockFile(data) {
        Object.assign(this, data, {
          _id: 'file-1',
          uploadDate: new Date('2026-05-11T00:00:00.000Z')
        });
        this.save = jest.fn().mockResolvedValue(this);
      })
    );

    const { ChunkedUploadManager } = require('../src/services/ChunkedUploadManager');
    const manager = new ChunkedUploadManager(uploadDir, 4, 1000, storage);

    const { uploadId } = await manager.initializeUpload({
      filename: 'photo.png',
      fileSize: 5,
      contentType: 'image/png'
    });

    await manager.uploadChunk(uploadId, 0, Buffer.from('hell'));
    await manager.uploadChunk(uploadId, 1, Buffer.from('o'));

    const status = await manager.getUploadStatus(uploadId);

    expect(storage.putFile).toHaveBeenCalled();
    expect(status.fileId).toBe('file-1');
    expect(status.url).toBe('/api/processed/file/file-1');
  });

  test('completeUpload is idempotent after the upload has already been finalized', async () => {
    const fs = require('fs').promises;
    const os = require('os');
    const path = require('path');

    const chunkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chunked-idempotent-'));
    const uploadDir = path.join(chunkRoot, 'chunks');
    const storage = {
      driverName: 's3',
      putFile: jest.fn().mockResolvedValue({})
    };

    jest.doMock('../src/models/File', () =>
      jest.fn().mockImplementation(function MockFile(data) {
        Object.assign(this, data, {
          _id: 'file-2',
          uploadDate: new Date('2026-05-11T00:00:00.000Z')
        });
        this.save = jest.fn().mockResolvedValue(this);
      })
    );

    const { ChunkedUploadManager } = require('../src/services/ChunkedUploadManager');
    const manager = new ChunkedUploadManager(uploadDir, 4, 1000, storage);

    const { uploadId } = await manager.initializeUpload({
      filename: 'photo.png',
      fileSize: 5,
      contentType: 'image/png'
    });

    await manager.uploadChunk(uploadId, 0, Buffer.from('hell'));
    await manager.uploadChunk(uploadId, 1, Buffer.from('o'));
    const secondComplete = await manager.completeUpload(uploadId);

    expect(storage.putFile).toHaveBeenCalledTimes(1);
    expect(secondComplete.fileId).toBe('file-2');
    expect(secondComplete.status).toBe('completed');
    expect(secondComplete.url).toBe('/api/processed/file/file-2');
  });

  test('cleanupExpiredSessions removes chunk files from disk', async () => {
    const fs = require('fs').promises;
    const os = require('os');
    const path = require('path');

    const chunkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chunked-expired-'));
    const uploadDir = path.join(chunkRoot, 'chunks');
    const storage = {
      driverName: 'local',
      putFile: jest.fn()
    };

    const { ChunkedUploadManager } = require('../src/services/ChunkedUploadManager');
    const manager = new ChunkedUploadManager(uploadDir, 4, 1000, storage);

    const { uploadId } = await manager.initializeUpload({
      filename: 'photo.png',
      fileSize: 8,
      contentType: 'image/png'
    });

    await manager.uploadChunk(uploadId, 0, Buffer.from('hell'));
    const uploadPath = manager.activeUploads.get(uploadId).uploadPath;
    manager.activeUploads.get(uploadId).expiresAt = new Date(Date.now() - 1000);

    await manager.cleanupExpiredSessions();

    await expect(fs.access(uploadPath)).rejects.toThrow();
    expect(manager.activeUploads.has(uploadId)).toBe(false);
  });
});

describe('signed upload validation middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'signed-upload-test-secret'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('accepts a valid signed upload token', () => {
    const {
      generateSignedUrl,
      validateSignedUploadToken
    } = require('../src/middleware/auth');
    const token = generateSignedUrl('file-123', 60);

    const req = { params: { signedToken: token } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    validateSignedUploadToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.signedUpload).toMatchObject({ fileId: 'file-123' });
  });

  test('rejects an invalid signed upload token', () => {
    const { validateSignedUploadToken } = require('../src/middleware/auth');

    const req = { params: { signedToken: 'bad-token' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    validateSignedUploadToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired signed upload token' });
  });
});
