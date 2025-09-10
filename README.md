# Media Processing Server / 媒体处理服务器

A comprehensive file storage and processing system similar to S3 pre-signed URL uploads, built with Express.js, MongoDB, and Socket.IO. Features real-time progress updates for video transcoding and media processing.

一个类似 S3 预签名 URL 上传的综合文件存储和处理系统，使用 Express.js、MongoDB 和 Socket.IO 构建。具有视频转码和媒体处理的实时进度更新功能。

## Features / 功能特性

- **Secure file uploads** with temporary URLs / 使用临时 URL 进行安全文件上传
- **Local file storage** with organized directory structure / 文件以有组织的目录结构本地存储
- **Real-time progress updates** via WebSocket / 通过 WebSocket 进行实时进度更新
- **API key authentication** with granular permissions / 具有细粒度权限的 API 密钥认证
- **Third-party CMS integration** with webhook support / 支持 webhook 的第三方 CMS 集成

## Table of Contents / 目录

- [预签名上传](#预签名上传-presigned-uploads)
  - [小文件上传](#小文件上传)
  - [切片上传](#切片上传)
- [文件处理](#文件处理-file-processing)
  - [音频处理](#音频处理-audio-processing)
  - [视频处理](#视频处理-video-processing)
  - [图片处理](#图片处理-image-processing)
  - [压缩包处理](#压缩包处理-archive-processing)
- [文件管理](#文件管理-file-management)
  - [文件操作](#文件操作)
  - [批量操作](#批量操作)
- [Webhook 通知](#webhook通知-webhook-notifications)
  - [音频视频图片处理](#音频视频图片处理-webhooks)
  - [压缩包处理](#压缩包处理-webhooks)
- [Socket.IO 实时通信](#socketio实时通信)
  - [事件类型](#事件类型)
  - [客户端集成](#客户端集成)
- [安装配置](#安装配置)
- [API 文档](#api文档)

## 预签名上传 (Presigned Uploads)

### 小文件上传

使用预签名 URL 进行安全的小文件上传，支持临时 URL 验证。

**生成签名 URL:**

```http
POST /api/upload/generate-signed-url
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "filename": "image.jpg",
  "contentType": "image/jpeg",
  "expiresIn": 3600
}
```

**响应格式:**

```json
{
  "uploadUrl": "/api/upload/file/{signed-token}",
  "fileId": "generated-file-id",
  "expiresIn": 3600,
  "headers": {
    "Content-Type": "image/jpeg",
    "X-File-Name": "image.jpg"
  }
}
```

**上传文件:**

```http
POST /api/upload/file/{signed-token}
Content-Type: multipart/form-data
X-API-Key: your-api-key
X-API-Secret: your-api-secret

file: [binary data]
```

**上传成功响应:**

```json
{
  "id": "file-id",
  "originalName": "image.jpg",
  "filename": "unique-filename.jpg",
  "size": 1024000,
  "mimeType": "image/jpeg",
  "uploadDate": "2023-01-01T00:00:00.000Z",
  "message": "File uploaded successfully"
}
```

### 切片上传

支持大文件（>5GB）的分块上传，具有断点续传功能。

**初始化切片上传:**

```http
POST /api/upload/chunked/init
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "filename": "large-video.mp4",
  "fileSize": 5368709120,
  "contentType": "video/mp4",
  "chunkSize": 5242880
}
```

**初始化响应格式:**

```json
{
  "uploadId": "unique-upload-id",
  "chunkSize": 5242880,
  "totalChunks": 1024,
  "uploadUrl": "/api/upload/chunk/unique-upload-id",
  "expiresAt": "2023-01-01T01:00:00.000Z"
}
```

**上传文件块:**

```http
POST /api/upload/chunk/{uploadId}
Content-Type: multipart/form-data
X-API-Key: your-api-key
X-API-Secret: your-api-secret

chunk: [binary data]
chunkIndex: 0
```

**文件块上传响应格式:**

```json
{
  "uploadId": "unique-upload-id",
  "chunkIndex": 0,
  "receivedChunks": 1,
  "totalChunks": 1024,
  "progress": 0,
  "status": "uploading"
}
```

**完成上传:**

```http
POST /api/upload/complete/{uploadId}
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

**完成上传响应格式:**

```json
{
  "uploadId": "unique-upload-id",
  "status": "completed",
  "filename": "unique-filename.mp4",
  "path": "/path/to/uploads/unique-filename.mp4",
  "size": 5368709120,
  "contentType": "video/mp4"
}
```

**获取上传状态:**

```http
GET /api/upload/chunked/status/{uploadId}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

**上传状态响应格式:**

```json
{
  "uploadId": "unique-upload-id",
  "filename": "large-video.mp4",
  "fileSize": 5368709120,
  "chunkSize": 5242880,
  "totalChunks": 1024,
  "receivedChunks": 512,
  "progress": 50,
  "status": "uploading",
  "createdAt": "2023-01-01T00:00:00.000Z",
  "completedAt": "2023-01-01T00:30:00.000Z",
  "expiresAt": "2023-01-01T01:00:00.000Z"
}
```

## 文件处理 (File Processing)

### 音频处理 (Audio Processing)

支持多种音频格式的转换和处理。

**支持的格式:** MP3, AAC, OGG, WAV, FLAC

**处理参数:**

```json
{
  "type": "audio-convert",
  "parameters": {
    "format": "mp3",
    "quality": "high",
    "sampleRate": 44100,
    "channels": 2,
    "bitrate": "192k"
  }
}
```

**质量设置:**

- **Low**: 低质量，小文件
- **Medium**: 中等质量
- **High**: 高质量
- **Very High**: 超高质量

### 视频处理 (Video Processing)

视频转码、分辨率调整和格式转换。

**支持的格式:** MP4, WebM, MOV, AVI

**处理参数:**

```json
{
  "type": "video-transcode",
  "parameters": {
    "width": 1920,
    "height": 1080,
    "format": "mp4",
    "bitrate": "2000k"
  }
}
```

**HLS 流媒体:**

```json
{
  "type": "video-hls",
  "parameters": {
    "segmentDuration": 10,
    "resolution": "1920x1080"
  }
}
```

### 图片处理 (Image Processing)

图片格式转换、调整大小和质量优化。

**支持的格式:** JPEG, PNG, WebP

**处理参数:**

```json
{
  "type": "image-convert",
  "parameters": {
    "format": "webp",
    "width": 1920,
    "height": 1080,
    "quality": 80
  }
}
```

### 压缩包处理 (Archive Processing)

针对已上传的压缩包文件进行解压和处理。

**支持的格式:** ZIP, 7z

**创建压缩包处理任务:**

```http
POST /api/processing/job
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "fileId": "archive-file-id",
  "type": "archive-process",
  "parameters": {
    "extractImages": true,
    "convertToWebp": true,
    "quality": 80,
    "preserveMetadata": true
  },
  "webhookUrl": "https://your-cms.com/webhook",
  "webhookSecret": "your-webhook-secret"
}
```

**处理流程:**

1. 验证文件是否为支持的压缩包格式
2. 安全解压到临时目录（防止路径遍历攻击）
3. 验证解压内容（文件数量、大小限制）
4. 提取图片文件并转换为 WebP 格式
5. 清理临时文件
6. 发送处理结果通知

**安全特性:**

- **文件数量限制**: 最多 5000 个文件
- **大小限制**: 最大 2GB 解压内容
- **路径遍历防护**: 防止恶意路径攻击
- **超时控制**: 5 分钟处理超时
- **图片数量限制**: 最少 5 张，最多 5000 张图片

**切片上传安全特性:**

- **会话过期**: 上传会话 24 小时后自动过期
- **自动清理**: 每小时清理过期会话和临时文件
- **状态验证**: 每次操作都会检查会话有效性
- **资源管理**: 防止未完成的上传占用磁盘空间

**处理参数说明:**

- `extractImages`: 是否提取图片文件
- `convertToWebp`: 是否转换为 WebP 格式
- `quality`: WebP 转换质量 (1-100)
- `preserveMetadata`: 是否保留原始元数据

## 文件管理 (File Management)

### 文件操作

**列出文件:**

```http
GET /api/upload/files?page=1&limit=10&type=image
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

**下载文件:**

```http
GET /api/upload/file/{id}/download
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

**删除文件:**

```http
DELETE /api/upload/file/{id}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

**获取文件信息:**

```http
GET /api/upload/file/{id}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

### 批量操作

**创建批量处理任务:**

```http
POST /api/processing/batch
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "fileIds": ["file1", "file2", "file3"],
  "processingType": "image-convert",
  "parameters": {
    "format": "webp",
    "quality": 80
  },
  "webhookUrl": "https://your-cms.com/webhook"
}
```

**批量任务状态:**

```http
GET /api/processing/batch/{batchId}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

## Webhook 通知 (Webhook Notifications)

### 音频视频图片处理 Webhooks

**处理完成通知:**

```json
{
  "jobId": "job-id",
  "status": "completed",
  "progress": 100,
  "result": {
    "outputPath": "/processed/file.mp4",
    "size": 1024000,
    "format": "mp4",
    "duration": 120,
    "bitrate": "2000k",
    "width": 1920,
    "height": 1080
  },
  "cmsId": "cms-id",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

**处理失败通知:**

```json
{
  "jobId": "job-id",
  "status": "failed",
  "progress": 0,
  "error": "Error message describing the failure",
  "cmsId": "cms-id",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

### 压缩包处理 Webhooks

**压缩包处理完成:**

```json
{
  "results": [
    {
      "url": "/api/processed/image1.webp",
      "width": 1920,
      "height": 1080,
      "originalName": "image1.jpg",
      "size": 256000
    },
    {
      "url": "/api/processed/image2.webp",
      "width": 1280,
      "height": 720,
      "originalName": "image2.png",
      "size": 128000
    }
  ],
  "cmsId": "your-cms-id",
  "status": "completed",
  "totalImages": 2,
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

## Socket.IO 实时通信

### 事件类型

**任务进度更新:**

```javascript
socket.on("job-progress", (data) => {
  console.log("Job progress:", data);
  // data.status: 'processing', 'completed', 'failed'
  // data.progress: 0-100
  // data.result: 处理结果
});
```

**批量处理进度:**

```javascript
socket.on("batch-progress", (data) => {
  console.log("Batch progress:", data);
  // data.completedFiles, data.totalFiles
  // data.progress: 0-100
});
```

**压缩包处理进度:**

```javascript
socket.on("archive-progress", (data) => {
  console.log("Archive progress:", data);
  // data.progress: 0-100
  // data.currentFile: 当前处理的文件
  // data.processedFiles, data.totalFiles
});
```

### 客户端集成

**JavaScript 示例:**

```javascript
const socket = io("http://localhost:3000");

// 连接服务器
socket.on("connect", () => {
  console.log("Connected to server");

  // 订阅任务更新
  socket.emit("subscribe-job", "job-id");

  // 订阅批量更新
  socket.emit("subscribe-batch", "batch-id");

  // 订阅压缩包更新
  socket.emit("subscribe-archive", "cms-id");
});

// 监听任务进度
socket.on("job-progress", (data) => {
  if (data.status === "completed") {
    console.log("Processing completed!");
    console.log("Output file:", data.result.outputPath);
  }
});
```

**Python 示例:**

```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print('Connected to server')
    sio.emit('subscribe-job', 'job-id')

@sio.on('job-progress')
def on_job_progress(data):
    print(f'Job progress: {data}')
    if data['status'] == 'completed':
        print('Processing completed!')

sio.connect('http://localhost:3000')
sio.wait()
```

## 安装配置 (Installation)

### 系统要求

- **Node.js** v14+
- **MongoDB** v4.0+
- **FFmpeg** - 视频音频处理
- **7-Zip** - 压缩包处理

### 安装步骤

1. **克隆仓库并安装依赖:**

```bash
git clone <repository-url>
cd cms-back
npm install
```

2. **安装系统依赖:**

```bash
# macOS
brew install p7zip

# Ubuntu/Debian
sudo apt-get install p7zip-full

# CentOS/RHEL
sudo yum install p7zip p7zip-plugins
```

3. **配置环境变量:**

```bash
cp .env.example .env
# 编辑.env文件，配置数据库连接等
```

4. **启动服务:**

```bash
# 开发环境
npm run dev

# 生产环境
npm start
```

### 环境变量配置

```bash
PORT=3000
MONGODB_URI=mongodb://localhost:27017/cms-back
JWT_SECRET=your-jwt-secret
UPLOAD_DIR=./uploads
PROCESSED_DIR=./processed
FFMPEG_PATH=/usr/local/bin/ffmpeg
FFPROBE_PATH=/usr/local/bin/ffprobe
7Z_PATH=/usr/local/bin/7z
```

## API 文档 (API Documentation)

### 认证

所有 API 请求都需要 API 密钥认证：

```http
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

### 主要端点

**上传相关:**

- `POST /api/upload/generate-signed-url` - 生成签名 URL
- `POST /api/upload/file/{signed-token}` - 上传文件
- `POST /api/upload/chunked/init` - 初始化切片上传
- `POST /api/upload/chunk/{uploadId}` - 上传文件块
- `POST /api/upload/complete/{uploadId}` - 完成切片上传
- `GET /api/upload/status/{uploadId}` - 获取上传状态

**文件管理:**

- `GET /api/upload/files` - 列出文件
- `GET /api/upload/file/{id}` - 获取文件信息
- `GET /api/upload/file/{id}/download` - 下载文件
- `DELETE /api/upload/file/{id}` - 删除文件

**处理任务:**

- `POST /api/processing/job` - 创建处理任务
- `GET /api/processing/job/{id}` - 获取任务状态
- `GET /api/processing/jobs` - 列出任务
- `DELETE /api/processing/job/{id}` - 删除任务

**批量处理:**

- `POST /api/processing/batch` - 创建批量处理任务
- `GET /api/processing/batch/{batchId}` - 获取批量任务状态

详细的 API 文档请参考各功能章节的具体示例。

## 安全特性 (Security Features)

- **API 密钥认证** - 基于密钥/密钥对的安全访问
- **请求限流** - 防止 API 滥用
- **文件大小限制** - 可配置的上传限制
- **临时签名 URL** - 具有过期时间的安全上传 URL
- **源站验证** - CORS 保护和 origin 验证
- **安全头** - Helmet 安全头配置

## 错误处理 (Error Handling)

API 返回适当的 HTTP 状态码和错误消息：

- `400` Bad Request - 无效的请求参数
- `401` Unauthorized - 无效的 API 凭据
- `403` Forbidden - 权限不足
- `404` Not Found - 资源未找到
- `500` Internal Server Error - 服务器错误

## 使用示例 (Usage Examples)

### 完整的上传和处理流程

```javascript
// 1. 生成签名URL
const signedResponse = await fetch("/api/upload/generate-signed-url", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-API-Secret": apiSecret,
  },
  body: JSON.stringify({
    filename: "video.mp4",
    contentType: "video/mp4",
  }),
});

const { uploadUrl } = await signedResponse.json();

// 2. 上传文件
const formData = new FormData();
formData.append("file", file);
await fetch(uploadUrl, { method: "POST", body: formData });

// 3. 创建处理任务
const jobResponse = await fetch("/api/processing/job", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-API-Secret": apiSecret,
  },
  body: JSON.stringify({
    fileId: "file-id",
    type: "video-transcode",
    parameters: {
      width: 1920,
      height: 1080,
      format: "mp4",
    },
    webhookUrl: "https://your-cms.com/webhook",
  }),
});

const { id: jobId } = await jobResponse.json();

// 4. 通过WebSocket监听进度
const socket = io("http://localhost:3000");
socket.emit("subscribe-job", jobId);
socket.on("job-progress", (data) => {
  console.log(`Progress: ${data.progress}%`);
});
```

### 大文件切片上传示例

```javascript
// 初始化切片上传
const initResponse = await fetch("/api/upload/chunked/init", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-API-Secret": apiSecret,
  },
  body: JSON.stringify({
    filename: "large-video.mp4",
    fileSize: 5368709120, // 5GB
    contentType: "video/mp4",
    chunkSize: 5242880, // 5MB chunks
  }),
});

const { uploadId, totalChunks } = await initResponse.json();

// 上传文件块
for (let i = 0; i < totalChunks; i++) {
  const chunk = getChunkData(i);
  const formData = new FormData();
  formData.append("chunk", chunk);
  formData.append("chunkIndex", i);

  await fetch(`/api/upload/chunked/upload/${uploadId}`, {
    method: "POST",
    body: formData,
    headers: {
      "X-API-Key": apiKey,
      "X-API-Secret": apiSecret,
    },
  });
}

// 完成上传
await fetch(`/api/upload/chunked/complete/${uploadId}`, {
  method: "POST",
  headers: {
    "X-API-Key": apiKey,
    "X-API-Secret": apiSecret,
  },
});
```

## 贡献 (Contributing)

欢迎提交问题报告和功能请求。请遵循以下步骤：

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证 (License)

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 支持 (Support)

如有问题或需要帮助，请：

1. 查看 [Issues](https://github.com/your-repo/issues) 页面
2. 创建新的 Issue 描述问题
3. 联系维护团队

---

**Media Processing Server** - 一个功能强大的媒体处理和文件管理平台
