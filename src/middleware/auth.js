const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const ApiKey = require('../models/ApiKey');
const { getEnvApiKeyRecord } = require('../config/runtime');

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left || '', 'utf8');
  const rightBuffer = Buffer.from(right || '', 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    
    if (!apiKey || !apiSecret) {
      return res.status(401).json({ error: 'API key and secret are required' });
    }

    const envApiKey = getEnvApiKeyRecord();
    if (envApiKey && apiKey === envApiKey.apiKey) {
      if (!safeCompare(apiSecret, process.env.API_SECRET || '')) {
        return res.status(401).json({ error: 'Invalid API secret' });
      }

      req.apiKey = envApiKey;
      return next();
    }

    const key = await ApiKey.findOne({ apiKey, isActive: true });
    if (!key) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const isValidSecret = await key.compareSecret(apiSecret);
    if (!isValidSecret) {
      return res.status(401).json({ error: 'Invalid API secret' });
    }

    req.apiKey = key;
    key.lastUsed = new Date();
    await key.save();

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

const generateSignedUrl = (fileId, expiresIn = 3600) => {
  const payload = {
    fileId,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, process.env.JWT_SECRET);
};

const verifySignedUrl = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const validateSignedUploadToken = (req, res, next) => {
  const signedToken = req.params.signedToken;
  const payload = verifySignedUrl(signedToken);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired signed upload token' });
  }

  req.signedUpload = payload;
  next();
};

const validatePermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey.permissions.includes(permission)) {
      return res.status(403).json({ error: `Insufficient permissions. Required: ${permission}` });
    }
    next();
  };
};

module.exports = {
  authenticateApiKey,
  generateSignedUrl,
  verifySignedUrl,
  validateSignedUploadToken,
  validatePermission
};
