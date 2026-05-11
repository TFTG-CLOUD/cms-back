const crypto = require('crypto');
const sharp = require('sharp');

const SUPPORTED_FORMATS = new Map([
  ['jpg', 'jpeg'],
  ['jpeg', 'jpeg'],
  ['png', 'png'],
  ['webp', 'webp'],
  ['avif', 'avif'],
  ['gif', 'gif']
]);

function parsePositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return parsed;
}

function normalizeFormat(value) {
  if (!value) {
    return undefined;
  }

  const normalized = SUPPORTED_FORMATS.get(String(value).toLowerCase());
  if (!normalized) {
    throw new Error('Unsupported image format');
  }

  return normalized;
}

function normalizeImageTransformOptions(query = {}) {
  const width = parsePositiveInteger(query.width, 'width');
  const height = parsePositiveInteger(query.height, 'height');
  const quality = parsePositiveInteger(query.quality, 'quality');
  const format = normalizeFormat(query.format);

  if (!width && !height && !format && !quality) {
    return null;
  }

  return {
    width,
    height,
    format,
    quality,
    fit: width && height ? 'cover' : 'inside'
  };
}

function detectContentType(format, fallback = 'application/octet-stream') {
  if (!format) {
    return fallback;
  }

  const contentTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4'
  };

  return contentTypes[format] || fallback;
}

function buildVariantStorageKey(sourceKey, options) {
  const payload = JSON.stringify({
    sourceKey,
    width: options.width,
    height: options.height,
    format: options.format,
    quality: options.quality,
    fit: options.fit
  });
  const hash = crypto.createHash('sha1').update(payload).digest('hex');
  const ext = options.format || sourceKey.split('.').pop() || 'img';
  return `variants/${hash}.${ext}`;
}

async function transformImageBuffer(inputBuffer, options, fallbackContentType = 'image/jpeg') {
  let pipeline = sharp(inputBuffer);

  if (options.width || options.height) {
    pipeline = pipeline.resize(options.width, options.height, {
      fit: options.fit
    });
  }

  if (options.format === 'png') {
    pipeline = pipeline.png();
  } else if (options.format === 'webp') {
    pipeline = pipeline.webp({ quality: options.quality || 80 });
  } else if (options.format === 'avif') {
    pipeline = pipeline.avif({ quality: options.quality || 80 });
  } else if (options.format === 'gif') {
    pipeline = pipeline.gif();
  } else {
    pipeline = pipeline.jpeg({ quality: options.quality || 80 });
  }

  const body = await pipeline.toBuffer();
  const format = options.format || 'jpeg';

  return {
    body,
    contentType: detectContentType(format, fallbackContentType),
    storageKey: buildVariantStorageKey('inline', options)
  };
}

module.exports = {
  normalizeImageTransformOptions,
  normalizeFormat,
  detectContentType,
  buildVariantStorageKey,
  transformImageBuffer
};
