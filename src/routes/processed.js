const express = require('express');
const crypto = require('crypto');
const File = require('../models/File');
const { authenticateApiKey, validatePermission } = require('../middleware/auth');
const { getStorageService } = require('../services/storage/StorageService');
const {
  normalizeImageTransformOptions,
  buildVariantStorageKey,
  transformImageBuffer
} = require('../services/ImageVariantService');

const router = express.Router();
const PUBLIC_ASSET_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';
const PUBLIC_CDN_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function applyPublicCachingHeaders(req, res, object = {}) {
  const etag = object.etag || (Buffer.isBuffer(object.body)
    ? `"${crypto.createHash('sha1').update(object.body).digest('hex')}"`
    : null);
  const lastModified = object.lastModified ? new Date(object.lastModified) : null;

  res.set('Cache-Control', PUBLIC_ASSET_CACHE_CONTROL);
  res.set('CDN-Cache-Control', PUBLIC_CDN_CACHE_CONTROL);
  res.set('Cloudflare-CDN-Cache-Control', PUBLIC_CDN_CACHE_CONTROL);

  if (etag) {
    res.set('ETag', etag);
  }

  if (lastModified && !Number.isNaN(lastModified.getTime())) {
    res.set('Last-Modified', lastModified.toUTCString());
  }

  if (req.fresh) {
    res.status(304).end();
    return true;
  }

  return false;
}

async function sendStoredObject(req, res, { storageKey, fallbackContentType, isPublic = false }) {
  const storage = getStorageService();
  const transformOptions = normalizeImageTransformOptions(req.query);

  if (isPublic) {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', PUBLIC_ASSET_CACHE_CONTROL);
  }

  if (!transformOptions) {
    const object = await storage.getBuffer(storageKey);
    if (isPublic && applyPublicCachingHeaders(req, res, object)) {
      return;
    }
    res.type(object.contentType || fallbackContentType || 'application/octet-stream');
    res.send(object.body);
    return;
  }

  const original = await storage.getBuffer(storageKey);
  const originalContentType = original.contentType || fallbackContentType || 'application/octet-stream';

  if (!originalContentType.startsWith('image/')) {
    if (isPublic && applyPublicCachingHeaders(req, res, original)) {
      return;
    }
    res.type(originalContentType);
    res.set('X-Transform-Ignored', 'true');
    res.send(original.body);
    return;
  }

  const variantKey = buildVariantStorageKey(storageKey, transformOptions);

  try {
    const cachedVariant = await storage.getBuffer(variantKey);
    if (isPublic && applyPublicCachingHeaders(req, res, cachedVariant)) {
      return;
    }
    res.type(cachedVariant.contentType || originalContentType);
    res.set('Cache-Control', PUBLIC_ASSET_CACHE_CONTROL);
    res.send(cachedVariant.body);
    return;
  } catch (error) {
    // Cache miss: generate the variant below.
  }

  const transformed = await transformImageBuffer(
    original.body,
    transformOptions,
    originalContentType
  );

  await storage.putBuffer(variantKey, transformed.body, {
    contentType: transformed.contentType
  });

  const responseObject = {
    body: transformed.body,
    contentType: transformed.contentType,
    lastModified: new Date()
  };
  if (isPublic && applyPublicCachingHeaders(req, res, responseObject)) {
    return;
  }
  res.type(transformed.contentType);
  res.set('Cache-Control', PUBLIC_ASSET_CACHE_CONTROL);
  res.send(transformed.body);
}

async function sendFileById(req, res, options = {}) {
  const file = await File.findById(req.params.id);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (options.requirePublic && !file.isPublic) {
    return res.status(403).json({ error: 'File is not publicly accessible' });
  }

  await sendStoredObject(req, res, {
    storageKey: file.storageKey || file.path,
    fallbackContentType: file.mimeType,
    isPublic: !!options.requirePublic
  });
}

router.get('/file/:id', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    await sendFileById(req, res);
  } catch (error) {
    console.error('Error serving stored file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

router.get('/public/file/:id', async (req, res) => {
  try {
    await sendFileById(req, res, { requirePublic: true });
  } catch (error) {
    console.error('Error serving public stored file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

router.get('/object', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { key, contentType } = req.query;
    if (!key) {
      return res.status(400).json({ error: 'Object key is required' });
    }

    await sendStoredObject(req, res, {
      storageKey: key,
      fallbackContentType: contentType
    });
  } catch (error) {
    console.error('Error serving stored object:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

module.exports = router;
