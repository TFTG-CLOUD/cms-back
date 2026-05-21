const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

async function bodyToBuffer(body) {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

class S3StorageDriver {
  constructor(config) {
    this.driverName = 's3';
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async putBuffer(key, buffer, options = {}) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: options.contentType || 'application/octet-stream'
      })
    );

    return {
      key,
      contentType: options.contentType || 'application/octet-stream'
    };
  }

  async putFile(key, sourcePath, options = {}) {
    const buffer = await fs.readFile(sourcePath);
    return this.putBuffer(key, buffer, options);
  }

  async getBuffer(key) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );

    return {
      body: await bodyToBuffer(response.Body),
      contentType: response.ContentType || 'application/octet-stream',
      etag: response.ETag,
      lastModified: response.LastModified
    };
  }

  async deleteObject(key) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );
  }

  async materializeToFile(key) {
    const object = await this.getBuffer(key);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-storage-'));
    const targetPath = path.join(tempDir, path.basename(key));
    await fs.writeFile(targetPath, object.body);
    return targetPath;
  }
}

module.exports = S3StorageDriver;
