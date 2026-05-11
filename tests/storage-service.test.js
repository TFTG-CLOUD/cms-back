const fs = require('fs').promises;
const os = require('os');
const path = require('path');

describe('storage service local driver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('stores and reads buffers through the local driver', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-local-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.LOCAL_STORAGE_ROOT = rootDir;

    const { createStorageService } = require('../src/services/storage/StorageService');
    const storage = createStorageService();

    await storage.putBuffer('uploads/example.txt', Buffer.from('hello world'), {
      contentType: 'text/plain'
    });

    const result = await storage.getBuffer('uploads/example.txt');

    expect(result.body.toString()).toBe('hello world');
    expect(result.contentType).toBe('text/plain');

    await fs.rm(rootDir, { recursive: true, force: true });
  });
});

describe('storage service s3 driver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'media-bucket',
      S3_REGION: 'auto',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_ACCESS_KEY_ID: 'access',
      S3_SECRET_ACCESS_KEY: 'secret'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('creates an S3 driver and sends put/get commands with the configured bucket', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: Buffer.from('from-s3'),
        ContentType: 'text/plain'
      });

    jest.doMock('@aws-sdk/client-s3', () => {
      class S3Client {
        constructor(config) {
          this.config = config;
        }

        send(command) {
          return send(command);
        }
      }

      class PutObjectCommand {
        constructor(input) {
          this.input = input;
        }
      }

      class GetObjectCommand {
        constructor(input) {
          this.input = input;
        }
      }

      class DeleteObjectCommand {
        constructor(input) {
          this.input = input;
        }
      }

      return {
        S3Client,
        PutObjectCommand,
        GetObjectCommand,
        DeleteObjectCommand
      };
    });

    const { createStorageService } = require('../src/services/storage/StorageService');
    const storage = createStorageService();

    await storage.putBuffer('processed/example.txt', Buffer.from('payload'), {
      contentType: 'text/plain'
    });
    const result = await storage.getBuffer('processed/example.txt');

    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'media-bucket',
      Key: 'processed/example.txt',
      ContentType: 'text/plain'
    });
    expect(send.mock.calls[1][0].input).toMatchObject({
      Bucket: 'media-bucket',
      Key: 'processed/example.txt'
    });
    expect(result.body.toString()).toBe('from-s3');
    expect(result.contentType).toBe('text/plain');
  });
});
