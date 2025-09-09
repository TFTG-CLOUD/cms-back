const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const File = require('../models/File');
const { authenticateApiKey, validatePermission, generateSignedUrl } = require('../middleware/auth');
const {
  initializeChunkedUpload,
  handleChunkedUpload,
  getUploadStatus,
  completeChunkedUpload,
  cancelChunkedUpload
} = require('../services/ChunkedUploadManager');

const router = express.Router();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for regular uploads
  }
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB per chunk
  }
});

router.post('/generate-signed-url', authenticateApiKey, validatePermission('upload'), async (req, res) => {
  try {
    const { filename, contentType, expiresIn = 3600 } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Filename and content type are required' });
    }

    const fileId = crypto.randomBytes(16).toString('hex');
    const signedUrl = generateSignedUrl(fileId, expiresIn);

    res.json({
      uploadUrl: `/api/upload/file/${signedUrl}`,
      fileId,
      expiresIn,
      headers: {
        'Content-Type': contentType,
        'X-File-Name': filename
      }
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

router.post('/file/:signedToken', authenticateApiKey, validatePermission('upload'), upload.single('file'), async (req, res) => {
  try {
    req.socket.setTimeout(600000);
    req.socket.on('timeout', () => {
      console.log('Socket timeout occurred');
      res.status(408).send('Upload timeout');
    });
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const callbackUrl = req.headers['x-callback-url'];
    const webhookSecret = req.headers['x-webhook-secret'];
    const cmsId = req.headers['x-cms-id'];

    const file = new File({
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.apiKey._id
    });

    await file.save();

    // Send callback notification if provided
    if (callbackUrl) {
      try {
        await fetch(callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhookSecret || '',
            'X-CMS-ID': cmsId || ''
          },
          body: JSON.stringify({
            fileId: file._id,
            originalName: file.originalName,
            filename: file.filename,
            size: file.size,
            mimeType: file.mimeType,
            uploadDate: file.uploadDate,
            status: 'uploaded'
          })
        });
      } catch (error) {
        console.error('Failed to send callback:', error);
      }
    }

    res.json({
      id: file._id,
      originalName: file.originalName,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      uploadDate: file.uploadDate,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

router.get('/files', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;
    const query = {};

    if (type) {
      query.mimeType = new RegExp(type, 'i');
    }

    const files = await File.find(query)
      .sort({ uploadDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('uploadedBy', 'name');

    const total = await File.countDocuments(query);

    res.json({
      files,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

router.get('/file/:id/download', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(file.path, file.originalName);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

router.delete('/file/:id', authenticateApiKey, validatePermission('delete'), async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    await fs.unlink(file.path);
    await File.findByIdAndDelete(req.params.id);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Chunked upload endpoints for large files
router.post('/chunked/init', authenticateApiKey, validatePermission('upload'), initializeChunkedUpload);

router.post('/chunked/upload/:uploadId', authenticateApiKey, validatePermission('upload'), chunkUpload.single('chunk'), handleChunkedUpload);

router.get('/chunked/status/:uploadId', authenticateApiKey, validatePermission('read'), getUploadStatus);

router.post('/chunked/complete/:uploadId', authenticateApiKey, validatePermission('upload'), completeChunkedUpload);

router.delete('/chunked/cancel/:uploadId', authenticateApiKey, validatePermission('upload'), cancelChunkedUpload);

module.exports = router;