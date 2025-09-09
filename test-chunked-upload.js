const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// 配置
const API_KEY = 'cms_f2063ee4a29cd5377b6be7923380efbe531e209fae2f223e07bed46f59555564';
const API_SECRET = '19cfa5a3c3fafd4237ac6b1ffe2107b64d05039b40a2042c155e9b8519b002b548889c0f7cdcb7b5f89efb1f817ab8d4';
const BASE_URL = 'http://localhost:3001';
const TEST_FILE_PATH = path.join(__dirname, 'test-files', 'test.zip');
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// API客户端
class ApiClient {
  constructor() {
    this.baseURL = BASE_URL;
    this.apiKey = API_KEY;
    this.apiSecret = API_SECRET;
  }

  async request(method, endpoint, data = null, options = {}) {
    const config = {
      method,
      url: `${this.baseURL}${endpoint}`,
      headers: {
        'X-API-Key': this.apiKey,
        'X-API-Secret': this.apiSecret,
        'Content-Type': 'application/json'
      },
      ...options
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`API请求失败: ${endpoint}`, error.response?.data || error.message);
      throw error;
    }
  }

  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  async uploadFile(endpoint, fileData, options = {}) {
    const formData = new FormData();

    for (const [key, value] of Object.entries(fileData)) {
      if (key === 'chunk' && Buffer.isBuffer(value)) {
        // 将Buffer作为文件流添加到FormData
        formData.append(key, value, {
          filename: 'chunk',
          contentType: 'application/octet-stream'
        });
      } else {
        formData.append(key, value);
      }
    }

    const config = {
      headers: {
        'X-API-Key': this.apiKey,
        'X-API-Secret': this.apiSecret,
        ...formData.getHeaders()
      },
      ...options
    };

    try {
      const response = await axios.post(`${this.baseURL}${endpoint}`, formData, config);
      return response.data;
    } catch (error) {
      console.error(`文件上传失败: ${endpoint}`, error.response?.data || error.message);
      throw error;
    }
  }
}

// 切片上传管理器
class ChunkedUploader {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async uploadFile(filePath, chunkSize = CHUNK_SIZE) {
    try {
      // 1. 获取文件信息
      const stats = fs.statSync(filePath);
      const filename = path.basename(filePath);
      const fileSize = stats.size;
      const totalChunks = Math.ceil(fileSize / chunkSize);

      console.log(`开始上传文件: ${filename}`);
      console.log(`文件大小: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`分块数量: ${totalChunks}`);
      console.log(`分块大小: ${(chunkSize / 1024 / 1024).toFixed(2)}MB`);

      // 2. 初始化切片上传
      console.log('\n1. 初始化切片上传...');
      const initResult = await this.apiClient.post('/api/upload/chunked/init', {
        filename,
        fileSize,
        contentType: 'application/zip',
        chunkSize
      });

      console.log('初始化结果:', initResult);
      const { uploadId } = initResult;

      // 3. 读取文件并分块上传
      console.log('\n2. 开始分块上传...');
      const fileBuffer = fs.readFileSync(filePath);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkData = fileBuffer.subarray(start, end);

        console.log(`上传分块 ${i + 1}/${totalChunks} (${(chunkData.length / 1024 / 1024).toFixed(2)}MB)`);

        const uploadResult = await this.apiClient.uploadFile(`/api/upload/chunked/upload/${uploadId}`, {
          chunk: chunkData,
          chunkIndex: i.toString()
        });

        console.log(`分块 ${i + 1} 上传完成，进度: ${uploadResult.progress}%`);
      }

      // 4. 等待自动完成或手动完成
      console.log('\n3. 等待上传完成...');
      let completed = false;
      let attempts = 0;

      while (!completed && attempts < 10) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒

        try {
          const status = await this.apiClient.get(`/api/upload/chunked/status/${uploadId}`);
          console.log(`上传状态: ${status.status}, 进度: ${status.progress}%`);

          if (status.status === 'completed') {
            completed = true;
            console.log('上传完成!');
            console.log('最终文件信息:', {
              fileId: status.fileId,
              filename: status.filename,
              size: status.fileSize,
              path: status.path,
              fileRecord: status.fileRecord
            });
            return { uploadId, status };
          }
        } catch (error) {
          console.log('检查状态失败，重试中...');
        }
      }

      if (!completed) {
        console.log('上传可能未完全完成，但继续处理...');
        return { uploadId, status: { status: 'unknown' } };
      }

    } catch (error) {
      console.error('切片上传失败:', error);
      throw error;
    }
  }
}

// 压缩包处理器
class ArchiveProcessor {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async processArchive(fileId, parameters = {}) {
    try {
      console.log('\n4. 创建压缩包处理任务...');

      const jobData = {
        fileId,
        type: 'archive-process',
        parameters: {
          extractImages: true,
          convertToWebp: true,
          quality: 80,
          preserveMetadata: true,
          ...parameters
        },
        webhookUrl: 'http://localhost:3002/webhook' // Webhook测试服务器
      };

      const job = await this.apiClient.post('/api/processing/job', jobData);
      console.log('处理任务创建成功:', job);

      // 5. 监控处理进度
      console.log('\n5. 监控处理进度...');
      return await this.monitorJobProgress(job.id);

    } catch (error) {
      console.error('压缩包处理失败:', error);
      throw error;
    }
  }

  async monitorJobProgress(jobId, maxAttempts = 60) {
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 5000)); // 每5秒检查一次

      try {
        const jobStatus = await this.apiClient.get(`/api/processing/job/${jobId}`);
        console.log(`任务状态: ${jobStatus.status}, 进度: ${jobStatus.progress}%`);

        if (jobStatus.status === 'completed') {
          console.log('处理完成!');
          console.log('处理结果:', JSON.stringify(jobStatus.result, null, 2));
          return jobStatus;
        } else if (jobStatus.status === 'failed') {
          console.error('处理失败:', jobStatus.error);
          throw new Error(`处理失败: ${jobStatus.error?.message || '未知错误'}`);
        }
      } catch (error) {
        console.log(`检查任务状态失败 (尝试 ${attempts}/${maxAttempts})`);
      }
    }

    throw new Error('监控超时');
  }
}

// 主测试函数
async function runTest() {
  try {
    console.log('=== 开始切片上传和压缩包处理测试 ===\n');

    // 检查测试文件是否存在
    if (!fs.existsSync(TEST_FILE_PATH)) {
      throw new Error(`测试文件不存在: ${TEST_FILE_PATH}`);
    }

    // 初始化API客户端
    const apiClient = new ApiClient();
    const chunkedUploader = new ChunkedUploader(apiClient);
    const archiveProcessor = new ArchiveProcessor(apiClient);

    // 执行切片上传
    const uploadResult = await chunkedUploader.uploadFile(TEST_FILE_PATH);

    // 等待一会儿确保文件处理完成
    console.log('\n等待文件系统同步...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 创建压缩包处理任务
    // 注意：这里需要使用上传后返回的文件ID
    // 由于我们不知道具体的文件ID，这里假设使用文件名或其他标识符
    // 实际使用时需要根据返回的文件信息来获取正确的fileId
    console.log('\n注意: 实际使用时需要替换为正确的文件ID');
    console.log('当前上传的文件信息:', uploadResult.status);

    // 如果有文件ID，执行压缩包处理
    if (uploadResult.status && uploadResult.status.fileId) {
      console.log('\n开始压缩包处理...');
      console.log('使用文件ID:', uploadResult.status.fileId);

      try {
        const processResult = await archiveProcessor.processArchive(uploadResult.status.fileId);
        console.log('\n=== 测试完成 ===');
        console.log('最终处理结果:', processResult);
      } catch (error) {
        console.error('压缩包处理失败:', error);
      }
    } else {
      console.log('未获取到文件ID，跳过处理步骤');
    }

  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runTest()
    .then(() => {
      console.log('\n测试脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('测试脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { runTest, ApiClient, ChunkedUploader, ArchiveProcessor };