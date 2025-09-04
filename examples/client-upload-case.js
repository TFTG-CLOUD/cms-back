// 示例：客户端上传和处理任务管理案例

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

// ===== 1. 数据库模型设计 =====

/*
File 模型已包含：
- fileId: 文件唯一标识
- processingStatus: 处理状态
- processingResult: 处理结果
- processingError: 错误信息

ProcessingJob 模型包含：
- taskId: 处理任务ID
- status: 任务状态
- result: 处理结果
- webhookUrl: 回调地址
- cmsId: CMS系统标识
*/

// ===== 2. 客户端上传案例 =====

class MediaUploadClient {
  constructor(apiBaseUrl, apiKey, apiSecret) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  }

  // 上传文件并创建处理任务
  async uploadAndProcess(file, processingOptions, callbackUrl, cmsId) {
    try {
      // 1. 上传文件
      const uploadResult = await this.uploadFile(file);
      
      // 2. 创建处理任务
      const taskResult = await this.createProcessingTask(
        uploadResult.fileId,
        processingOptions,
        callbackUrl,
        cmsId
      );

      return {
        success: true,
        fileId: uploadResult.fileId,
        taskId: taskResult.taskId,
        status: taskResult.status,
        estimatedDuration: taskResult.estimatedDuration,
        monitoringUrl: `${this.apiBaseUrl}/api/processing/status/${taskResult.taskId}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 文件上传
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    // 添加处理参数
    formData.append('processingType', 'video-transcode');
    formData.append('callbackUrl', 'https://your-cms.com/webhook/media-processed');
    formData.append('cmsId', 'your-cms-system-id');
    
    const response = await axios.post(`${this.apiBaseUrl}/api/upload/file`, formData, {
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  }

  // 创建处理任务
  async createProcessingTask(fileId, processingOptions, callbackUrl, cmsId) {
    const taskData = {
      fileId,
      type: processingOptions.type,
      parameters: processingOptions.parameters,
      webhookUrl: callbackUrl,
      cmsId,
      priority: processingOptions.priority || 'normal'
    };

    const response = await axios.post(`${this.apiBaseUrl}/api/processing/create`, taskData, {
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  // 监控任务状态
  async monitorTask(taskId) {
    const response = await axios.get(`${this.apiBaseUrl}/api/processing/status/${taskId}`, {
      headers: {
        'Authorization': `Basic ${this.auth}`
      }
    });

    return response.data;
  }

  // 批量上传和处理
  async batchUploadAndProcess(files, processingOptions, callbackUrl, cmsId) {
    try {
      // 1. 创建批量任务
      const batchResult = await this.createBatchTask(files.length, processingOptions, callbackUrl, cmsId);
      
      // 2. 逐个上传文件
      const uploadPromises = files.map(file => this.uploadFile(file));
      const uploadResults = await Promise.all(uploadPromises);
      
      // 3. 添加文件到批量任务
      const fileIds = uploadResults.map(result => result.fileId);
      await this.addFilesToBatch(batchResult.batchId, fileIds);
      
      // 4. 开始批量处理
      await this.startBatchProcessing(batchResult.batchId);

      return {
        success: true,
        batchId: batchResult.batchId,
        totalFiles: files.length,
        monitoringUrl: `${this.apiBaseUrl}/api/batch/status/${batchResult.batchId}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createBatchTask(totalFiles, processingOptions, callbackUrl, cmsId) {
    const batchData = {
      name: `Batch Processing - ${new Date().toISOString()}`,
      description: `Processing ${totalFiles} files`,
      cmsId,
      processingOptions,
      webhookUrl: callbackUrl,
      totalFiles
    };

    const response = await axios.post(`${this.apiBaseUrl}/api/batch/create`, batchData, {
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  async addFilesToBatch(batchId, fileIds) {
    await axios.post(`${this.apiBaseUrl}/api/batch/${batchId}/add-files`, {
      fileIds
    }, {
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async startBatchProcessing(batchId) {
    await axios.post(`${this.apiBaseUrl}/api/batch/${batchId}/start`, {}, {
      headers: {
        'Authorization': `Basic ${this.auth}`
      }
    });
  }
}

// ===== 3. 服务端处理任务路由案例 =====

const processingRouter = express.Router();

// 创建处理任务
processingRouter.post('/create', async (req, res) => {
  try {
    const { fileId, type, parameters, webhookUrl, cmsId, priority = 'normal' } = req.body;
    
    // 验证文件存在
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 创建处理任务
    const processingJob = new ProcessingJob({
      fileId,
      type,
      inputPath: file.path,
      outputPath: '', // 将由处理器设置
      parameters,
      webhookUrl,
      cmsId,
      priority,
      status: 'pending'
    });

    await processingJob.save();

    // 更新文件状态
    await File.findByIdAndUpdate(fileId, {
      processingStatus: 'pending',
      processingTaskId: processingJob._id
    });

    // 将任务加入队列
    const QueueManager = require('../services/QueueManager');
    await QueueManager.addJob(processingJob._id, priority);

    res.json({
      taskId: processingJob._id,
      status: processingJob.status,
      estimatedDuration: getEstimatedDuration(type, parameters),
      monitoringUrl: `/api/processing/status/${processingJob._id}`,
      webhookUrl: processingJob.webhookUrl
    });

  } catch (error) {
    console.error('Error creating processing task:', error);
    res.status(500).json({ error: 'Failed to create processing task' });
  }
});

// 获取任务状态
processingRouter.get('/status/:taskId', async (req, res) => {
  try {
    const task = await ProcessingJob.findById(req.params.taskId)
      .populate('fileId', 'originalName filename size mimeType');

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const response = {
      taskId: task._id,
      status: task.status,
      progress: task.progress,
      file: {
        id: task.fileId._id,
        originalName: task.fileId.originalName,
        filename: task.fileId.filename,
        size: task.fileId.size,
        mimeType: task.fileId.mimeType
      },
      type: task.type,
      parameters: task.parameters,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      result: task.result,
      error: task.error,
      estimatedDuration: getEstimatedDuration(task.type, task.parameters)
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting task status:', error);
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

// 获取用户的所有任务
processingRouter.get('/tasks', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;

    const tasks = await ProcessingJob.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('fileId', 'originalName filename size mimeType');

    const total = await ProcessingJob.countDocuments(query);

    res.json({
      tasks,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// 取消任务
processingRouter.post('/cancel/:taskId', async (req, res) => {
  try {
    const task = await ProcessingJob.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status === 'completed' || task.status === 'failed') {
      return res.status(400).json({ error: 'Cannot cancel completed task' });
    }

    task.status = 'cancelled';
    task.completedAt = new Date();
    await task.save();

    // 更新文件状态
    await File.findByIdAndUpdate(task.fileId, {
      processingStatus: 'cancelled'
    });

    // 从队列中移除
    const QueueManager = require('../services/QueueManager');
    await QueueManager.removeJob(task._id);

    res.json({
      taskId: task._id,
      status: task.status,
      message: 'Task cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling task:', error);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

// ===== 4. 辅助函数 =====

function getEstimatedDuration(type, parameters) {
  const baseDurations = {
    'video-transcode': 60,
    'audio-convert': 30,
    'image-resize': 10,
    'video-thumbnail': 15
  };

  const baseDuration = baseDurations[type] || 30;
  
  // 根据文件大小和处理参数估算时间
  const sizeMultiplier = parameters.size ? Math.log(parameters.size / 1000000) : 1;
  const qualityMultiplier = parameters.quality ? parameters.quality / 100 : 1;
  
  return Math.round(baseDuration * sizeMultiplier * qualityMultiplier);
}

// ===== 5. 使用示例 =====

/*
// 客户端使用示例：
const client = new MediaUploadClient(
  'https://your-media-server.com',
  'your-api-key',
  'your-api-secret'
);

// 单文件上传和处理
const file = document.getElementById('video-file').files[0];
const result = await client.uploadAndProcess(
  file,
  {
    type: 'video-transcode',
    parameters: {
      format: 'mp4',
      width: 1920,
      height: 1080,
      quality: 80,
      bitrate: '5000k'
    }
  },
  'https://your-cms.com/webhook/media-processed',
  'your-cms-id'
);

console.log('上传结果:', result);

// 批量上传和处理
const files = Array.from(document.getElementById('multiple-files').files);
const batchResult = await client.batchUploadAndProcess(
  files,
  {
    type: 'image-resize',
    parameters: {
      format: 'webp',
      width: 800,
      height: 600,
      quality: 85
    }
  },
  'https://your-cms.com/webhook/batch-processed',
  'your-cms-id'
);

console.log('批量处理结果:', batchResult);
*/

module.exports = { MediaUploadClient, processingRouter };