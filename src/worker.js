const throng = require('throng');
const Queue = require('bull');
const path = require('path');
require('dotenv').config();

// Import processing services
const MediaProcessor = require('./services/MediaProcessor');
const BatchProcessor = require('./services/BatchProcessor');
const { queues, redisConnection } = require('./services/QueueManager');

// Worker configuration
const WORKERS = process.env.WORKER_COUNT || 2;
const CONCURRENCY = process.env.QUEUE_CONCURRENCY || 3;

// Start workers
throng({
  workers: WORKERS,
  lifetime: Infinity,
  start: startWorker
});

function startWorker(id) {
  console.log(`Worker ${id} started with concurrency ${CONCURRENCY}`);
  
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
  queues.videoTranscoding.process(CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing video transcoding job ${job.id}`);
    
    try {
      // Set up progress monitoring for this job
      const progressCallback = (progress, status) => {
        job.progress(progress);
        
        // Send progress update via Socket.IO
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      // Process the video
      const result = await processVideoWithProgress(job.data, progressCallback);
      
      console.log(`Worker ${id} completed video transcoding job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed video transcoding job ${job.id}:`, error);
      
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
  queues.audioProcessing.process(CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing audio job ${job.id}`);
    
    try {
      const progressCallback = (progress, status) => {
        job.progress(progress);
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      const result = await processAudioWithProgress(job.data, progressCallback);
      
      console.log(`Worker ${id} completed audio job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed audio job ${job.id}:`, error);
      
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
  queues.imageProcessing.process(CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing image job ${job.id}`);
    
    try {
      const progressCallback = (progress, status) => {
        job.progress(progress);
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      const result = await processImageWithProgress(job.data, progressCallback);
      
      console.log(`Worker ${id} completed image job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed image job ${job.id}:`, error);
      
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
  queues.thumbnailGeneration.process(CONCURRENCY, async (job) => {
    console.log(`Worker ${id} processing thumbnail job ${job.id}`);
    
    try {
      const progressCallback = (progress, status) => {
        job.progress(progress);
        io.emit('job-progress', {
          jobId: job.data.jobId,
          progress,
          status
        });
      };

      const result = await processThumbnailWithProgress(job.data, progressCallback);
      
      console.log(`Worker ${id} completed thumbnail job ${job.id}`);
      return result;
      
    } catch (error) {
      console.error(`Worker ${id} failed thumbnail job ${job.id}:`, error);
      
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
  
  progressCallback(0, 'processing');
  
  // Simulate video processing with progress updates
  const totalSteps = 10;
  for (let i = 1; i <= totalSteps; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
    const progress = (i / totalSteps) * 100;
    progressCallback(progress, 'processing');
  }
  
  progressCallback(100, 'completed');
  
  return {
    outputPath,
    size: Math.floor(Math.random() * 100000000) + 1000000,
    format: parameters.format || 'mp4',
    duration: Math.floor(Math.random() * 3600) + 60
  };
}

async function processAudioWithProgress(data, progressCallback) {
  const { jobId, inputPath, outputPath, parameters } = data;
  
  progressCallback(0, 'processing');
  
  // Simulate audio processing with progress updates
  const totalSteps = 8;
  for (let i = 1; i <= totalSteps; i++) {
    await new Promise(resolve => setTimeout(resolve, 800)); // Simulate work
    const progress = (i / totalSteps) * 100;
    progressCallback(progress, 'processing');
  }
  
  progressCallback(100, 'completed');
  
  return {
    outputPath,
    size: Math.floor(Math.random() * 50000000) + 1000000,
    format: parameters.format || 'mp3',
    duration: Math.floor(Math.random() * 1800) + 30,
    bitrate: parameters.bitrate || '128k',
    sampleRate: parameters.sampleRate || 44100,
    channels: parameters.channels || 2
  };
}

async function processImageWithProgress(data, progressCallback) {
  const { jobId, inputPath, outputPath, parameters } = data;
  
  progressCallback(0, 'processing');
  
  // Simulate image processing with progress updates
  const totalSteps = 5;
  for (let i = 1; i <= totalSteps; i++) {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
    const progress = (i / totalSteps) * 100;
    progressCallback(progress, 'processing');
  }
  
  progressCallback(100, 'completed');
  
  return {
    outputPath,
    size: Math.floor(Math.random() * 10000000) + 100000,
    format: parameters.format || 'jpg',
    width: parameters.width || 1920,
    height: parameters.height || 1080
  };
}

async function processThumbnailWithProgress(data, progressCallback) {
  const { jobId, inputPath, outputPath, parameters } = data;
  
  progressCallback(0, 'processing');
  
  // Simulate thumbnail generation with progress updates
  const totalSteps = 3;
  for (let i = 1; i <= totalSteps; i++) {
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate work
    const progress = (i / totalSteps) * 100;
    progressCallback(progress, 'processing');
  }
  
  progressCallback(100, 'completed');
  
  return {
    outputPath,
    size: Math.floor(Math.random() * 1000000) + 50000,
    format: 'jpg',
    width: parameters.width || 320,
    height: parameters.height || 240
  };
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