const throng = require('throng');
const Queue = require('bull');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import processing services
const MediaProcessor = require('./services/MediaProcessor');
const BatchProcessor = require('./services/BatchProcessor');
const { queues, redisConnection } = require('./services/QueueManager');
const ProcessingJob = require('./models/ProcessingJob');

// Worker configuration
const WORKERS = parseInt(process.env.WORKER_COUNT) || 2;
const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY) || 3;

// Start workers
throng({
  workers: WORKERS,
  lifetime: Infinity,
  start: startWorker
});

async function startWorker(id) {
  console.log(`Worker ${id} started with concurrency ${CONCURRENCY}`);
  
  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/media_processing');
    console.log(`Worker ${id} connected to MongoDB`);
  } catch (error) {
    console.error(`Worker ${id} failed to connect to MongoDB:`, error);
    process.exit(1);
  }
  
  // Create Socket.IO instance for progress updates
  const io = require('socket.io-client')(process.env.SERVER_URL || 'http://localhost:3000');
  
  // Create processors
  const mediaProcessor = new MediaProcessor(null); // Will set IO context per job
  const batchProcessor = new BatchProcessor(null);

  // Set up Socket.IO connection for progress updates
  io.on('connect', () => {
    console.log(`Worker ${id} connected to server`);
  });

  io.on('disconnect', () => {
    console.log(`Worker ${id} disconnected from server`);
  });

  // Process video transcoding jobs
  queues.videoTranscoding.process('video-transcode', CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing video transcoding job ${job.id} (${job.name})`);
    
    try {
      // Update job status to processing
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'processing',
        startedAt: new Date(),
        progress: 0
      });
      
      // Set up progress monitoring for this job
      const progressCallback = async (progress, status) => {
        job.progress(progress);
        
        // Update database job progress
        await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
          progress: progress,
          status: status === 'completed' ? 'completed' : 'processing'
        });
        
        // Send progress update via Socket.IO
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      // Process the video
      const result = await processVideoWithProgress(job.data, progressCallback);
      
      // Update job status to completed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'completed',
        progress: 100,
        result: result,
        completedAt: new Date()
      });
      
      console.log(`Worker ${id} completed video transcoding job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed video transcoding job ${job.id}:`, error);
      
      // Update job status to failed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'failed',
        error: {
          message: error.message,
          stack: error.stack
        },
        completedAt: new Date()
      });
      
      // Send error update via Socket.IO
      io.emit('job-progress', {
        jobId: job.data.jobId,
        progress: 0,
        status: 'failed',
        error: error.message
      });
      
      throw error;
    }
  });

  // Process audio conversion jobs
  queues.audioProcessing.process('audio-convert', CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing audio job ${job.id}`);
    
    try {
      // Update job status to processing
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'processing',
        startedAt: new Date(),
        progress: 0
      });
      
      const progressCallback = async (progress, status) => {
        job.progress(progress);
        
        // Update database job progress
        await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
          progress: progress,
          status: status === 'completed' ? 'completed' : 'processing'
        });
        
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      const result = await processAudioWithProgress(job.data, progressCallback);
      
      // Update job status to completed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'completed',
        progress: 100,
        result: result,
        completedAt: new Date()
      });
      
      console.log(`Worker ${id} completed audio job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed audio job ${job.id}:`, error);
      
      // Update job status to failed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'failed',
        error: {
          message: error.message,
          stack: error.stack
        },
        completedAt: new Date()
      });
      
      io.emit('job-progress', {
        jobId: job.data.jobId,
        progress: 0,
        status: 'failed',
        error: error.message
      });
      
      throw error;
    }
  });

  // Process image jobs
  queues.imageProcessing.process('image-resize', CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing image job ${job.id}`);
    
    try {
      // Update job status to processing
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'processing',
        startedAt: new Date(),
        progress: 0
      });
      
      const progressCallback = async (progress, status) => {
        job.progress(progress);
        
        // Update database job progress
        await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
          progress: progress,
          status: status === 'completed' ? 'completed' : 'processing'
        });
        
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      const result = await processImageWithProgress(job.data, progressCallback);
      
      // Update job status to completed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'completed',
        progress: 100,
        result: result,
        completedAt: new Date()
      });
      
      console.log(`Worker ${id} completed image job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed image job ${job.id}:`, error);
      
      // Update job status to failed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'failed',
        error: {
          message: error.message,
          stack: error.stack
        },
        completedAt: new Date()
      });
      
      io.emit('job-progress', {
        jobId: job.data.jobId,
        progress: 0,
        status: 'failed',
        error: error.message
      });
      
      throw error;
    }
  });

  // Process thumbnail jobs
  queues.thumbnailGeneration.process('video-thumbnail', CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing thumbnail job ${job.id}`);
    
    try {
      // Update job status to processing
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'processing',
        startedAt: new Date(),
        progress: 0
      });
      
      const progressCallback = async (progress, status) => {
        job.progress(progress);
        
        // Update database job progress
        await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
          progress: progress,
          status: status === 'completed' ? 'completed' : 'processing'
        });
        
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      const result = await processThumbnailWithProgress(job.data, progressCallback);
      
      // Update job status to completed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'completed',
        progress: 100,
        result: result,
        completedAt: new Date()
      });
      
      console.log(`Worker ${id} completed thumbnail job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed thumbnail job ${job.id}:`, error);
      
      // Update job status to failed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'failed',
        error: {
          message: error.message,
          stack: error.stack
        },
        completedAt: new Date()
      });
      
      io.emit('job-progress', {
        jobId: job.data.jobId,
        progress: 0,
        status: 'failed',
        error: error.message
      });
      
      throw error;
    }
  });

  // Process batch jobs
  queues.batchProcessing.process(1, async (job) => { // Batch jobs run one at a time
    console.log(`Worker ${id} processing batch job ${job.id}`);
    
    try {
      const result = await processBatchJob(job.data, io);
      
      console.log(`Worker ${id} completed batch job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed batch job ${job.id}:`, error);
      throw error;
    }
  });

  // Process archive jobs
  queues.archiveProcessing.process('archive-process', CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing archive job ${job.id}`);
    
    try {
      // Update job status to processing
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'processing',
        startedAt: new Date(),
        progress: 0
      });
      
      const progressCallback = async (progress, status) => {
        job.progress(progress);
        
        // Update database job progress
        await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
          progress: progress,
          status: status === 'completed' ? 'completed' : 'processing'
        });
        
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      const result = await processArchiveWithProgress(job.data, progressCallback);
      
      // Update job status to completed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'completed',
        progress: 100,
        result: result,
        completedAt: new Date()
      });
      
      console.log(`Worker ${id} completed archive job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed archive job ${job.id}:`, error);
      
      // Update job status to failed
      await ProcessingJob.findByIdAndUpdate(job.data.jobId, {
        status: 'failed',
        error: {
          message: error.message,
          stack: error.stack
        },
        completedAt: new Date()
      });
      
      io.emit('job-progress', {
        jobId: job.data.jobId,
        progress: 0,
        status: 'failed',
        error: error.message
      });
      
      throw error;
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log(`Worker ${id} received SIGTERM, shutting down gracefully`);
    await shutdownWorker();
  });

  process.on('SIGINT', async () => {
    console.log(`Worker ${id} received SIGINT, shutting down gracefully`);
    await shutdownWorker();
  });
}

// Processing functions with progress callbacks
async function processVideoWithProgress(data, progressCallback) {
  const { jobId, inputPath, outputPath, parameters } = data;
  
  try {
    progressCallback(0, 'processing');
    
    // Create MediaProcessor instance
    const MediaProcessor = require('./services/MediaProcessor');
    const mediaProcessor = new MediaProcessor();
    
    // Create job object for MediaProcessor
    const job = {
      _id: jobId,
      inputPath,
      outputPath,
      parameters
    };
    
    // Process video using MediaProcessor
    const result = await new Promise((resolve, reject) => {
      // Override the updateJobStatus method to use our progressCallback
      mediaProcessor.updateJobStatus = async (jobId, status, progress, result = null, error = null) => {
        progressCallback(progress, status);
        
        if (status === 'completed') {
          resolve(result);
        } else if (status === 'failed') {
          reject(new Error(error));
        }
      };
      
      // Process the video
      mediaProcessor.processVideo(job).catch(reject);
    });
    
    progressCallback(100, 'completed');
    return result;
    
  } catch (error) {
    progressCallback(0, 'failed');
    throw error;
  }
}

async function processAudioWithProgress(data, progressCallback) {
  const { jobId, inputPath, outputPath, parameters } = data;
  
  try {
    progressCallback(0, 'processing');
    
    // Create MediaProcessor instance
    const MediaProcessor = require('./services/MediaProcessor');
    const mediaProcessor = new MediaProcessor();
    
    // Create job object for MediaProcessor
    const job = {
      _id: jobId,
      inputPath,
      outputPath,
      parameters
    };
    
    // Process audio using MediaProcessor
    const result = await new Promise((resolve, reject) => {
      // Override the updateJobStatus method to use our progressCallback
      mediaProcessor.updateJobStatus = async (jobId, status, progress, result = null, error = null) => {
        progressCallback(progress, status);
        
        if (status === 'completed') {
          resolve(result);
        } else if (status === 'failed') {
          reject(new Error(error));
        }
      };
      
      // Process the audio
      mediaProcessor.processAudio(job).catch(reject);
    });
    
    progressCallback(100, 'completed');
    return result;
    
  } catch (error) {
    progressCallback(0, 'failed');
    throw error;
  }
}

async function processImageWithProgress(data, progressCallback) {
  const { jobId, inputPath, outputPath, parameters } = data;
  
  try {
    progressCallback(0, 'processing');
    
    // Create MediaProcessor instance
    const MediaProcessor = require('./services/MediaProcessor');
    const mediaProcessor = new MediaProcessor();
    
    // Create job object for MediaProcessor
    const job = {
      _id: jobId,
      inputPath,
      outputPath,
      parameters
    };
    
    // Process image using MediaProcessor
    const result = await new Promise((resolve, reject) => {
      // Override the updateJobStatus method to use our progressCallback
      mediaProcessor.updateJobStatus = async (jobId, status, progress, result = null, error = null) => {
        progressCallback(progress, status);
        
        if (status === 'completed') {
          resolve(result);
        } else if (status === 'failed') {
          reject(new Error(error));
        }
      };
      
      // Process the image
      mediaProcessor.processImage(job).catch(reject);
    });
    
    progressCallback(100, 'completed');
    return result;
    
  } catch (error) {
    progressCallback(0, 'failed');
    throw error;
  }
}

async function processThumbnailWithProgress(data, progressCallback) {
  const { jobId, inputPath, outputPath, parameters } = data;
  
  try {
    progressCallback(0, 'processing');
    
    // Create MediaProcessor instance
    const MediaProcessor = require('./services/MediaProcessor');
    const mediaProcessor = new MediaProcessor();
    
    // Create job object for MediaProcessor
    const job = {
      _id: jobId,
      inputPath,
      outputPath,
      parameters
    };
    
    // Process thumbnail using MediaProcessor
    const result = await new Promise((resolve, reject) => {
      // Override the updateJobStatus method to use our progressCallback
      mediaProcessor.updateJobStatus = async (jobId, status, progress, result = null, error = null) => {
        progressCallback(progress, status);
        
        if (status === 'completed') {
          resolve(result);
        } else if (status === 'failed') {
          reject(new Error(error));
        }
      };
      
      // Process the thumbnail
      mediaProcessor.generateThumbnail(job).catch(reject);
    });
    
    progressCallback(100, 'completed');
    return result;
    
  } catch (error) {
    progressCallback(0, 'failed');
    throw error;
  }
}

async function processBatchJob(data, io) {
  const { batchId, fileIds, processingOptions } = data;
  
  console.log(`Processing batch job ${batchId} with ${fileIds.length} files`);
  
  // Send batch start notification
  io.emit('batch-started', {
    batchId,
    totalFiles: fileIds.length
  });
  
  let completedFiles = 0;
  let failedFiles = 0;
  
  // Process each file in the batch
  for (const fileId of fileIds) {
    try {
      // Create individual job for each file
      const jobData = {
        fileId,
        batchId,
        processingOptions,
        inputPath: `/path/to/input/${fileId}`,
        outputPath: `/path/to/output/${fileId}`,
        parameters: processingOptions.parameters
      };
      
      // Add to appropriate queue
      const { QueueManager } = require('./services/QueueManager');
      const queueManager = new QueueManager();
      
      const job = await queueManager.addJob(processingOptions.type, jobData);
      
      // Wait for job to complete (with timeout)
      await waitForJobCompletion(job, 300000); // 5 minute timeout
      
      completedFiles++;
      
      // Send progress update
      const progress = (completedFiles / fileIds.length) * 100;
      io.emit('batch-progress', {
        batchId,
        fileId,
        status: 'completed',
        progress,
        completedFiles,
        totalFiles: fileIds.length
      });
      
    } catch (error) {
      console.error(`Failed to process file ${fileId} in batch ${batchId}:`, error);
      failedFiles++;
      
      // Send error update
      const progress = ((completedFiles + failedFiles) / fileIds.length) * 100;
      io.emit('batch-progress', {
        batchId,
        fileId,
        status: 'failed',
        progress: progress,
        error: error.message,
        completedFiles,
        failedFiles,
        totalFiles: fileIds.length
      });
    }
  }
  
  // Send batch completion notification
  io.emit('batch-completed', {
    batchId,
    completedFiles,
    failedFiles,
    totalFiles: fileIds.length,
    status: failedFiles > 0 ? 'completed_with_errors' : 'completed'
  });
  
  return {
    batchId,
    completedFiles,
    failedFiles,
    totalFiles: fileIds.length,
    status: failedFiles > 0 ? 'completed_with_errors' : 'completed'
  };
}

// Helper function to wait for job completion
async function waitForJobCompletion(job, timeout) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkCompletion = () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > timeout) {
        reject(new Error(`Job ${job.id} timed out after ${timeout}ms`));
        return;
      }
      
      job.getState().then(state => {
        if (state === 'completed') {
          resolve();
        } else if (state === 'failed') {
          reject(new Error(`Job ${job.id} failed`));
        } else {
          setTimeout(checkCompletion, 1000);
        }
      }).catch(reject);
    };
    
    checkCompletion();
  });
}

async function processArchiveWithProgress(data, progressCallback) {
  const { jobId, inputPath, webhookUrl, webhookSecret, cmsId, parameters } = data;
  
  try {
    progressCallback(0, 'processing');
    
    // Create MediaProcessor instance
    const MediaProcessor = require('./services/MediaProcessor');
    const mediaProcessor = new MediaProcessor();
    
    // Create job object for MediaProcessor
    const job = {
      _id: jobId,
      inputPath,
      webhookUrl,
      webhookSecret,
      cmsId,
      parameters
    };
    
    // Process archive using MediaProcessor
    const result = await new Promise((resolve, reject) => {
      // Override the updateJobStatus method to use our progressCallback
      mediaProcessor.updateJobStatus = async (jobId, status, progress, result = null, error = null) => {
        progressCallback(progress, status);
        
        if (status === 'completed') {
          resolve(result);
        } else if (status === 'failed') {
          reject(new Error(error));
        }
      };
      
      // Process the archive
      mediaProcessor.processArchive(job).catch(reject);
    });
    
    progressCallback(100, 'completed');
    return result;
    
  } catch (error) {
    progressCallback(0, 'failed');
    throw error;
  }
}

// Graceful shutdown
async function shutdownWorker() {
  console.log('Closing queue connections...');
  
  // Close all queue connections
  for (const queue of Object.values(queues)) {
    await queue.close();
  }
  
  console.log('Worker shut down gracefully');
  process.exit(0);
}