const mongoose = require('mongoose');

const processingJobSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['video-transcode', 'audio-convert', 'image-resize', 'video-thumbnail']
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  inputPath: {
    type: String,
    required: true
  },
  outputPath: {
    type: String,
    required: true
  },
  parameters: {
    width: Number,
    height: Number,
    format: String,
    quality: Number,
    bitrate: String,
    thumbnailTime: Number
  },
  result: {
    outputPath: String,
    size: Number,
    duration: Number,
    format: String
  },
  error: {
    message: String,
    stack: String
  },
  webhookUrl: String,
  webhookSecret: String,
  cmsId: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  startedAt: Date
});

processingJobSchema.index({ fileId: 1 });
processingJobSchema.index({ status: 1 });
processingJobSchema.index({ createdAt: -1 });
processingJobSchema.index({ status: 1, createdAt: -1 });
processingJobSchema.index({ cmsId: 1 });

module.exports = mongoose.model('ProcessingJob', processingJobSchema);