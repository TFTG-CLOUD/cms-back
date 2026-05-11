const path = require('path');

function sanitizeName(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function buildOriginalObjectKey(filename) {
  return path.posix.join('uploads', sanitizeName(filename));
}

function buildProcessedObjectKey(filename) {
  return path.posix.join('processed', sanitizeName(filename));
}

function buildArchiveObjectKey(directoryName, filename) {
  return path.posix.join('processed', 'archive', sanitizeName(directoryName), sanitizeName(filename));
}

module.exports = {
  buildOriginalObjectKey,
  buildProcessedObjectKey,
  buildArchiveObjectKey,
  sanitizeName
};
