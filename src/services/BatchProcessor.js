const BatchProcessingJob = require('../models/BatchProcessingJob');
const ProcessingJob = require('../models/ProcessingJob');
const MediaProcessor = require('./MediaProcessor');

class BatchProcessor {
  constructor(io) {
    this.io = io;
    this.mediaProcessor = new MediaProcessor(io);
    this.activeBatches = new Map();
  }

  async createBatchJob(name, description, cmsId, processingOptions, webhookUrl, webhookSecret, createdBy) {
    const batchJob = new BatchProcessingJob({
      name,
      description,
      cmsId,
      processingOptions,
      webhookUrl,
      webhookSecret,
      createdBy,
      status: 'pending',
      totalFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
      progress: 0
    });

    await batchJob.save();
    this.activeBatches.set(batchJob._id.toString(), batchJob);

    return batchJob;
  }

  async addFilesToBatch(batchId, fileIds) {
    const batchJob = await BatchProcessingJob.findById(batchId);
    if (!batchJob) {
      throw new Error('Batch job not found');
    }

    if (batchJob.status !== 'pending') {
      throw new Error('Cannot add files to a batch that has already started processing');
    }

    fileIds.forEach(fileId => {
      batchJob.addFile(fileId);
    });

    await batchJob.save();
    return batchJob;
  }

  async startBatchProcessing(batchId) {
    const batchJob = await BatchProcessingJob.findById(batchId);
    if (!batchJob) {
      throw new Error('Batch job not found');
    }

    if (batchJob.status !== 'pending') {
      throw new Error('Batch job is already processing or completed');
    }

    batchJob.status = 'processing';
    batchJob.startedAt = new Date();
    await batchJob.save();

    this.activeBatches.set(batchId, batchJob);

    // Process files sequentially or in parallel
    await this.processBatchFiles(batchJob);

    return batchJob;
  }

  async processBatchFiles(batchJob) {
    const { files, processingOptions, webhookUrl, webhookSecret, cmsId } = batchJob;
    
    // Process files with concurrency control
    const concurrency = Math.min(3, files.length); // Process up to 3 files at once
    const chunks = this.chunkArray(files, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(file => this.processSingleFile(batchJob, file));
      await Promise.all(promises);
    }

    // Send batch completion webhook
    if (webhookUrl) {
      await this.sendBatchWebhook(batchJob);
    }
  }

  async processSingleFile(batchJob, file) {
    try {
      // Update file status to processing
      batchJob.updateFileStatus(file.fileId, 'processing', 0);
      await batchJob.save();
      
      // Send individual file progress update
      this.io.to(`batch-${batchJob._id}`).emit('batch-progress', {
        batchId: batchJob._id,
        fileId: file.fileId,
        status: 'processing',
        progress: 0
      });

      // Create individual processing job
      const processingJob = new ProcessingJob({
        fileId: file.fileId,
        type: batchJob.processingOptions.type,
        inputPath: '', // Will be populated from File model
        outputPath: '',
        parameters: batchJob.processingOptions.parameters,
        webhookUrl: batchJob.webhookUrl,
        webhookSecret: batchJob.webhookSecret,
        cmsId: batchJob.cmsId
      });

      await processingJob.save();

      // Store processing job ID in batch
      file.processingJobId = processingJob._id;
      await batchJob.save();

      // Set up progress monitoring for this file
      this.monitorFileProgress(batchJob, file.fileId, processingJob._id);

      // Start processing
      await this.mediaProcessor.processVideo(processingJob);

    } catch (error) {
      console.error('Error processing file:', error);
      
      // Update file status to failed
      batchJob.updateFileStatus(file.fileId, 'failed', 0, null, {
        message: error.message,
        code: 'PROCESSING_ERROR'
      });
      await batchJob.save();

      // Send error update
      this.io.to(`batch-${batchJob._id}`).emit('batch-progress', {
        batchId: batchJob._id,
        fileId: file.fileId,
        status: 'failed',
        progress: 0,
        error: error.message
      });
    }
  }

  monitorFileProgress(batchJob, fileId, processingJobId) {
    const progressHandler = (data) => {
      if (data.jobId.toString() === processingJobId.toString()) {
        // Update file progress in batch
        batchJob.updateFileStatus(fileId, data.status, data.progress, data.result, data.error);
        batchJob.save();

        // Send batch progress update
        this.io.to(`batch-${batchJob._id}`).emit('batch-progress', {
          batchId: batchJob._id,
          fileId,
          status: data.status,
          progress: data.progress,
          result: data.result,
          error: data.error
        });

        // Clean up listener when file is complete
        if (data.status === 'completed' || data.status === 'failed') {
          this.io.off('job-progress', progressHandler);
        }
      }
    };

    this.io.on('job-progress', progressHandler);
  }

  async getBatchStatus(batchId) {
    const batchJob = await BatchProcessingJob.findById(batchId)
      .populate('files.fileId', 'originalName filename mimeType size')
      .populate('createdBy', 'name');

    if (!batchJob) {
      return null;
    }

    return {
      id: batchJob._id,
      name: batchJob.name,
      description: batchJob.description,
      cmsId: batchJob.cmsId,
      status: batchJob.status,
      totalFiles: batchJob.totalFiles,
      processedFiles: batchJob.processedFiles,
      failedFiles: batchJob.failedFiles,
      progress: batchJob.progress,
      files: batchJob.files,
      processingOptions: batchJob.processingOptions,
      createdAt: batchJob.createdAt,
      startedAt: batchJob.startedAt,
      completedAt: batchJob.completedAt
    };
  }

  async cancelBatch(batchId) {
    const batchJob = await BatchProcessingJob.findById(batchId);
    if (!batchJob) {
      throw new Error('Batch job not found');
    }

    if (batchJob.status === 'completed' || batchJob.status === 'failed') {
      throw new Error('Cannot cancel a completed batch');
    }

    batchJob.status = 'cancelled';
    batchJob.completedAt = new Date();
    await batchJob.save();

    // Cancel individual processing jobs
    for (const file of batchJob.files) {
      if (file.processingJobId && file.status === 'processing') {
        // Note: You might want to implement job cancellation in MediaProcessor
        try {
          await ProcessingJob.findByIdAndUpdate(file.processingJobId, { 
            status: 'cancelled',
            completedAt: new Date()
          });
        } catch (error) {
          console.error('Error cancelling processing job:', error);
        }
      }
    }

    this.activeBatches.delete(batchId);

    // Send cancellation notification
    this.io.to(`batch-${batchId}`).emit('batch-cancelled', {
      batchId: batchJob._id,
      status: 'cancelled'
    });

    return batchJob;
  }

  async sendBatchWebhook(batchJob) {
    try {
      const payload = {
        batchId: batchJob._id,
        name: batchJob.name,
        cmsId: batchJob.cmsId,
        status: batchJob.status,
        totalFiles: batchJob.totalFiles,
        processedFiles: batchJob.processedFiles,
        failedFiles: batchJob.failedFiles,
        progress: batchJob.progress,
        files: batchJob.files.map(f => ({
          fileId: f.fileId,
          status: f.status,
          progress: f.progress,
          result: f.result,
          error: f.error
        })),
        processingOptions: batchJob.processingOptions,
        createdAt: batchJob.createdAt,
        completedAt: batchJob.completedAt
      };

      const headers = {
        'Content-Type': 'application/json'
      };

      if (batchJob.webhookSecret) {
        headers['X-Webhook-Secret'] = batchJob.webhookSecret;
      }

      const axios = require('axios');
      await axios.post(batchJob.webhookUrl, payload, { headers });
    } catch (error) {
      console.error('Error sending batch webhook:', error);
    }
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Get all active batches for a CMS
  async getActiveBatchesByCMS(cmsId) {
    return await BatchProcessingJob.find({
      cmsId,
      status: { $in: ['pending', 'processing'] }
    }).sort({ createdAt: -1 });
  }

  // Get batch statistics
  async getBatchStatistics(cmsId) {
    const stats = await BatchProcessingJob.aggregate([
      { $match: { cmsId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalFiles: { $sum: '$totalFiles' },
          processedFiles: { $sum: '$processedFiles' },
          failedFiles: { $sum: '$failedFiles' }
        }
      }
    ]);

    return stats;
  }
}

module.exports = BatchProcessor;