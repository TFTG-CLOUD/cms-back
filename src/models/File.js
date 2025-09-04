const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApiKey'
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  metadata: {
    width: Number,
    height: Number,
    duration: Number,
    format: String,
    bitrate: Number
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  processingResult: [mongoose.Schema.Types.Mixed],
  processingError: String
});

fileSchema.index({ uploadedBy: 1 });
fileSchema.index({ uploadDate: -1 });
fileSchema.index({ processingStatus: 1 });
fileSchema.index({ uploadedBy: 1, uploadDate: -1 });
fileSchema.index({ mimeType: 1 });
fileSchema.index({ filename: 1 });

module.exports = mongoose.model('File', fileSchema);