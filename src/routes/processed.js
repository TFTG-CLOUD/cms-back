const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { authenticateApiKey, validatePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/api/processed/:filename', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), 'public', 'processed', filename);
    
    try {
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch (error) {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('Error serving processed file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

module.exports = router;