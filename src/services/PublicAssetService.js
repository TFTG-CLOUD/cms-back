function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function buildAssetUrl(pathname) {
  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    return pathname;
  }

  return `${trimTrailingSlash(baseUrl)}${pathname}`;
}

function buildProtectedFileUrl(fileId) {
  return buildAssetUrl(`/api/processed/file/${fileId}`);
}

function buildPublicFileUrl(fileId) {
  return buildAssetUrl(`/api/processed/public/file/${fileId}`);
}

function buildProtectedObjectUrl(storageKey) {
  return buildAssetUrl(`/api/processed/object?key=${encodeURIComponent(storageKey)}`);
}

function buildPublicObjectUrl(storageKey) {
  return buildAssetUrl(`/api/processed/public/object?key=${encodeURIComponent(storageKey)}`);
}

module.exports = {
  buildAssetUrl,
  buildProtectedFileUrl,
  buildPublicFileUrl,
  buildProtectedObjectUrl,
  buildPublicObjectUrl
};
