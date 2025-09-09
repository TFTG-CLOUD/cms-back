const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { verifySignedUrl } = require('../middleware/auth');
const File = require('../models/File');

class ChunkedUploadManager {
  constructor(uploadDir = './uploads/chunks', chunkSize = 5 * 1024 * 1024, sessionTimeout = 24 * 60 * 60 * 1000) {
    this.uploadDir = uploadDir;
    this.chunkSize = chunkSize;
    this.sessionTimeout = sessionTimeout; // 默认24小时过期
    this.activeUploads = new Map();
    this.startCleanupTimer();
  }

  async initializeUpload(fileInfo) {
    const { filename, fileSize, contentType, chunkSize = this.chunkSize, uploadedBy } = fileInfo;
    
    const uploadId = crypto.randomBytes(32).toString('hex');
    const uploadPath = path.join(this.uploadDir, uploadId);
    
    await fsPromises.mkdir(uploadPath, { recursive: true });
    
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
      expiresAt: new Date(Date.now() + this.sessionTimeout),
      uploadedBy,
      status: 'initialized'
    };
    
    this.activeUploads.set(uploadId, uploadSession);
    
    return {
      uploadId,
      chunkSize,
      totalChunks,
      uploadUrl: `/api/upload/chunk/${uploadId}`,
      expiresAt: uploadSession.expiresAt
    };
  }

  async uploadChunk(uploadId, chunkIndex, chunkData) {
    const session = this.activeUploads.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    // 检查是否过期
    if (Date.now() > session.expiresAt) {
      this.activeUploads.delete(uploadId);
      await this.cleanupChunks(uploadId);
      throw new Error('Upload session expired');
    }

    if (session.status === 'completed') {
      throw new Error('Upload already completed');
    }

    if (chunkIndex >= session.totalChunks) {
      throw new Error('Invalid chunk index');
    }

    const chunkFilename = `chunk_${chunkIndex.toString().padStart(6, '0')}`;
    const chunkPath = path.join(session.uploadPath, chunkFilename);
    
    await fsPromises.writeFile(chunkPath, chunkData);
    session.receivedChunks.add(chunkIndex);
    
    const progress = Math.round((session.receivedChunks.size / session.totalChunks) * 100);
    
    if (session.receivedChunks.size === session.totalChunks) {
      console.log('All chunks received, completing upload...');
      await this.completeUpload(uploadId, session.uploadedBy);
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

  async completeUpload(uploadId, uploadedBy = null) {
    const session = this.activeUploads.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    try {
      const finalFilename = `${crypto.randomBytes(16).toString('hex')}_${session.filename}`;
      const finalPath = path.join(process.cwd(), 'uploads', finalFilename);
      
      // 使用简单的文件写入方式
      let finalData = Buffer.alloc(0);
      
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkFilename = `chunk_${i.toString().padStart(6, '0')}`;
        const chunkPath = path.join(session.uploadPath, chunkFilename);
        const chunkData = await fsPromises.readFile(chunkPath);
        finalData = Buffer.concat([finalData, chunkData]);
      }
      
      await fsPromises.writeFile(finalPath, finalData);
      
      session.status = 'completed';
      session.finalPath = finalPath;
      session.finalFilename = finalFilename;
      session.completedAt = new Date();
      
      // 创建数据库记录
      let fileRecord = null;
      try {
        const fileData = {
          originalName: session.filename,
          filename: finalFilename,
          path: finalPath,
          size: session.fileSize,
          mimeType: session.contentType
        };

        // 只有在有有效的 uploadedBy 时才添加该字段
        if (uploadedBy && mongoose.Types.ObjectId.isValid(uploadedBy)) {
          fileData.uploadedBy = uploadedBy;
        }

        fileRecord = new File(fileData);
        await fileRecord.save();
        console.log('File record created successfully:', fileRecord._id);
      } catch (dbError) {
        console.error('Failed to create file record:', dbError);
        // 即使数据库记录创建失败，也继续执行
      }
      
      await this.cleanupChunks(uploadId);
      
      const result = {
        uploadId,
        status: 'completed',
        filename: session.finalFilename,
        path: finalPath,
        size: session.fileSize,
        contentType: session.contentType
      };

      // 如果数据库记录创建成功，添加文件ID
      if (fileRecord && fileRecord._id) {
        result.fileId = fileRecord._id;
        result.fileRecord = {
          id: fileRecord._id,
          originalName: fileRecord.originalName,
          filename: fileRecord.filename,
          size: fileRecord.size,
          mimeType: fileRecord.mimeType,
          uploadDate: fileRecord.uploadDate
        };
        
        // 保存文件ID到会话中
        session.fileId = fileRecord._id;
      } else {
        console.log('File record not available in response');
      }

      return result;
      
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
      await fsPromises.rmdir(session.uploadPath, { recursive: true });
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

    // 检查是否过期
    if (Date.now() > session.expiresAt) {
      this.activeUploads.delete(uploadId);
      await this.cleanupChunks(uploadId);
      return null;
    }
    
    const result = {
      uploadId,
      filename: session.filename,
      fileSize: session.fileSize,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      receivedChunks: session.receivedChunks.size,
      progress: Math.round((session.receivedChunks.size / session.totalChunks) * 100),
      status: session.status,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      expiresAt: session.expiresAt
    };

    // 如果上传已完成，添加文件信息
    if (session.status === 'completed') {
      result.fileId = session.fileId;
      result.filename = session.finalFilename;
      result.path = session.finalPath;
      result.size = session.fileSize;
      result.contentType = session.contentType;
    }

    return result;
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

  // 启动清理定时器
  startCleanupTimer() {
    // 每小时清理一次过期会话
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  // 清理过期会话
  async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredUploads = [];
    
    for (const [uploadId, session] of this.activeUploads) {
      if (now > session.expiresAt) {
        expiredUploads.push(uploadId);
      }
    }
    
    for (const uploadId of expiredUploads) {
      this.activeUploads.delete(uploadId);
      await this.cleanupChunks(uploadId);
      console.log(`Cleaned up expired upload session: ${uploadId}`);
    }
    
    if (expiredUploads.length > 0) {
      console.log(`Cleaned up ${expiredUploads.length} expired upload sessions`);
    }
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
      chunkSize: chunkSize ? parseInt(chunkSize) : undefined,
      uploadedBy: req.apiKey?._id
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