const path = require('path');

const DEFAULT_PERMISSIONS = ['upload', 'process', 'read', 'delete'];

function resolveWorkspacePath(targetPath, fallback) {
  const value = targetPath || fallback;
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

function parsePermissions(value) {
  if (!value) {
    return DEFAULT_PERMISSIONS;
  }

  const permissions = value
    .split(',')
    .map((permission) => permission.trim())
    .filter(Boolean);

  return permissions.length > 0 ? permissions : DEFAULT_PERMISSIONS;
}

function getRuntimeConfig() {
  const localStorageRoot = resolveWorkspacePath(process.env.LOCAL_STORAGE_ROOT, '.');

  return {
    auth: {
      apiKey: process.env.API_KEY || null,
      apiSecret: process.env.API_SECRET || null,
      permissions: parsePermissions(process.env.API_PERMISSIONS)
    },
    paths: {
      uploadDir: resolveWorkspacePath(process.env.UPLOAD_DIR, './uploads'),
      processedDir: resolveWorkspacePath(process.env.PROCESSED_DIR, './public/processed'),
      chunkDir: resolveWorkspacePath(process.env.CHUNK_UPLOAD_DIR, './uploads/chunks'),
      extractedDir: resolveWorkspacePath(process.env.EXTRACTED_DIR, './extracted')
    },
    storage: {
      driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
      local: {
        rootPath: localStorageRoot
      },
      s3: {
        endpoint: process.env.S3_ENDPOINT || null,
        region: process.env.S3_REGION || 'auto',
        bucket: process.env.S3_BUCKET || '',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true').toLowerCase() === 'true'
      }
    }
  };
}

function getEnvApiKeyRecord() {
  const config = getRuntimeConfig();

  if (!config.auth.apiKey || !config.auth.apiSecret) {
    return null;
  }

  return {
    _id: 'env-api-key',
    name: 'Environment API Key',
    apiKey: config.auth.apiKey,
    permissions: config.auth.permissions,
    allowedOrigins: ['*'],
    isActive: true,
    isEnv: true
  };
}

module.exports = {
  DEFAULT_PERMISSIONS,
  getRuntimeConfig,
  getEnvApiKeyRecord
};
