const crypto = require('crypto');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

class LocalStorageDriver {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.driverName = 'local';
  }

  resolvePath(key) {
    return path.join(this.rootPath, key);
  }

  async putBuffer(key, buffer, options = {}) {
    const targetPath = this.resolvePath(key);
    await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
    await fsPromises.writeFile(targetPath, buffer);

    return {
      key,
      contentType: options.contentType,
      path: targetPath
    };
  }

  async putFile(key, sourcePath, options = {}) {
    const targetPath = this.resolvePath(key);
    if (path.resolve(sourcePath) === path.resolve(targetPath)) {
      return {
        key,
        contentType: options.contentType,
        path: targetPath
      };
    }

    await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
    await fsPromises.copyFile(sourcePath, targetPath);

    return {
      key,
      contentType: options.contentType,
      path: targetPath
    };
  }

  async getBuffer(key) {
    const targetPath = this.resolvePath(key);
    const body = await fsPromises.readFile(targetPath);
    const stats = await fsPromises.stat(targetPath);

    return {
      body,
      contentType: this.guessContentType(targetPath),
      etag: `"${crypto.createHash('sha1').update(body).digest('hex')}"`,
      lastModified: stats.mtime
    };
  }

  async deleteObject(key) {
    await fsPromises.rm(this.resolvePath(key), { force: true });
  }

  async materializeToFile(key) {
    return this.resolvePath(key);
  }

  guessContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip',
      '.7z': 'application/x-7z-compressed'
    };

    return contentTypes[ext] || 'application/octet-stream';
  }
}

module.exports = LocalStorageDriver;
