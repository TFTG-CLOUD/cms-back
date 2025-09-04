const express = require('express');
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { authenticateApiKey, validatePermission } = require('../middleware/auth');

const router = express.Router();

router.post('/create-key', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { name, permissions, allowedOrigins } = req.body;
    
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiSecret = crypto.randomBytes(32).toString('hex');
    
    const newKey = new ApiKey({
      name,
      apiKey,
      apiSecret,
      permissions: permissions || ['upload', 'read'],
      allowedOrigins: allowedOrigins || []
    });
    
    await newKey.save();
    
    res.json({
      id: newKey._id,
      name: newKey.name,
      apiKey: newKey.apiKey,
      apiSecret: apiSecret,
      permissions: newKey.permissions,
      allowedOrigins: newKey.allowedOrigins
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.get('/keys', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const keys = await ApiKey.find({}, { apiSecret: 0 });
    res.json(keys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

router.delete('/keys/:id', authenticateApiKey, validatePermission('delete'), async (req, res) => {
  try {
    const key = await ApiKey.findByIdAndDelete(req.params.id);
    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }
    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

module.exports = router;