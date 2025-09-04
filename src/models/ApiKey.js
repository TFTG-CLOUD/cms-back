const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const apiKeySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  apiKey: {
    type: String,
    required: true,
  },
  apiSecret: {
    type: String,
    required: true
  },
  permissions: [{
    type: String,
    enum: ['upload', 'process', 'read', 'delete']
  }],
  allowedOrigins: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

apiKeySchema.pre('save', async function (next) {
  if (this.isModified('apiSecret')) {
    this.apiSecret = await bcrypt.hash(this.apiSecret, 10);
  }
  next();
});

apiKeySchema.methods.compareSecret = async function (secret) {
  return bcrypt.compare(secret, this.apiSecret);
};

apiKeySchema.index({ apiKey: 1 }, { unique: true });
apiKeySchema.index({ isActive: 1 });
apiKeySchema.index({ lastUsed: -1 });
apiKeySchema.index({ createdAt: -1 });

module.exports = mongoose.model('ApiKey', apiKeySchema);