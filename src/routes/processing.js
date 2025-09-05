const express = require('express');
const ProcessingJob = require('../models/ProcessingJob');
const File = require('../models/File');
const MediaProcessor = require('../services/MediaProcessor');
const { QueueManager } = require('../services/QueueManager');
const { authenticateApiKey, validatePermission } = require('../middleware/auth');

const router = express.Router();

router.post('/job', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { fileId, type, parameters, webhookUrl, webhookSecret, cmsId } = req.body;
    
    if (!fileId || !type) {
      return res.status(400).json({ error: 'File ID and type are required' });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Create database job record
    const job = new ProcessingJob({
      fileId,
      type,
      inputPath: file.path,
      outputPath: file.path,
      parameters: parameters || {},
      webhookUrl,
      webhookSecret,
      cmsId,
      status: 'pending' // Updated status to reflect queuing
    });

    await job.save();

    // Create queue manager and add job to queue
    const queueManager = new QueueManager();
    
    const jobData = {
      jobId: job._id,
      fileId,
      inputPath: file.path,
      outputPath: file.path,
      parameters: parameters || {},
      webhookUrl,
      webhookSecret,
      cmsId
    };

    const queueJob = await queueManager.addJob(type, jobData);
    
    // Update database job with queue info
    job.queueJobId = queueJob.id;
    job.queueName = type;
    await job.save();

    res.json({
      id: job._id,
      status: job.status,
      type: job.type,
      queueJobId: queueJob.id,
      queueName: type,
      createdAt: job.createdAt,
      message: 'Job added to processing queue'
    });
  } catch (error) {
    console.error('Error creating processing job:', error);
    res.status(500).json({ error: 'Failed to create processing job' });
  }
});

router.get('/jobs', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;

    const jobs = await ProcessingJob.find(query)
      .populate('fileId', 'originalName filename mimeType')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ProcessingJob.countDocuments(query);

    res.json({
      jobs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching processing jobs:', error);
    res.status(500).json({ error: 'Failed to fetch processing jobs' });
  }
});

router.get('/job/:id', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const job = await ProcessingJob.findById(req.params.id)
      .populate('fileId', 'originalName filename mimeType');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error fetching processing job:', error);
    res.status(500).json({ error: 'Failed to fetch processing job' });
  }
});

router.delete('/job/:id', authenticateApiKey, validatePermission('delete'), async (req, res) => {
  try {
    const job = await ProcessingJob.findByIdAndDelete(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.result && job.result.outputPath) {
      const fs = require('fs').promises;
      try {
        await fs.unlink(job.result.outputPath);
      } catch (error) {
        console.error('Error deleting processed file:', error);
      }
    }

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting processing job:', error);
    res.status(500).json({ error: 'Failed to delete processing job' });
  }
});

router.get('/job/:id/download', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const job = await ProcessingJob.findById(req.params.id);
    if (!job || job.status !== 'completed' || !job.result) {
      return res.status(404).json({ error: 'Processed file not found' });
    }

    const file = await File.findById(job.fileId);
    if (!file) {
      return res.status(404).json({ error: 'Original file not found' });
    }

    res.download(job.result.outputPath, `processed_${file.originalName}`);
  } catch (error) {
    console.error('Error downloading processed file:', error);
    res.status(500).json({ error: 'Failed to download processed file' });
  }
});

// Queue management endpoints
router.get('/queue/stats', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const queueManager = new QueueManager();
    const stats = await queueManager.getAllQueueStats();
    
    res.json({
      queue: 'all',
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting queue statistics:', error);
    res.status(500).json({ error: 'Failed to get queue statistics' });
  }
});

router.get('/queue/:queueName/stats', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { queueName } = req.params;
    const queueManager = new QueueManager();
    const stats = await queueManager.getQueueStats(queueName);
    
    res.json({
      queue: queueName,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting queue statistics:', error);
    res.status(500).json({ error: 'Failed to get queue statistics' });
  }
});

router.post('/queue/:queueName/pause', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { queueName } = req.params;
    const queueManager = new QueueManager();
    await queueManager.pauseQueue(queueName);
    
    res.json({
      queue: queueName,
      status: 'paused',
      message: `Queue ${queueName} paused successfully`
    });
  } catch (error) {
    console.error('Error pausing queue:', error);
    res.status(500).json({ error: 'Failed to pause queue' });
  }
});

router.post('/queue/:queueName/resume', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { queueName } = req.params;
    const queueManager = new QueueManager();
    await queueManager.resumeQueue(queueName);
    
    res.json({
      queue: queueName,
      status: 'resumed',
      message: `Queue ${queueName} resumed successfully`
    });
  } catch (error) {
    console.error('Error resuming queue:', error);
    res.status(500).json({ error: 'Failed to resume queue' });
  }
});

router.post('/queue/:queueName/clean', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { queueName } = req.params;
    const { type = 'completed', olderThan = 24 } = req.body;
    
    const queueManager = new QueueManager();
    const jobs = await queueManager.cleanQueue(queueName, type, olderThan * 60 * 60 * 1000);
    
    res.json({
      queue: queueName,
      type,
      jobsCleaned: jobs.length,
      message: `Cleaned ${jobs.length} ${type} jobs from ${queueName} queue`
    });
  } catch (error) {
    console.error('Error cleaning queue:', error);
    res.status(500).json({ error: 'Failed to clean queue' });
  }
});

router.post('/queue/:queueName/retry-failed', authenticateApiKey, validatePermission('process'), async (req, res) => {
  try {
    const { queueName } = req.params;
    const queueManager = new QueueManager();
    const retriedJobs = await queueManager.retryFailedJobs(queueName);
    
    res.json({
      queue: queueName,
      retriedJobs: retriedJobs.length,
      message: `Retried ${retriedJobs.length} failed jobs in ${queueName} queue`
    });
  } catch (error) {
    console.error('Error retrying failed jobs:', error);
    res.status(500).json({ error: 'Failed to retry failed jobs' });
  }
});

router.get('/queue/:queueName/job/:jobId', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const queueManager = new QueueManager();
    const jobDetails = await queueManager.getJobDetails(queueName, jobId);
    
    res.json(jobDetails);
  } catch (error) {
    console.error('Error getting job details:', error);
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

// Health check endpoint
router.get('/health', authenticateApiKey, validatePermission('read'), async (req, res) => {
  try {
    const queueManager = new QueueManager();
    const stats = await queueManager.getAllQueueStats();
    
    // Calculate overall system health
    let totalJobs = 0;
    let totalActive = 0;
    let totalFailed = 0;
    
    for (const queueStats of Object.values(stats)) {
      totalJobs += queueStats.total;
      totalActive += queueStats.active;
      totalFailed += queueStats.failed;
    }
    
    const healthStatus = {
      status: totalFailed > 10 ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      queues: stats,
      summary: {
        totalJobs,
        activeJobs: totalActive,
        failedJobs: totalFailed,
        queueCount: Object.keys(stats).length
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    };
    
    res.json(healthStatus);
  } catch (error) {
    console.error('Error getting health status:', error);
    res.status(500).json({ 
      status: 'unhealthy', 
      error: 'Failed to get health status',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;