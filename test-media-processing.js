#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const API_KEY = 'cms_f2063ee4a29cd5377b6be7923380efbe531e209fae2f223e07bed46f59555564';
const API_SECRET = '19cfa5a3c3fafd4237ac6b1ffe2107b64d05039b40a2042c155e9b8519b002b548889c0f7cdcb7b5f89efb1f817ab8d4';
const BASE_URL = 'http://localhost:3001';
class MediaProcessingTest {
  constructor(baseUrl, apiKey, apiSecret) {
    this.baseUrl = BASE_URL;
    this.apiKey = API_KEY;
    this.apiSecret = API_SECRET;
    this.testResults = [];
  }

  // 通用请求方法
  async request(method, endpoint, data = null, headers = {}) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret,
          ...headers
        }
      };

      if (data && method !== 'GET') {
        if (headers['Content-Type'] === 'multipart/form-data') {
          config.data = data;
        } else {
          config.data = JSON.stringify(data);
          config.headers['Content-Type'] = 'application/json';
        }
      }

      const response = await axios(config);
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  // 生成签名URL
  async generateSignedUrl(filename, contentType) {
    const result = await this.request('POST', '/api/upload/generate-signed-url', {
      filename,
      contentType: 'application/octet-stream',
      expiresIn: 3600
    });

    if (!result.success) {
      throw new Error(`Failed to generate signed URL: ${result.error}`);
    }

    return result.data;
  }

  // 上传文件
  async uploadFile(filePath, options = {}) {
    try {
      // 1. 生成签名URL
      const signedUrlData = await this.generateSignedUrl(
        path.basename(filePath),
        'application/octet-stream'
      );

      // 2. 上传文件
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));

      // 添加自定义头部
      const headers = {
        'Content-Type': 'multipart/form-data',
        'X-Callback-Url': options.callbackUrl || null,
        'X-Webhook-Secret': options.webhookSecret || null,
        'X-CMS-ID': options.cmsId || 'test'
      };

      const result = await this.request(
        'POST',
        `/api/upload/file/${signedUrlData.uploadToken}`,
        formData,
        headers
      );

      this.logResult('Upload File', result, path.basename(filePath));
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 创建处理任务
  async createProcessingTask(fileId, type, parameters, webhookUrl = null, cmsId = 'test') {
    const taskData = {
      fileId,
      type,
      parameters,
      webhookUrl,
      cmsId
    };

    const result = await this.request('POST', '/api/processing/job', taskData);
    this.logResult('Create Processing Task', result, `${type} - ${fileId}`);
    return result;
  }

  // 监控任务状态
  async monitorTask(taskId, maxAttempts = 60, interval = 2000) {
    console.log(`\n🔄 Monitoring task ${taskId}...`);

    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.request('GET', `/api/processing/job/${taskId}`);

      if (result.success) {
        const { status, progress, error } = result.data;
        console.log(`   Status: ${status}, Progress: ${progress}%`);

        if (status === 'completed') {
          this.logResult('Task Completed', result, taskId);
          return result;
        } else if (status === 'failed') {
          this.logResult('Task Failed', result, taskId);
          return result;
        }
      } else {
        console.log(`   Error checking status: ${result.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return { success: false, error: 'Task monitoring timeout' };
  }

  // 测试视频处理
  async testVideoProcessing() {
    console.log('\n🎥 Testing Video Processing...');

    const videoPath = path.join(__dirname, 'test-files', 'test.mp4');

    // 1. 上传视频文件
    const uploadResult = await this.uploadFile(videoPath, {
      processingType: 'video-transcode',
      cmsId: 'test-video'
    });

    if (!uploadResult.success) {
      this.testResults.push({
        test: 'Video Processing',
        status: 'FAILED',
        error: uploadResult.error
      });
      return;
    }

    // 2. 创建视频转码任务 (CRF 23)
    const taskResult = await this.createProcessingTask(
      uploadResult.data.id,
      'video-transcode',
      {
        format: 'mp4',
        width: 1280,
        height: 720,
        quality: 23, // CRF value (number)
        bitrate: '5000k'
      },
      null,
      'test-video'
    );

    const validation = this.validateTaskResult(taskResult, 'Video Processing');
    if (!validation.valid) {
      this.testResults.push({
        test: 'Video Processing',
        status: 'FAILED',
        error: validation.error
      });
      return;
    }

    // 3. 监控任务
    const monitorResult = await this.monitorTask(validation.taskId);

    this.testResults.push({
      test: 'Video Processing (CRF 23)',
      status: monitorResult.success ? 'PASSED' : 'FAILED',
      taskId: taskResult.data.id,
      result: monitorResult.data
    });
  }

  // 测试音频处理
  async testAudioProcessing() {
    console.log('\n🎵 Testing Audio Processing...');

    const audioPath = path.join(__dirname, 'test-files', 'test.aac');

    // 1. 上传音频文件
    const uploadResult = await this.uploadFile(audioPath, {
      processingType: 'audio-convert',
      cmsId: 'test-audio'
    });

    if (!uploadResult.success) {
      this.testResults.push({
        test: 'Audio Processing',
        status: 'FAILED',
        error: uploadResult.error
      });
      return;
    }

    // 2. 创建音频转换任务 (转MP3)
    const taskResult = await this.createProcessingTask(
      uploadResult.data.id,
      'audio-convert',
      {
        format: 'mp3',
        bitrate: '192k',
        sampleRate: 44100,
        channels: 2,
        quality: 192 // 数字质量值，而不是字符串
      },
      null,
      'test-audio'
    );

    if (!taskResult.success) {
      this.testResults.push({
        test: 'Audio Processing',
        status: 'FAILED',
        error: taskResult.error
      });
      return;
    }

    // 3. 监控任务
    const monitorResult = await this.monitorTask(taskResult.data.id);

    this.testResults.push({
      test: 'Audio Processing (MP3)',
      status: monitorResult.success ? 'PASSED' : 'FAILED',
      taskId: taskResult.data.id,
      result: monitorResult.data
    });
  }

  // 测试图片处理
  async testImageProcessing() {
    console.log('\n🖼️  Testing Image Processing...');

    const imagePath = path.join(__dirname, 'test-files', 'test.png');

    // 1. 上传图片文件
    const uploadResult = await this.uploadFile(imagePath, {
      processingType: 'image-resize',
      cmsId: 'test-image'
    });

    if (!uploadResult.success) {
      this.testResults.push({
        test: 'Image Processing',
        status: 'FAILED',
        error: uploadResult.error
      });
      return;
    }

    // 2. 创建图片转换任务 (转WebP)
    const taskResult = await this.createProcessingTask(
      uploadResult.data.id,
      'image-resize',
      {
        format: 'webp',
        width: 400,
        height: 300,
        quality: 85 // 数字质量值
      },
      null,
      'test-image'
    );

    if (!taskResult.success) {
      this.testResults.push({
        test: 'Image Processing',
        status: 'FAILED',
        error: taskResult.error
      });
      return;
    }

    // 3. 监控任务
    const monitorResult = await this.monitorTask(taskResult.data.id);

    this.testResults.push({
      test: 'Image Processing (WebP)',
      status: monitorResult.success ? 'PASSED' : 'FAILED',
      taskId: taskResult.data.id,
      result: monitorResult.data
    });
  }

  // 测试视频缩略图生成
  async testThumbnailGeneration() {
    console.log('\n🎬 Testing Thumbnail Generation...');

    const videoPath = path.join(__dirname, 'test-files', 'test.mp4');

    // 1. 上传视频文件
    const uploadResult = await this.uploadFile(videoPath, {
      processingType: 'video-thumbnail',
      cmsId: 'test-thumbnail'
    });

    if (!uploadResult.success) {
      this.testResults.push({
        test: 'Thumbnail Generation',
        status: 'FAILED',
        error: uploadResult.error
      });
      return;
    }

    // 2. 创建缩略图生成任务
    const taskResult = await this.createProcessingTask(
      uploadResult.data.id,
      'video-thumbnail',
      {
        size: '320x240',
        thumbnailTime: 2 // 2秒处生成缩略图
      },
      null,
      'test-thumbnail'
    );

    if (!taskResult.success) {
      this.testResults.push({
        test: 'Thumbnail Generation',
        status: 'FAILED',
        error: taskResult.error
      });
      return;
    }

    // 3. 监控任务
    const monitorResult = await this.monitorTask(taskResult.data.id);

    this.testResults.push({
      test: 'Thumbnail Generation',
      status: monitorResult.success ? 'PASSED' : 'FAILED',
      taskId: taskResult.data.id,
      result: monitorResult.data
    });
  }

  // 测试批量处理
  async testBatchProcessing() {
    console.log('\n📦 Testing Batch Processing...');

    const files = [
      path.join(__dirname, 'test-files', 'test.mp4'),
      path.join(__dirname, 'test-files', 'test.aac'),
      path.join(__dirname, 'test-files', 'test.png')
    ];

    // 1. 创建批量任务
    const batchData = {
      name: 'Test Batch Processing',
      description: 'Processing multiple media files',
      cmsId: 'test-batch',
      processingOptions: {
        type: 'image-resize',
        parameters: {
          format: 'webp',
          width: 300,
          height: 200,
          quality: 80 // 数字质量值
        }
      },
      webhookUrl: null
    };

    const batchResult = await this.request('POST', '/api/batch/batch', batchData);

    if (!batchResult.success) {
      this.testResults.push({
        test: 'Batch Processing',
        status: 'FAILED',
        error: batchResult.error
      });
      return;
    }

    // 2. 上传文件
    const fileIds = [];
    for (const filePath of files) {
      const uploadResult = await this.uploadFile(filePath, { cmsId: 'test-batch' });
      if (uploadResult.success) {
        fileIds.push(uploadResult.data.id);
      }
    }

    // 3. 添加文件到批量任务
    const addFilesResult = await this.request(
      'POST',
      `/api/batch/batch/${batchResult.data.id}/files`,
      { fileIds }
    );

    if (!addFilesResult.success) {
      this.testResults.push({
        test: 'Batch Processing',
        status: 'FAILED',
        error: addFilesResult.error
      });
      return;
    }

    // 4. 开始批量处理
    const startResult = await this.request(
      'POST',
      `/api/batch/batch/${batchResult.data.id}/start`
    );

    this.testResults.push({
      test: 'Batch Processing',
      status: startResult.success ? 'PASSED' : 'FAILED',
      batchId: batchResult.data.id,
      fileCount: fileIds.length
    });
  }

  // 记录测试结果
  logResult(testName, result, details = '') {
    if (result.success) {
      console.log(`✅ ${testName}: ${details} - SUCCESS`);
    } else {
      console.log(`❌ ${testName}: ${details} - FAILED - ${result.error}`);
    }
  }

  // 验证任务结果
  validateTaskResult(taskResult, testName) {
    if (!taskResult.success) {
      return { valid: false, error: taskResult.error };
    }

    if (!taskResult.data || !taskResult.data.id) {
      return { valid: false, error: 'No task ID returned from server' };
    }

    return { valid: true, taskId: taskResult.data.id };
  }

  // 运行所有测试
  async runAllTests() {
    console.log('🚀 Starting Media Processing Tests...');
    console.log('=====================================');

    // 检查测试文件
    const testFiles = ['test.mp4', 'test.aac', 'test.png'];
    const missingFiles = testFiles.filter(file =>
      !fs.existsSync(path.join(__dirname, 'test-files', file))
    );

    if (missingFiles.length > 0) {
      console.log('❌ Missing test files:', missingFiles.join(', '));
      console.log('Please run: ./create-test-files.sh');
      return;
    }

    // 运行测试
    await this.testVideoProcessing();
    await this.testAudioProcessing();
    await this.testImageProcessing();
    await this.testThumbnailGeneration();
    await this.testBatchProcessing();

    // 输出测试结果
    console.log('\n📊 Test Results Summary');
    console.log('=====================================');

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;

    this.testResults.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log('\n=====================================');
    console.log(`Total: ${this.testResults.length}, Passed: ${passed}, Failed: ${failed}`);

    if (failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log(`⚠️  ${failed} test(s) failed`);
    }
  }
}

// 使用示例
if (require.main === module) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const apiKey = process.env.API_KEY || 'cms_f2063ee4a29cd5377b6be7923380efbe531e209fae2f223e07bed46f59555564';
  const apiSecret = process.env.API_SECRET || '19cfa5a3c3fafd4237ac6b1ffe2107b64d05039b40a2042c155e9b8519b002b548889c0f7cdcb7b5f89efb1f817ab8d4';

  const tester = new MediaProcessingTest(baseUrl, apiKey, apiSecret);

  tester.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = MediaProcessingTest;