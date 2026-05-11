function isTruthyHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.some(isTruthyHeaderValue);
  }

  if (value === undefined || value === null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'public', 'on'].includes(normalized);
}

function isPublicUploadRequest(headers = {}) {
  return isTruthyHeaderValue(headers['x-public-access']) || isTruthyHeaderValue(headers['x-public']);
}

module.exports = {
  isPublicUploadRequest
};
