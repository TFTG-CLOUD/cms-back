// Enhanced Media Processing Client with Batch Support
class MediaProcessingClient {
  constructor(serverUrl, apiKey, apiSecret) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.socket = null;
    this.batchHandlers = new Map();
    this.cmsHandlers = new Map();
  }

  async connect() {
    this.socket = io(this.serverUrl);
    
    this.socket.on('connect', () => {
      console.log('Connected to media processing server');
      this.onConnect?.();
    });

    this.socket.on('job-progress', (data) => {
      console.log('Job progress:', data);
      this.onJobProgress?.(data);
    });

    this.socket.on('batch-progress', (data) => {
      console.log('Batch progress:', data);
      this.onBatchProgress?.(data);
      
      // Call specific batch handlers
      const batchHandler = this.batchHandlers.get(data.batchId);
      if (batchHandler) {
        batchHandler(data);
      }
    });

    this.socket.on('batch-started', (data) => {
      console.log('Batch started:', data);
      this.onBatchStarted?.(data);
    });

    this.socket.on('batch-completed', (data) => {
      console.log('Batch completed:', data);
      this.onBatchCompleted?.(data);
    });

    this.socket.on('batch-cancelled', (data) => {
      console.log('Batch cancelled:', data);
      this.onBatchCancelled?.(data);
    });

    this.socket.on('cms-batch-started', (data) => {
      console.log('CMS batch started:', data);
      this.onCMSBatchStarted?.(data);
      
      // Call specific CMS handlers
      const cmsHandler = this.cmsHandlers.get(data.cmsId);
      if (cmsHandler) {
        cmsHandler(data);
      }
    });

    this.socket.on('cms-batch-completed', (data) => {
      console.log('CMS batch completed:', data);
      this.onCMSBatchCompleted?.(data);
    });

    this.socket.on('cms-batch-cancelled', (data) => {
      console.log('CMS batch cancelled:', data);
      this.onCMSBatchCancelled?.(data);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from media processing server');
      this.onDisconnect?.();
    });
  }

  // Subscription methods
  subscribeToJob(jobId) {
    if (this.socket) {
      this.socket.emit('subscribe-job', jobId);
    }
  }

  subscribeToBatch(batchId) {
    if (this.socket) {
      this.socket.emit('subscribe-batch', batchId);
    }
  }

  subscribeToCMS(cmsId) {
    if (this.socket) {
      this.socket.emit('subscribe-cms', cmsId);
    }
  }

  unsubscribeFromCMS(cmsId) {
    if (this.socket) {
      this.socket.emit('unsubscribe-cms', cmsId);
    }
  }

  // Batch-specific event handlers
  onBatchProgress(batchId, handler) {
    this.batchHandlers.set(batchId, handler);
  }

  onCMSEvents(cmsId, handler) {
    this.cmsHandlers.set(cmsId, handler);
  }

  // Single file processing methods (existing functionality)
  async uploadFile(file, options = {}) {
    try {
      // Generate signed URL
      const signedResponse = await fetch(`${this.serverUrl}/api/upload/generate-signed-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          expiresIn: options.expiresIn || 3600
        })
      });

      if (!signedResponse.ok) {
        throw new Error('Failed to generate signed URL');
      }

      const { uploadUrl, fileId } = await signedResponse.json();

      // Upload file
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const uploadResult = await uploadResponse.json();
      return { fileId, ...uploadResult };
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  async createProcessingJob(fileId, type, parameters = {}, options = {}) {
    try {
      const response = await fetch(`${this.serverUrl}/api/processing/job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        },
        body: JSON.stringify({
          fileId,
          type,
          parameters,
          webhookUrl: options.webhookUrl,
          webhookSecret: options.webhookSecret
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create processing job');
      }

      const job = await response.json();
      
      // Subscribe to job updates
      if (this.socket) {
        this.socket.emit('subscribe-job', job.id);
      }

      return job;
    } catch (error) {
      console.error('Job creation error:', error);
      throw error;
    }
  }

  // Batch processing methods
  async createBatchJob(name, description, cmsId, processingOptions, options = {}) {
    try {
      const response = await fetch(`${this.serverUrl}/api/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        },
        body: JSON.stringify({
          name,
          description,
          cmsId,
          fileIds: [], // Will add files separately
          processingOptions,
          webhookUrl: options.webhookUrl,
          webhookSecret: options.webhookSecret
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create batch job');
      }

      const batch = await response.json();
      
      // Subscribe to batch updates
      if (this.socket) {
        this.socket.emit('subscribe-batch', batch.id);
      }

      return batch;
    } catch (error) {
      console.error('Batch creation error:', error);
      throw error;
    }
  }

  async addFilesToBatch(batchId, fileIds) {
    try {
      const response = await fetch(`${this.serverUrl}/api/batch/${batchId}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        },
        body: JSON.stringify({
          fileIds
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add files to batch');
      }

      return await response.json();
    } catch (error) {
      console.error('Add files to batch error:', error);
      throw error;
    }
  }

  async startBatchProcessing(batchId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/batch/${batchId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!response.ok) {
        throw new Error('Failed to start batch processing');
      }

      return await response.json();
    } catch (error) {
      console.error('Start batch processing error:', error);
      throw error;
    }
  }

  async getBatchStatus(batchId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/batch/${batchId}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get batch status');
      }

      return await response.json();
    } catch (error) {
      console.error('Get batch status error:', error);
      throw error;
    }
  }

  async cancelBatch(batchId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/batch/${batchId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!response.ok) {
        throw new Error('Failed to cancel batch');
      }

      return await response.json();
    } catch (error) {
      console.error('Cancel batch error:', error);
      throw error;
    }
  }

  // CMS-specific methods
  async createCMSBatch(name, description, fileIds, processingOptions, cmsId, options = {}) {
    try {
      const response = await fetch(`${this.serverUrl}/api/cms/batch-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        },
        body: JSON.stringify({
          name,
          description,
          fileIds,
          processingOptions,
          callbackUrl: options.callbackUrl,
          webhookSecret: options.webhookSecret,
          cmsId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create CMS batch');
      }

      const batch = await response.json();
      
      // Subscribe to CMS updates
      if (this.socket) {
        this.socket.emit('subscribe-cms', cmsId);
        this.socket.emit('subscribe-batch', batch.batchId);
      }

      return batch;
    } catch (error) {
      console.error('CMS batch creation error:', error);
      throw error;
    }
  }

  async getCMSActiveBatches(cmsId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/cms/active-batches/${cmsId}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get CMS active batches');
      }

      return await response.json();
    } catch (error) {
      console.error('Get CMS active batches error:', error);
      throw error;
    }
  }

  async getCMSStatistics(cmsId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/cms/batch-stats/${cmsId}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get CMS statistics');
      }

      return await response.json();
    } catch (error) {
      console.error('Get CMS statistics error:', error);
      throw error;
    }
  }

  // Utility methods
  async getJobStatus(jobId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/processing/job/${jobId}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get job status');
      }

      return await response.json();
    } catch (error) {
      console.error('Get job status error:', error);
      throw error;
    }
  }

  async downloadProcessedFile(jobId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/processing/job/${jobId}/download`, {
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      if (!response.ok) {
        throw new Error('Failed to download processed file');
      }

      return await response.blob();
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // Event handlers
  onConnect(callback) {
    this.onConnect = callback;
  }

  onDisconnect(callback) {
    this.onDisconnect = callback;
  }

  onJobProgress(callback) {
    this.onJobProgress = callback;
  }

  onBatchProgress(callback) {
    this.onBatchProgress = callback;
  }

  onBatchStarted(callback) {
    this.onBatchStarted = callback;
  }

  onBatchCompleted(callback) {
    this.onBatchCompleted = callback;
  }

  onBatchCancelled(callback) {
    this.onBatchCancelled = callback;
  }

  onCMSBatchStarted(callback) {
    this.onCMSBatchStarted = callback;
  }

  onCMSBatchCompleted(callback) {
    this.onCMSBatchCompleted = callback;
  }

  onCMSBatchCancelled(callback) {
    this.onCMSBatchCancelled = callback;
  }
}

// Example usage for multi-file monitoring
class BatchProcessingDemo {
  constructor(serverUrl, apiKey, apiSecret, cmsId) {
    this.client = new MediaProcessingClient(serverUrl, apiKey, apiSecret);
    this.cmsId = cmsId;
    this.activeBatches = new Map();
  }

  async initialize() {
    this.client.connect();
    
    this.client.onConnect(() => {
      console.log('Connected to processing server');
      this.client.subscribeToCMS(this.cmsId);
      this.setupCMSEventHandlers();
    });

    this.client.onBatchProgress((data) => {
      this.updateBatchProgress(data);
    });

    this.client.onCMSBatchStarted((data) => {
      this.handleCMSBatchStarted(data);
    });

    this.client.onCMSBatchCompleted((data) => {
      this.handleCMSBatchCompleted(data);
    });
  }

  setupCMSEventHandlers() {
    this.client.onCMSEvents(this.cmsId, (data) => {
      console.log('CMS Event:', data);
      this.updateCMSDashboard();
    });
  }

  async createAndStartBatch(name, fileIds, processingOptions) {
    try {
      // Create batch job
      const batch = await this.client.createBatchJob(
        name,
        `Batch processing for ${fileIds.length} files`,
        this.cmsId,
        processingOptions,
        {
          webhookUrl: `${this.client.serverUrl}/webhook`,
          webhookSecret: 'secret'
        }
      );

      console.log('Batch created:', batch);

      // Add files to batch
      await this.client.addFilesToBatch(batch.id, fileIds);

      // Start processing
      await this.client.startBatchProcessing(batch.id);

      // Store batch reference
      this.activeBatches.set(batch.id, batch);

      return batch;
    } catch (error) {
      console.error('Batch processing error:', error);
      throw error;
    }
  }

  updateBatchProgress(data) {
    const batch = this.activeBatches.get(data.batchId);
    if (batch) {
      // Update batch progress in UI
      console.log(`Batch ${data.batchId} progress: ${data.progress}%`);
      
      // Update specific file progress
      console.log(`File ${data.fileId}: ${data.status} (${data.progress}%)`);
    }
  }

  handleCMSBatchStarted(data) {
    console.log(`CMS batch started: ${data.name} with ${data.totalFiles} files`);
    this.updateCMSDashboard();
  }

  handleCMSBatchCompleted(data) {
    console.log(`CMS batch completed: ${data.batchId}`);
    this.updateCMSDashboard();
  }

  async updateCMSDashboard() {
    try {
      const activeBatches = await this.client.getCMSActiveBatches(this.cmsId);
      const stats = await this.client.getCMSStatistics(this.cmsId);

      console.log('CMS Active Batches:', activeBatches);
      console.log('CMS Statistics:', stats);

      // Update UI with batch information
      this.renderBatchList(activeBatches.activeBatches);
      this.renderStatistics(stats.statistics);

    } catch (error) {
      console.error('Error updating CMS dashboard:', error);
    }
  }

  renderBatchList(batches) {
    // Render batch list in UI
    console.log('Rendering batch list:', batches);
    // Implementation depends on your UI framework
  }

  renderStatistics(statistics) {
    // Render statistics in UI
    console.log('Rendering statistics:', statistics);
    // Implementation depends on your UI framework
  }
}

// Export for use in browser or Node.js
if (typeof window !== 'undefined') {
  window.MediaProcessingClient = MediaProcessingClient;
  window.BatchProcessingDemo = BatchProcessingDemo;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MediaProcessingClient, BatchProcessingDemo };
}