const Queue = require('bull');
const Redis = require('ioredis');
const path = require('path');

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  connectTimeout: 10000,
  commandTimeout: 5000
};

// Create Redis connection
const redisConnection = new Redis(redisConfig);

// Create different queues for different job types
const queues = {
  videoTranscoding: new Queue('video transcoding', { redis: redisConnection }),
  audioProcessing: new Queue('audio processing', { redis: redisConnection }),
  imageProcessing: new Queue('image processing', { redis: redisConnection }),
  thumbnailGeneration: new Queue('thumbnail generation', { redis: redisConnection }),
  batchProcessing: new Queue('batch processing', { redis: redisConnection })
};

// Queue configuration
const queueOptions = {
  concurrency: parseInt(process.env.QUEUE_CONCURRENCY) || 3,
  maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.QUEUE_RETRY_DELAY) || 5000,
  removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE) || 10,
  removeOnFailed: parseInt(process.env.QUEUE_REMOVE_ON_FAILED) || 5
};

// Initialize queues with settings
Object.values(queues).forEach(queue => {
  // Note: bull doesn't have setDefaultJobOptions method
  // Default options will be set when adding jobs

  // Set up event listeners
  queue.on('completed', (job, result) => {
    console.log(`Job ${job.id} in queue '${job.queue.name}' completed with result:`, result);
  });

  queue.on('failed', (job, err) => {
    console.error(`Job ${job.id} in queue '${job.queue.name}' failed:`, err);
  });

  queue.on('stalled', (job) => {
    console.warn(`Job ${job.id} in queue '${job.queue.name}' stalled`);
  });

  queue.on('progress', (job, progress) => {
    console.log(`Job ${job.id} in queue '${job.queue.name}' progress: ${progress}%`);
  });
});

// Queue management functions
class QueueManager {
  constructor() {
    this.queues = queues;
    this.options = queueOptions;
  }

  // Add job to appropriate queue
  async addJob(jobType, jobData, options = {}) {
    let queue;
    
    switch (jobType) {
      case 'video-transcode':
        queue = this.queues.videoTranscoding;
        break;
      case 'audio-convert':
        queue = this.queues.audioProcessing;
        break;
      case 'image-resize':
        queue = this.queues.imageProcessing;
        break;
      case 'video-thumbnail':
        queue = this.queues.thumbnailGeneration;
        break;
      case 'batch-process':
        queue = this.queues.batchProcessing;
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    const job = await queue.add(jobType, jobData, {
      priority: options.priority || 1,
      delay: options.delay || 0,
      removeOnComplete: options.removeOnComplete || this.options.removeOnComplete,
      removeOnFailed: options.removeOnFailed || this.options.removeOnFailed,
      attempts: options.attempts || this.options.maxRetries,
      backoff: options.backoff || { type: 'exponential', delay: this.options.retryDelay }
    });

    console.log(`Added job ${job.id} to ${jobType} queue`);
    return job;
  }

  // Get queue statistics
  async getQueueStats(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length
    };
  }

  // Get all queues statistics
  async getAllQueueStats() {
    const stats = {};
    
    for (const [queueName, queue] of Object.entries(this.queues)) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return stats;
  }

  // Pause/resume queue
  async pauseQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.pause();
  }

  async resumeQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.resume();
  }

  // Clean up queues
  async cleanQueue(queueName, type = 'completed', olderThan = 24 * 60 * 60 * 1000) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    const jobs = await queue.clean(olderThan, type);
    console.log(`Cleaned ${jobs.length} ${type} jobs from ${queueName} queue`);
    return jobs;
  }

  // Retry failed jobs
  async retryFailedJobs(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const failedJobs = await queue.getFailed();
    const retriedJobs = [];

    for (const job of failedJobs) {
      await job.retry();
      retriedJobs.push(job.id);
    }

    console.log(`Retried ${retriedJobs.length} failed jobs in ${queueName} queue`);
    return retriedJobs;
  }

  // Get job details
  async getJobDetails(queueName, jobId) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in ${queueName} queue`);
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      queue: queueName,
      type: job.name,
      data: job.data,
      state,
      progress,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
      attempts: job.attempts.made,
      maxAttempts: job.attempts.max,
      failedReason: job.failedReason
    };
  }

  // Remove job
  async removeJob(queueName, jobId) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in ${queueName} queue`);
    }

    await job.remove();
    console.log(`Removed job ${jobId} from ${queueName} queue`);
  }

  // Close all queue connections
  async close() {
    for (const queue of Object.values(this.queues)) {
      await queue.close();
    }
    await redisConnection.quit();
  }
}

module.exports = {
  QueueManager,
  queues,
  redisConnection,
  queueOptions
};