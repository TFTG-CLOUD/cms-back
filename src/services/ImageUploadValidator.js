const sharp = require('sharp');

const IMAGE_MIME_PREFIX = 'image/';

async function validateImageBuffer(buffer, mimeType, runtimeConfig = {}) {
  if (!mimeType || !mimeType.startsWith(IMAGE_MIME_PREFIX)) {
    return null;
  }

  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'warning' }).metadata();
  } catch (error) {
    throw new Error('Invalid or corrupted image file');
  }

  if (!metadata || !metadata.width || !metadata.height) {
    throw new Error('Invalid or corrupted image file');
  }

  const maxPixels = runtimeConfig.imageValidation?.maxPixels || 10000 * 10000;
  if (metadata.width * metadata.height > maxPixels) {
    throw new Error('Image dimensions exceed allowed limits');
  }

  return metadata;
}

module.exports = {
  validateImageBuffer
};
