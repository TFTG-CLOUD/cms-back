const express = require('express');
const crypto = require('crypto');
const ProcessingJob = require('../models/ProcessingJob');
const File = require('../models/File');
const { authenticateApiKey, validatePermission, generateSignedUrl } = require('../middleware/auth');

const router = express.Router();

router.post('/upload-url', authenticateApiKey, validatePermission('upload'), async (req, res) => {
  try {
    const { filename, contentType, callbackUrl, webhookSecret, cmsId, processingOptions } = req.body;
    
    if (!filename || !contentType || !callbackUrl) {
      return res.status(400).json({ error: 'Filename, content type, and callback URL are required' });
    }

    const fileId = crypto.randomBytes(16).toString('hex');
    const signedUrl = generateSignedUrl(fileId, 3600);
    
    res.json({
      uploadUrl: `${req.protocol}://${req.get('host')}/api/upload/file/${signedUrl}`,
      fileId,
      callbackUrl,
      webhookSecret,
      cmsId,
      processingOptions: processingOptions || {},
      headers: {
        'Content-Type': contentType,
        'X-File-Name': filename,
        'X-Callback-Url': callbackUrl,
        'X-CMS-ID': cmsId,
        'X-Webhook-Secret': webhookSecret
      },
      archiveSupport: {
        enabled: true,
        formats: ['zip', '7z'],
        autoExtract: true,
        convertImagesToWebp: true
      }
    });
  } catch (error) {
    console.error('Error generating CMS upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

router.post('/process-file', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { fileId, processingOptions, callbackUrl, webhookSecret, cmsId } = req.body;
    
    if (!fileId || !processingOptions || !callbackUrl) {
      return res.status(400).json({ error: 'File ID, processing options, and callback URL are required' });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const job = new ProcessingJob({
      fileId,
      type: processingOptions.type,
      inputPath: file.path,
      outputPath: file.path,
      parameters: processingOptions.parameters || {},
      webhookUrl: callbackUrl,
      webhookSecret,
      cmsId
    });

    await job.save();

    const MediaProcessor = require('../services/MediaProcessor');
    const mediaProcessor = new MediaProcessor(req.app.get('socketio'));
    
    setTimeout(() => {
      switch (processingOptions.type) {
        case 'video-transcode':
          mediaProcessor.processVideo(job);
          break;
        case 'image-resize':
          mediaProcessor.processImage(job);
          break;
        case 'video-thumbnail':
          mediaProcessor.generateThumbnail(job);
          break;
        default:
          mediaProcessor.updateJobStatus(job._id, 'failed', 0, null, 'Unsupported processing type');
      }
    }, 100);

    res.json({
      jobId: job._id,
      status: 'pending',
      websocketUrl: `${req.protocol}://${req.get('host')}`,
      cmsId
    });
  } catch (error) {
    console.error('Error creating CMS processing job:', error);
    res.status(500).json({ error: 'Failed to create processing job' });
  }
});

router.get('/job-status/:jobId', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const job = await ProcessingJob.findById(req.params.jobId)
      .populate('fileId', 'originalName filename mimeType');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId: job._id,
      status: job.status,
      progress: job.progress,
      type: job.type,
      result: job.result,
      error: job.error,
      cmsId: job.cmsId,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

router.get('/processing-servers', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const servers = [
      {
        id: 'server-1',
        name: 'Primary Processing Server',
        url: `${req.protocol}://${req.get('host')}`,
        status: 'online',
        capabilities: ['video-transcode', 'audio-convert', 'image-resize', 'video-thumbnail'],
        load: 'low'
      }
    ];

    res.json(servers);
  } catch (error) {
    console.error('Error fetching processing servers:', error);
    res.status(500).json({ error: 'Failed to fetch processing servers' });
  }
});

// Batch processing endpoints for CMS
router.post('/batch-process', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { 
      name, 
      description, 
      fileIds, 
      processingOptions, 
      callbackUrl, 
      webhookSecret, 
      cmsId 
    } = req.body;

    if (!name || !fileIds || !fileIds.length || !processingOptions || !callbackUrl || !cmsId) {
      return res.status(400).json({ 
        error: 'Name, file IDs, processing options, callback URL, and CMS ID are required' 
      });
    }

    const BatchProcessor = require('../services/BatchProcessor');
    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    
    const batchJob = await batchProcessor.createBatchJob(
      name,
      description,
      cmsId,
      processingOptions,
      callbackUrl,
      webhookSecret,
      req.apiKey._id
    );

    // Add files to batch
    await batchProcessor.addFilesToBatch(batchJob._id, fileIds);

    res.json({
      batchId: batchJob._id,
      name: batchJob.name,
      cmsId: batchJob.cmsId,
      status: batchJob.status,
      totalFiles: batchJob.totalFiles,
      websocketUrl: `${req.protocol}://${req.get('host')}`,
      processingOptions: batchJob.processingOptions
    });

  } catch (error) {
    console.error('Error creating CMS batch processing job:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/batch-process/start/:batchId', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const BatchProcessor = require('../services/BatchProcessor');
    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    
    const batchJob = await batchProcessor.startBatchProcessing(req.params.batchId);
    
    // Notify all clients subscribed to this CMS
    const io = req.app.get('socketio');
    io.to(`cms-${batchJob.cmsId}`).emit('cms-batch-started', {
      batchId: batchJob._id,
      cmsId: batchJob.cmsId,
      name: batchJob.name,
      totalFiles: batchJob.totalFiles
    });

    res.json({
      batchId: batchJob._id,
      status: batchJob.status,
      startedAt: batchJob.startedAt
    });

  } catch (error) {
    console.error('Error starting CMS batch processing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active batches for CMS real-time monitoring
router.get('/active-batches/:cmsId', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const BatchProcessor = require('../services/BatchProcessor');
    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    
    const activeBatches = await batchProcessor.getActiveBatchesByCMS(req.params.cmsId);

    res.json({
      cmsId: req.params.cmsId,
      activeBatches: activeBatches.map(batch => ({
        id: batch._id,
        name: batch.name,
        status: batch.status,
        totalFiles: batch.totalFiles,
        processedFiles: batch.processedFiles,
        failedFiles: batch.failedFiles,
        progress: batch.progress,
        createdAt: batch.createdAt,
        startedAt: batch.startedAt
      }))
    });

  } catch (error) {
    console.error('Error getting CMS active batches:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get batch statistics for CMS dashboard
router.get('/batch-stats/:cmsId', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const BatchProcessor = require('../services/BatchProcessor');
    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    
    const stats = await batchProcessor.getBatchStatistics(req.params.cmsId);

    res.json({
      cmsId: req.params.cmsId,
      statistics: stats
    });

  } catch (error) {
    console.error('Error getting CMS batch statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/validate-api-key', async (req, res) => {
  try {
    const { apiKey, apiSecret } = req.body;
    
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'API key and secret are required' });
    }

    const ApiKey = require('../models/ApiKey');
    const key = await ApiKey.findOne({ apiKey, isActive: true });
    
    if (!key) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const isValidSecret = await key.compareSecret(apiSecret);
    if (!isValidSecret) {
      return res.status(401).json({ error: 'Invalid API secret' });
    }

    res.json({
      valid: true,
      permissions: key.permissions,
      allowedOrigins: key.allowedOrigins
    });
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({ error: 'Failed to validate API key' });
  }
});

module.exports = router;