const mongoose = require('mongoose');

const batchProcessingJobSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  cmsId: {
    type: String,
    required: true
  },
  webhookUrl: String,
  webhookSecret: String,
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  totalFiles: {
    type: Number,
    default: 0
  },
  processedFiles: {
    type: Number,
    default: 0
  },
  failedFiles: {
    type: Number,
    default: 0
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  files: [{
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File'
    },
    processingJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProcessingJob'
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    progress: {
      type: Number,
      default: 0
    },
    error: {
      message: String,
      code: String
    },
    result: {
      outputPath: String,
      size: Number,
      format: String
    },
    startedAt: Date,
    completedAt: Date
  }],
  processingOptions: {
    type: {
      type: String,
      required: true,
      enum: ['video-transcode', 'audio-convert', 'image-resize', 'video-thumbnail']
    },
    parameters: {
      width: Number,
      height: Number,
      format: String,
      quality: Number,
      bitrate: String,
      sampleRate: Number,
      channels: Number,
      thumbnailTime: Number
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApiKey'
  },
  startedAt: Date,
  completedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

batchProcessingJobSchema.methods.updateProgress = function() {
  if (this.totalFiles === 0) {
    this.progress = 0;
    return;
  }

  const totalProgress = this.files.reduce((sum, file) => sum + file.progress, 0);
  this.progress = Math.round(totalProgress / this.totalFiles);
  
  this.processedFiles = this.files.filter(f => f.status === 'completed').length;
  this.failedFiles = this.files.filter(f => f.status === 'failed').length;
  
  if (this.processedFiles + this.failedFiles === this.totalFiles) {
    this.status = this.failedFiles > 0 ? 'completed' : 'completed';
    this.completedAt = new Date();
  } else if (this.files.some(f => f.status === 'processing')) {
    this.status = 'processing';
  }
};

batchProcessingJobSchema.methods.addFile = function(fileId) {
  this.files.push({
    fileId,
    status: 'pending',
    progress: 0
  });
  this.totalFiles += 1;
  this.updateProgress();
};

batchProcessingJobSchema.methods.updateFileStatus = function(fileId, status, progress, result = null, error = null) {
  const file = this.files.find(f => f.fileId.toString() === fileId.toString());
  if (file) {
    file.status = status;
    file.progress = progress;
    
    if (result) {
      file.result = result;
    }
    
    if (error) {
      file.error = error;
    }
    
    if (status === 'processing') {
      file.startedAt = new Date();
    } else if (status === 'completed' || status === 'failed') {
      file.completedAt = new Date();
    }
    
    this.updateProgress();
  }
};

batchProcessingJobSchema.index({ cmsId: 1 });
batchProcessingJobSchema.index({ status: 1 });
batchProcessingJobSchema.index({ createdBy: 1 });
batchProcessingJobSchema.index({ cmsId: 1, status: 1 });
batchProcessingJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BatchProcessingJob', batchProcessingJobSchema);