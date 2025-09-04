const express = require('express');
const BatchProcessor = require('../services/BatchProcessor');
const BatchProcessingJob = require('../models/BatchProcessingJob');
const { authenticateApiKey, validatePermission } = require('../middleware/auth');

const router = express.Router();

// Create batch processing job
router.post('/batch', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { 
      name, 
      description, 
      cmsId, 
      fileIds, 
      processingOptions, 
      webhookUrl, 
      webhookSecret 
    } = req.body;

    if (!name || !cmsId || !fileIds || !fileIds.length || !processingOptions) {
      return res.status(400).json({ 
        error: 'Name, CMS ID, file IDs, and processing options are required' 
      });
    }

    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    
    const batchJob = await batchProcessor.createBatchJob(
      name,
      description,
      cmsId,
      processingOptions,
      webhookUrl,
      webhookSecret,
      req.apiKey._id
    );

    // Add files to batch
    await batchProcessor.addFilesToBatch(batchJob._id, fileIds);

    res.json({
      id: batchJob._id,
      name: batchJob.name,
      cmsId: batchJob.cmsId,
      status: batchJob.status,
      totalFiles: batchJob.totalFiles,
      processingOptions: batchJob.processingOptions,
      createdAt: batchJob.createdAt
    });

  } catch (error) {
    console.error('Error creating batch job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start batch processing
router.post('/batch/:id/start', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const batchJob = await BatchProcessor(req.app.get('socketio')).startBatchProcessing(req.params.id);
    
    // Notify all clients subscribed to this batch and CMS
    const io = req.app.get('socketio');
    io.to(`batch-${req.params.id}`).emit('batch-started', {
      batchId: req.params.id,
      status: 'processing'
    });
    
    io.to(`cms-${batchJob.cmsId}`).emit('cms-batch-started', {
      batchId: req.params.id,
      cmsId: batchJob.cmsId,
      name: batchJob.name,
      totalFiles: batchJob.totalFiles
    });

    res.json({
      id: batchJob._id,
      status: batchJob.status,
      startedAt: batchJob.startedAt
    });

  } catch (error) {
    console.error('Error starting batch processing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get batch status
router.get('/batch/:id', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    const batchStatus = await batchProcessor.getBatchStatus(req.params.id);
    
    if (!batchStatus) {
      return res.status(404).json({ error: 'Batch job not found' });
    }

    res.json(batchStatus);

  } catch (error) {
    console.error('Error getting batch status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all batches for a CMS
router.get('/batches', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { cmsId, status, page = 1, limit = 10 } = req.query;
    
    if (!cmsId) {
      return res.status(400).json({ error: 'CMS ID is required' });
    }

    const query = { cmsId };
    if (status) {
      query.status = status;
    }

    const batches = await BatchProcessingJob.find(query)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BatchProcessingJob.countDocuments(query);

    res.json({
      batches,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Error getting batches:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel batch processing
router.post('/batch/:id/cancel', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    const batchJob = await batchProcessor.cancelBatch(req.params.id);
    
    // Notify all clients
    const io = req.app.get('socketio');
    io.to(`batch-${req.params.id}`).emit('batch-cancelled', {
      batchId: req.params.id,
      status: 'cancelled'
    });
    
    io.to(`cms-${batchJob.cmsId}`).emit('cms-batch-cancelled', {
      batchId: req.params.id,
      cmsId: batchJob.cmsId
    });

    res.json({
      id: batchJob._id,
      status: batchJob.status,
      completedAt: batchJob.completedAt
    });

  } catch (error) {
    console.error('Error cancelling batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add files to existing batch
router.post('/batch/:id/files', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { fileIds } = req.body;
    
    if (!fileIds || !fileIds.length) {
      return res.status(400).json({ error: 'File IDs are required' });
    }

    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    const batchJob = await batchProcessor.addFilesToBatch(req.params.id, fileIds);

    res.json({
      id: batchJob._id,
      totalFiles: batchJob.totalFiles,
      status: batchJob.status
    });

  } catch (error) {
    console.error('Error adding files to batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get batch statistics
router.get('/batch/stats', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { cmsId } = req.query;
    
    if (!cmsId) {
      return res.status(400).json({ error: 'CMS ID is required' });
    }

    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    const stats = await batchProcessor.getBatchStatistics(cmsId);

    res.json({
      cmsId,
      statistics: stats
    });

  } catch (error) {
    console.error('Error getting batch statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active batches for real-time monitoring
router.get('/batch/active/:cmsId', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const batchProcessor = new BatchProcessor(req.app.get('socketio'));
    const activeBatches = await batchProcessor.getActiveBatchesByCMS(req.params.cmsId);

    res.json({
      cmsId: req.params.cmsId,
      activeBatches
    });

  } catch (error) {
    console.error('Error getting active batches:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;