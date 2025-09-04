const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { verifySignedUrl } = require('../middleware/auth');

class ChunkedUploadManager {
  constructor(uploadDir = './uploads/chunks', chunkSize = 5 * 1024 * 1024) {
    this.uploadDir = uploadDir;
    this.chunkSize = chunkSize;
    this.activeUploads = new Map();
  }

  async initializeUpload(fileInfo) {
    const { filename, fileSize, contentType, chunkSize = this.chunkSize } = fileInfo;
    
    const uploadId = crypto.randomBytes(32).toString('hex');
    const uploadPath = path.join(this.uploadDir, uploadId);
    
    await fs.mkdir(uploadPath, { recursive: true });
    
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    const uploadSession = {
      uploadId,
      filename,
      fileSize,
      contentType,
      chunkSize,
      totalChunks,
      receivedChunks: new Set(),
      uploadPath,
      createdAt: new Date(),
      status: 'initialized'
    };
    
    this.activeUploads.set(uploadId, uploadSession);
    
    return {
      uploadId,
      chunkSize,
      totalChunks,
      uploadUrl: `/api/upload/chunk/${uploadId}`
    };
  }

  async uploadChunk(uploadId, chunkIndex, chunkData) {
    const session = this.activeUploads.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    if (session.status === 'completed') {
      throw new Error('Upload already completed');
    }

    if (chunkIndex >= session.totalChunks) {
      throw new Error('Invalid chunk index');
    }

    const chunkFilename = `chunk_${chunkIndex.toString().padStart(6, '0')}`;
    const chunkPath = path.join(session.uploadPath, chunkFilename);
    
    await fs.writeFile(chunkPath, chunkData);
    session.receivedChunks.add(chunkIndex);
    
    const progress = Math.round((session.receivedChunks.size / session.totalChunks) * 100);
    
    if (session.receivedChunks.size === session.totalChunks) {
      await this.completeUpload(uploadId);
    }
    
    return {
      uploadId,
      chunkIndex,
      receivedChunks: session.receivedChunks.size,
      totalChunks: session.totalChunks,
      progress,
      status: session.status
    };
  }

  async completeUpload(uploadId) {
    const session = this.activeUploads.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    try {
      const finalFilename = `${crypto.randomBytes(16).toString('hex')}_${session.filename}`;
      const finalPath = path.join(process.cwd(), 'uploads', finalFilename);
      
      const outputStream = fs.createWriteStream(finalPath);
      
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkFilename = `chunk_${i.toString().padStart(6, '0')}`;
        const chunkPath = path.join(session.uploadPath, chunkFilename);
        const chunkData = await fs.readFile(chunkPath);
        outputStream.write(chunkData);
      }
      
      outputStream.end();
      
      await new Promise((resolve, reject) => {
        outputStream.on('finish', resolve);
        outputStream.on('error', reject);
      });
      
      session.status = 'completed';
      session.finalPath = finalPath;
      session.finalFilename = finalFilename;
      session.completedAt = new Date();
      
      await this.cleanupChunks(uploadId);
      
      return {
        uploadId,
        status: 'completed',
        filename: session.finalFilename,
        path: finalPath,
        size: session.fileSize,
        contentType: session.contentType
      };
      
    } catch (error) {
      session.status = 'failed';
      session.error = error.message;
      throw error;
    }
  }

  async cleanupChunks(uploadId) {
    const session = this.activeUploads.get(uploadId);
    if (!session) return;
    
    try {
      await fs.rmdir(session.uploadPath, { recursive: true });
    } catch (error) {
      console.error('Error cleaning up chunks:', error);
    }
    
    if (session.status === 'completed' || session.status === 'failed') {
      setTimeout(() => {
        this.activeUploads.delete(uploadId);
      }, 24 * 60 * 60 * 1000); // Keep for 24 hours
    }
  }

  async getUploadStatus(uploadId) {
    const session = this.activeUploads.get(uploadId);
    if (!session) {
      return null;
    }
    
    return {
      uploadId,
      filename: session.filename,
      fileSize: session.fileSize,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      receivedChunks: session.receivedChunks.size,
      progress: Math.round((session.receivedChunks.size / session.totalChunks) * 100),
      status: session.status,
      createdAt: session.createdAt,
      completedAt: session.completedAt
    };
  }

  async cancelUpload(uploadId) {
    const session = this.activeUploads.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found');
    }
    
    session.status = 'cancelled';
    await this.cleanupChunks(uploadId);
    
    return { uploadId, status: 'cancelled' };
  }
}

const uploadManager = new ChunkedUploadManager();

const handleChunkedUpload = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { chunkIndex } = req.body;
    
    if (!req.file || !chunkIndex) {
      return res.status(400).json({ error: 'Chunk data and chunk index are required' });
    }
    
    const result = await uploadManager.uploadChunk(uploadId, parseInt(chunkIndex), req.file.buffer);
    res.json(result);
    
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

const initializeChunkedUpload = async (req, res) => {
  try {
    const { filename, fileSize, contentType, chunkSize } = req.body;
    
    if (!filename || !fileSize || !contentType) {
      return res.status(400).json({ error: 'Filename, file size, and content type are required' });
    }
    
    const result = await uploadManager.initializeUpload({
      filename,
      fileSize: parseInt(fileSize),
      contentType,
      chunkSize: chunkSize ? parseInt(chunkSize) : undefined
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Upload initialization error:', error);
    res.status(500).json({ error: error.message });
  }
};

const getUploadStatus = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const status = await uploadManager.getUploadStatus(uploadId);
    
    if (!status) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    
    res.json(status);
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: error.message });
  }
};

const completeChunkedUpload = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const result = await uploadManager.completeUpload(uploadId);
    res.json(result);
    
  } catch (error) {
    console.error('Upload completion error:', error);
    res.status(500).json({ error: error.message });
  }
};

const cancelChunkedUpload = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const result = await uploadManager.cancelUpload(uploadId);
    res.json(result);
    
  } catch (error) {
    console.error('Upload cancellation error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  ChunkedUploadManager,
  uploadManager,
  handleChunkedUpload,
  initializeChunkedUpload,
  getUploadStatus,
  completeChunkedUpload,
  cancelChunkedUpload
};