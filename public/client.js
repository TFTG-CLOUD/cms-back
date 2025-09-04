const io = require('socket.io-client');

class MediaProcessingClient {
  constructor(serverUrl, apiKey, apiSecret) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.socket = null;
  }

  async connect() {
    this.socket = io(this.serverUrl);
    
    this.socket.on('connect', () => {
      console.log('Connected to media processing server');
    });

    this.socket.on('job-progress', (data) => {
      console.log('Job progress update:', data);
      this.onProgress?.(data);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from media processing server');
    });
  }

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
      console.error('Job status error:', error);
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

  onProgress(callback) {
    this.onProgress = callback;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Example usage
if (typeof window !== 'undefined') {
  window.MediaProcessingClient = MediaProcessingClient;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MediaProcessingClient;
}