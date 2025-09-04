# Media Processing Server / 媒体处理服务器

A comprehensive file storage and processing system similar to S3 pre-signed URL uploads, built with Express.js, MongoDB, and Socket.IO. Features real-time progress updates for video transcoding and media processing.

一个类似S3预签名URL上传的综合文件存储和处理系统，使用Express.js、MongoDB和Socket.IO构建。具有视频转码和媒体处理的实时进度更新功能。

## Features / 功能特性

- **Pre-signed URL uploads** - Secure file uploads with temporary URLs / 预签名URL上传 - 使用临时URL进行安全文件上传
- **Local file storage** - Files stored locally with organized directory structure / 本地文件存储 - 文件以有组织的目录结构本地存储
- **Media processing APIs** - Support for video transcoding, image resizing, and thumbnail generation / 媒体处理API - 支持视频转码、图像调整大小和缩略图生成
- **Real-time progress updates** - WebSocket integration for live processing updates / 实时进度更新 - WebSocket集成实时处理更新
- **API key authentication** - Secure access with API key/secret pairs / API密钥认证 - 使用API密钥/密钥对进行安全访问
- **Third-party CMS integration** - Easy integration with external CMS systems / 第三方CMS集成 - 易于与外部CMS系统集成
- **Webhook notifications** - Automated callbacks when processing completes / Webhook通知 - 处理完成时自动回调
- **Multi-format support** - Video, audio, and image processing capabilities / 多格式支持 - 视频、音频和图像处理能力
- **Large file support** - Chunked upload support for files >5GB / 大文件支持 - 支持5GB以上文件的分块上传
- **Audio processing** - Convert to MP3, AAC, OGG with quality settings / 音频处理 - 转换为MP3、AAC、OGG并支持质量设置
- **Resumable uploads** - Upload progress tracking and resumption / 可恢复上传 - 上传进度跟踪和恢复
- **Archive processing** - Automatic extraction and processing of ZIP and 7z archives / 压缩包处理 - 自动解压和处理ZIP和7z压缩包
- **Image batch conversion** - Convert extracted images to WebP format with metadata / 图像批量转换 - 将提取的图像转换为WebP格式并保留元数据

## Installation / 安装

1. Clone the repository and install dependencies / 克隆仓库并安装依赖:
```bash
npm install
```

2. Install system dependencies for archive processing / 安装压缩包处理所需的系统依赖:
```bash
# macOS
brew install p7zip

# Ubuntu/Debian
sudo apt-get install p7zip-full

# CentOS/RHEL
sudo yum install p7zip p7zip-plugins
```

3. Set up environment variables / 设置环境变量:
```bash
cp .env.example .env
# Edit .env with your configuration / 编辑.env配置文件
```

4. Start MongoDB service / 启动MongoDB服务
5. Run the server / 运行服务器:
```bash
# Development / 开发环境
npm run dev

# Production / 生产环境
npm start
```

## API Documentation / API文档

### Authentication / 认证

All API requests require API key authentication using headers:
所有API请求都需要使用标头进行API密钥认证：
- `X-API-Key`: Your API key / 您的API密钥
- `X-API-Secret`: Your API secret / 您的API密钥

### Upload Endpoints / 上传端点

#### Generate Signed URL / 生成签名URL
```http
POST /api/upload/generate-signed-url
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "filename": "video.mp4",
  "contentType": "video/mp4",
  "expiresIn": 3600
}
```

#### Upload File / 上传文件
```http
POST /api/upload/file/{signed-token}
Content-Type: multipart/form-data
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

#### Chunked Upload (Large Files) / 分块上传（大文件）
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

```http
POST /api/upload/chunked/upload/{uploadId}
Content-Type: multipart/form-data
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "chunkIndex": 0,
  "chunk": [binary data]
}
```

### Processing Endpoints / 处理端点

#### Create Processing Job / 创建处理任务
```http
POST /api/processing/job
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "fileId": "file-id",
  "type": "video-transcode",
  "parameters": {
    "width": 1920,
    "height": 1080,
    "format": "mp4",
    "bitrate": "2000k"
  },
  "webhookUrl": "https://your-cms.com/webhook",
  "webhookSecret": "your-webhook-secret"
}

// Audio Conversion Example / 音频转换示例
{
  "fileId": "file-id",
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

#### Get Job Status / 获取任务状态
```http
GET /api/processing/job/{job-id}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

### CMS Integration Endpoints / CMS集成端点

#### Generate CMS Upload URL / 生成CMS上传URL
```http
POST /api/cms/upload-url
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "filename": "images.zip",
  "contentType": "application/zip",
  "callbackUrl": "https://your-cms.com/callback",
  "webhookSecret": "your-webhook-secret",
  "cmsId": "your-cms-id",
  "processingOptions": {
    "type": "archive-process",
    "parameters": {
      "extractImages": true,
      "convertToWebp": true,
      "quality": 80
    }
  }
}
```

**Response:**
```json
{
  "uploadUrl": "http://localhost:3000/api/upload/file/{signed-token}",
  "fileId": "generated-file-id",
  "callbackUrl": "https://your-cms.com/callback",
  "webhookSecret": "your-webhook-secret",
  "cmsId": "your-cms-id",
  "processingOptions": {
    "type": "archive-process",
    "parameters": {
      "extractImages": true,
      "convertToWebp": true,
      "quality": 80
    }
  },
  "headers": {
    "Content-Type": "application/zip",
    "X-File-Name": "images.zip",
    "X-Callback-Url": "https://your-cms.com/callback",
    "X-CMS-ID": "your-cms-id",
    "X-Webhook-Secret": "your-webhook-secret"
  },
  "archiveSupport": {
    "enabled": true,
    "formats": ["zip", "7z"],
    "autoExtract": true,
    "convertImagesToWebp": true
  }
}
```

#### Process File / 处理文件
```http
POST /api/cms/process-file
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "fileId": "file-id",
  "processingOptions": {
    "type": "video-transcode",
    "parameters": {
      "width": 1920,
      "height": 1080,
      "format": "mp4"
    }
  },
  "callbackUrl": "https://your-cms.com/callback",
  "webhookSecret": "your-webhook-secret",
  "cmsId": "your-cms-id"
}
```

## Client Notification Methods / 客户端通知方法

The system provides multiple ways for clients to receive notifications when processing is complete:

系统提供多种方式让客户端在处理完成时接收通知：

### 1. WebSocket Real-time Updates / WebSocket实时更新

**JavaScript Example:**
```javascript
// Connect to WebSocket server
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
  
  // Subscribe to specific job updates
  socket.emit('subscribe-job', 'job-id');
  
  // Subscribe to CMS updates (for third-party integrations)
  socket.emit('subscribe-cms', 'your-cms-id');
  
  // Subscribe to archive processing updates
  socket.emit('subscribe-archive', 'your-cms-id');
});

// Listen for job progress updates
socket.on('job-progress', (data) => {
  console.log('Job progress:', data);
  
  if (data.status === 'completed') {
    console.log('Processing completed!');
    console.log('Output file:', data.result.outputPath);
    console.log('File size:', data.result.size);
    console.log('Format:', data.result.format);
    
    // For video files
    if (data.result.duration) {
      console.log('Duration:', data.result.duration + 's');
    }
    
    // For audio files
    if (data.result.bitrate) {
      console.log('Bitrate:', data.result.bitrate);
    }
    
    // For HLS streaming (m3u8)
    if (data.result.playlistPath) {
      console.log('HLS Playlist:', data.result.playlistPath);
      console.log('Video segments:', data.result.segments);
    }
    
    // Update UI or trigger next action
    updateUIWithCompletedJob(data);
  }
  
  if (data.status === 'failed') {
    console.error('Processing failed:', data.error);
    showErrorToUser(data.error);
  }
});

// Listen for batch processing updates
socket.on('batch-progress', (data) => {
  console.log('Batch progress:', data);
  console.log(`Completed ${data.completedFiles}/${data.totalFiles} files`);
  
  if (data.status === 'completed') {
    console.log('Batch processing completed!');
    console.log('Successful:', data.completedFiles);
    console.log('Failed:', data.failedFiles);
  }
});

// Listen for CMS-specific updates
socket.on('cms-job-progress', (data) => {
  console.log('CMS job update:', data);
  // Handle CMS-specific job updates
  handleCMSJobUpdate(data);
});

// Listen for archive processing progress
socket.on('archive-progress', (data) => {
  console.log('Archive processing progress:', data);
  console.log(`Progress: ${data.progress}%`);
  console.log(`Processing: ${data.currentFile} (${data.processedFiles}/${data.totalFiles})`);
  
  if (data.progress === 100) {
    console.log('Archive processing completed!');
  }
});
```

**Python Example:**
```python
import socketio
import asyncio

sio = socketio.AsyncClient()

@sio.event
async def connect():
    print('Connected to server')
    await sio.emit('subscribe-job', 'job-id')

@sio.on('job-progress')
async def on_job_progress(data):
    print(f'Job progress: {data}')
    
    if data['status'] == 'completed':
        print('Processing completed!')
        result = data['result']
        print(f'Output file: {result["outputPath"]}')
        print(f'File size: {result["size"]}')
        print(f'Format: {result["format"]}')
        
        # Handle different file types
        if 'duration' in result:
            print(f'Duration: {result["duration"]}s')
        
        if 'playlistPath' in result:
            print(f'HLS Playlist: {result["playlistPath"]}')

async def main():
    await sio.connect('http://localhost:3000')
    await sio.wait()

asyncio.run(main())
```

### 2. Webhook Notifications / Webhook通知

**Server-side Webhook Handler (Node.js):**
```javascript
// Express webhook endpoint
app.post('/webhook/media-processing', express.json({type: 'application/json'}), (req, res) => {
  const { jobId, status, result, cmsId, timestamp } = req.body;
  
  console.log('Received webhook notification:');
  console.log('Job ID:', jobId);
  console.log('Status:', status);
  console.log('CMS ID:', cmsId);
  
  if (status === 'completed') {
    console.log('Processing completed successfully!');
    console.log('Output file:', result.outputPath);
    console.log('File size:', result.size);
    console.log('Format:', result.format);
    
    // For HLS streaming
    if (result.playlistPath) {
      console.log('HLS playlist URL:', getPublicUrl(result.playlistPath));
      console.log('Video segments:', result.segments);
    }
    
    // Update database or trigger next process
    updateJobStatus(jobId, 'completed', result);
    
    // Notify users via email/push notification
    notifyUser(jobId, 'completed');
  }
  
  if (status === 'failed') {
    console.error('Processing failed:', req.body.error);
    updateJobStatus(jobId, 'failed', { error: req.body.error });
    notifyUser(jobId, 'failed');
  }
  
  res.status(200).json({ received: true });
});

// Verify webhook signature for security
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'];
  const secret = 'your-webhook-secret';
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  // Verify signature using HMAC
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(req.body));
  const calculatedSignature = hmac.digest('hex');
  
  if (signature !== calculatedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  next();
}
```

**Python Webhook Handler:**
```python
from flask import Flask, request, jsonify
import hmac
import hashlib
import json

app = Flask(__name__)

@app.route('/webhook/media-processing', methods=['POST'])
def webhook_handler():
    # Verify signature
    signature = request.headers.get('x-webhook-signature')
    secret = 'your-webhook-secret'
    
    if not signature:
        return jsonify({'error': 'Missing signature'}), 401
    
    # Calculate expected signature
    expected_signature = hmac.new(
        secret.encode(),
        request.get_data(),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected_signature):
        return jsonify({'error': 'Invalid signature'}), 401
    
    # Process webhook data
    data = request.get_json()
    job_id = data['jobId']
    status = data['status']
    result = data.get('result', {})
    
    print(f'Webhook received for job {job_id}: {status}')
    
    if status == 'completed':
        print(f'Processing completed!')
        print(f'Output file: {result["outputPath"]}')
        print(f'File size: {result["size"]}')
        
        # Handle HLS streaming files
        if 'playlistPath' in result:
            playlist_url = f"https://your-cdn.com{result['playlistPath']}"
            print(f'HLS Playlist URL: {playlist_url}')
    
    return jsonify({'received': True}), 200
```

### 3. REST API Polling / REST API轮询

**JavaScript Polling Example:**
```javascript
async function pollJobStatus(jobId, interval = 5000) {
  const maxAttempts = 120; // 10 minutes max
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`/api/processing/job/${jobId}`, {
        headers: {
          'X-API-Key': apiKey,
          'X-API-Secret': apiSecret
        }
      });
      
      const job = await response.json();
      console.log(`Attempt ${attempt + 1}: Status = ${job.status}`);
      
      if (job.status === 'completed') {
        console.log('Processing completed!');
        console.log('Result:', job.result);
        
        // For HLS streaming
        if (job.result.playlistPath) {
          const playlistUrl = `https://your-cdn.com${job.result.playlistPath}`;
          console.log('Stream URL:', playlistUrl);
          
          // Start video player
          initializeVideoPlayer(playlistUrl);
        }
        
        return job.result;
      }
      
      if (job.status === 'failed') {
        console.error('Processing failed:', job.error);
        throw new Error(job.error);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
      
    } catch (error) {
      console.error('Polling error:', error);
      
      if (attempt === maxAttempts - 1) {
        throw new Error('Polling timeout');
      }
    }
  }
}

// Usage
const jobId = 'job-id-from-creation';
pollJobStatus(jobId)
  .then(result => {
    console.log('Final result:', result);
  })
  .catch(error => {
    console.error('Polling failed:', error);
  });
```

**Python Polling Example:**
```python
import requests
import time
import json

def poll_job_status(job_id, api_key, api_secret, interval=5):
    max_attempts = 120  # 10 minutes max
    url = f'http://localhost:3000/api/processing/job/{job_id}'
    
    headers = {
        'X-API-Key': api_key,
        'X-API-Secret': api_secret
    }
    
    for attempt in range(max_attempts):
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            
            job = response.json()
            print(f'Attempt {attempt + 1}: Status = {job["status"]}')
            
            if job['status'] == 'completed':
                print('Processing completed!')
                result = job['result']
                print(f'Output file: {result["outputPath"]}')
                print(f'File size: {result["size"]}')
                
                # Handle HLS files
                if 'playlistPath' in result:
                    playlist_url = f"https://your-cdn.com{result['playlistPath']}"
                    print(f'HLS Stream URL: {playlist_url}')
                
                return result
            
            elif job['status'] == 'failed':
                print(f'Processing failed: {job.get("error", "Unknown error")}')
                raise Exception(job.get('error', 'Processing failed'))
            
            # Wait before next poll
            time.sleep(interval)
            
        except requests.exceptions.RequestException as e:
            print(f'Polling error: {e}')
            if attempt == max_attempts - 1:
                raise Exception('Polling timeout')
    
    raise Exception('Polling timeout')

# Usage
try:
    result = poll_job_status('job-id', 'your-api-key', 'your-api-secret')
    print('Final result:', result)
except Exception as e:
    print(f'Polling failed: {e}')
```

### 4. HLS Streaming Integration / HLS流媒体集成

**Video Player Integration:**
```javascript
// Using HLS.js for streaming
function initializeVideoPlayer(playlistUrl) {
  const video = document.getElementById('video-player');
  
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(playlistUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      video.play();
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // For Safari native support
    video.src = playlistUrl;
    video.addEventListener('loadedmetadata', function() {
      video.play();
    });
  }
}

// Handle completion webhook with HLS
socket.on('job-progress', (data) => {
  if (data.status === 'completed' && data.result.playlistPath) {
    const playlistUrl = `https://your-cdn.com${data.result.playlistPath}`;
    
    // Store playlist info for later use
    localStorage.setItem(`job_${data.jobId}_playlist`, playlistUrl);
    
    // Auto-play if user is still on page
    if (document.visibilityState === 'visible') {
      initializeVideoPlayer(playlistUrl);
    }
    
    // Send notification to user
    showNotification('Video processing completed!', 'success', {
      playlistUrl: playlistUrl,
      jobId: data.jobId,
      duration: data.result.duration
    });
  }
});
```

### 5. Batch Processing Notifications / 批量处理通知

**Multi-file Progress Tracking:**
```javascript
// Subscribe to batch updates
socket.emit('subscribe-batch', 'batch-id');

socket.on('batch-progress', (data) => {
  console.log(`Batch ${data.batchId}: ${data.completedFiles}/${data.totalFiles}`);
  console.log(`Progress: ${data.progress}%`);
  
  // Update progress bar
  updateBatchProgress(data.batchId, data.progress);
  
  // Show individual file status
  if (data.fileId) {
    updateFileStatus(data.fileId, data.status);
  }
  
  if (data.status === 'completed') {
    console.log('Batch completed!');
    console.log(`Successful: ${data.completedFiles}`);
    console.log(`Failed: ${data.failedFiles}`);
    
    // Get all processed file URLs
    const fileUrls = data.completedFiles.map(file => ({
      id: file.id,
      url: `https://your-cdn.com${file.outputPath}`,
      size: file.size
    }));
    
    // Update UI with results
    displayBatchResults(data.batchId, fileUrls);
  }
});
```

## Data Format Reference / 数据格式参考

### Completion Response Structure / 完成响应结构
```json
{
  "jobId": "job-id",
  "status": "completed",
  "progress": 100,
  "result": {
    "outputPath": "/processed/file.mp4",
    "size": 1024000,
    "format": "mp4",
    "duration": 120, // For video/audio
    "bitrate": "2000k", // For video/audio
    "width": 1920, // For video/images
    "height": 1080, // For video/images
    "playlistPath": "/processed/playlist.m3u8", // For HLS
    "segments": ["segment1.ts", "segment2.ts"], // For HLS
    "sampleRate": 44100, // For audio
    "channels": 2 // For audio
  },
  "cmsId": "cms-id",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

### Error Response Structure / 错误响应结构
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

## Processing Types / 处理类型

### Video Transcoding / 视频转码
- Format conversion (MP4, WebM, etc.) / 格式转换（MP4、WebM等）
- Resolution scaling / 分辨率缩放
- Bitrate adjustment / 比特率调整
- Quality optimization / 质量优化

### Audio Processing / 音频处理
- Format conversion (MP3, AAC, OGG, WAV, FLAC) / 格式转换（MP3、AAC、OGG、WAV、FLAC）
- Quality settings (Low, Medium, High, Very High) / 质量设置（低、中、高、超高）
- Sample rate conversion / 采样率转换
- Channel configuration (Mono, Stereo) / 声道配置（单声道、立体声）
- Audio normalization / 音频标准化
- Audio trimming and cutting / 音频修剪和裁剪

### Image Processing / 图像处理
- Format conversion (JPEG, PNG, WebP) / 格式转换（JPEG、PNG、WebP）
- Resizing and cropping / 调整大小和裁剪
- Quality optimization / 质量优化
- Metadata preservation / 元数据保留

### Thumbnail Generation / 缩略图生成
- Extract frames from videos / 从视频中提取帧
- Custom timestamp selection / 自定义时间戳选择
- Size customization / 尺寸自定义

## Archive Processing / 压缩包处理

### Supported Formats / 支持格式
- **ZIP** - Standard ZIP archives / 标准ZIP压缩包
- **7z** - 7-Zip archives / 7-Zip压缩包

### Upload Process / 上传流程
1. **Generate upload URL** with archive support information / 生成包含压缩包支持信息的上传URL
2. **Upload archive file** using the provided signed URL / 使用提供的签名URL上传压缩包
3. **Automatic detection** and extraction of archive files / 自动检测和解压压缩包文件
4. **Image processing** - Convert extracted images to WebP format / 图像处理 - 将提取的图像转换为WebP格式
5. **Webhook notification** with processed results / 通过webhook通知处理结果

### Archive Upload Example / 压缩包上传示例

**Step 1: Generate Upload URL / 生成上传URL**
```javascript
const response = await fetch('/api/cms/upload-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-API-Secret': apiSecret
  },
  body: JSON.stringify({
    filename: 'images.zip',
    contentType: 'application/zip',
    callbackUrl: 'https://your-cms.com/webhook',
    webhookSecret: 'your-secret',
    cmsId: 'your-cms-id'
  })
});

const { uploadUrl, headers } = await response.json();
```

**Step 2: Upload Archive File / 上传压缩包文件**
```javascript
const formData = new FormData();
formData.append('file', archiveFile);

// Add required headers for archive processing
Object.entries(headers).forEach(([key, value]) => {
  formData.append(key, value);
});

const uploadResponse = await fetch(uploadUrl, {
  method: 'POST',
  body: formData
});

const result = await uploadResponse.json();
console.log('Archive uploaded:', result);
```

**Step 3: Monitor Progress / 监控进度**
```javascript
// Subscribe to archive processing updates
socket.emit('subscribe-archive', 'your-cms-id');

socket.on('archive-progress', (data) => {
  console.log(`Archive processing: ${data.progress}%`);
  console.log(`Current file: ${data.currentFile}`);
  console.log(`Progress: ${data.processedFiles}/${data.totalFiles}`);
  
  if (data.progress === 100) {
    console.log('Archive processing completed!');
  }
});
```

## Webhook Format / Webhook格式

### Regular Processing Webhook / 常规处理Webhook
When processing completes, a webhook is sent to the specified URL:

```json
{
  "jobId": "job-id",
  "status": "completed",
  "progress": 100,
  "result": {
    "outputPath": "/path/to/processed/file.mp4",
    "size": 1024000,
    "format": "mp4"
  },
  "cmsId": "your-cms-id",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

### Archive Processing Webhook / 压缩包处理Webhook
When archive processing completes, a webhook is sent with image results:

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

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `400` Bad Request - Invalid request parameters
- `401` Unauthorized - Invalid API credentials
- `403` Forbidden - Insufficient permissions
- `404` Not Found - Resource not found
- `500` Internal Server Error - Server-side error

## Security Features

- API key/secret authentication
- Request rate limiting
- File size limits
- Secure temporary URLs
- Origin validation
- Helmet security headers

## Configuration / 配置

Environment variables in `.env`:

- `PORT` - Server port (default: 3000) / 服务器端口（默认：3000）
- `MONGODB_URI` - MongoDB connection string / MongoDB连接字符串
- `JWT_SECRET` - JWT signing secret / JWT签名密钥
- `UPLOAD_DIR` - Upload directory (default: ./uploads) / 上传目录（默认：./uploads）
- `PROCESSED_DIR` - Processed files directory (default: ./processed) / 处理后文件目录（默认：./processed）
- `FFMPEG_PATH` - FFmpeg binary path / FFmpeg二进制路径
- `FFPROBE_PATH` - FFprobe binary path / FFprobe二进制路径
- `7Z_PATH` - 7z binary path (optional, auto-detected) / 7z二进制路径（可选，自动检测）

## System Requirements / 系统要求

### Required Dependencies / 必需依赖
- **Node.js** v14+ / Node.js v14或更高版本
- **MongoDB** v4.0+ / MongoDB v4.0或更高版本
- **FFmpeg** - For video/audio processing / 用于视频/音频处理
- **7-Zip** - For archive extraction / 用于压缩包解压

### Archive Processing Setup / 压缩包处理设置

#### macOS
```bash
brew install p7zip
```

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install p7zip-full
```

#### CentOS/RHEL
```bash
sudo yum install epel-release
sudo yum install p7zip p7zip-plugins
```

#### Windows
1. Download 7-Zip from https://www.7-zip.org/
2. Add 7z.exe to system PATH
3. Or set `7Z_PATH` environment variable

## Example Usage / 使用示例

### Third-party CMS Integration / 第三方CMS集成

1. **Generate upload URL for user** / 为用户生成上传URL
2. **User uploads file directly to server** / 用户直接上传文件到服务器
3. **Create processing job with webhook** / 创建带有webhook的处理任务
4. **Receive real-time updates via WebSocket** / 通过WebSocket接收实时更新
5. **Get completion notification via webhook** / 通过webhook获取完成通知

### Large File Upload / 大文件上传

```javascript
// Initialize chunked upload
const initResponse = await fetch('/api/upload/chunked/init', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-API-Secret': apiSecret
  },
  body: JSON.stringify({
    filename: 'large-video.mp4',
    fileSize: 5368709120, // 5GB
    contentType: 'video/mp4',
    chunkSize: 5242880 // 5MB chunks
  })
});

const { uploadId, totalChunks } = await initResponse.json();

// Upload chunks
for (let i = 0; i < totalChunks; i++) {
  const chunk = getChunkData(i); // Your chunk data function
  
  const formData = new FormData();
  formData.append('chunk', chunk);
  formData.append('chunkIndex', i);
  
  await fetch(`/api/upload/chunked/upload/${uploadId}`, {
    method: 'POST',
    body: formData,
    headers: {
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret
    }
  });
}

// Complete upload
const completeResponse = await fetch(`/api/upload/chunked/complete/${uploadId}`, {
  method: 'POST',
  headers: {
    'X-API-Key': apiKey,
    'X-API-Secret': apiSecret
  }
});
```

### Audio Processing Example / 音频处理示例

```javascript
// Convert audio to MP3 with high quality
const audioJob = await fetch('/api/processing/job', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-API-Secret': apiSecret
  },
  body: JSON.stringify({
    fileId: 'audio-file-id',
    type: 'audio-convert',
    parameters: {
      format: 'mp3',
      quality: 'high',
      sampleRate: 44100,
      channels: 2,
      bitrate: '192k'
    }
  })
});

// Subscribe to progress updates
socket.emit('subscribe-job', audioJob.id);
socket.on('job-progress', (data) => {
  console.log(`Audio conversion: ${data.progress}%`);
  if (data.status === 'completed') {
    console.log('Audio converted successfully!');
    console.log(`Duration: ${data.result.duration}s`);
    console.log(`Bitrate: ${data.result.bitrate}kbps`);
  }
});
```

### Archive Processing Example / 压缩包处理示例

```javascript
// Upload and process archive
async function uploadAndProcessArchive(archiveFile) {
  // Generate CMS upload URL for archive
  const response = await fetch('/api/cms/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret
    },
    body: JSON.stringify({
      filename: archiveFile.name,
      contentType: archiveFile.type,
      callbackUrl: 'https://your-cms.com/webhook',
      webhookSecret: 'your-webhook-secret',
      cmsId: 'your-cms-id'
    })
  });
  
  const { uploadUrl, headers } = await response.json();
  
  // Upload archive file with required headers
  const formData = new FormData();
  formData.append('file', archiveFile);
  
  // Add callback headers for archive processing
  formData.append('X-Callback-Url', headers['X-Callback-Url']);
  formData.append('X-Webhook-Secret', headers['X-Webhook-Secret']);
  formData.append('X-CMS-ID', headers['X-CMS-ID']);
  
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });
  
  const uploadResult = await uploadResponse.json();
  console.log('Archive upload result:', uploadResult);
  
  // Connect to WebSocket for real-time updates
  const socket = io('http://localhost:3000');
  socket.emit('subscribe-archive', 'your-cms-id');
  
  // Listen for archive processing progress
  socket.on('archive-progress', (data) => {
    console.log(`Archive processing: ${data.progress}%`);
    console.log(`Current file: ${data.currentFile}`);
    console.log(`Progress: ${data.processedFiles}/${data.totalFiles}`);
    
    // Update UI with progress
    updateArchiveProgress(data);
    
    if (data.progress === 100) {
      console.log('Archive processing completed!');
      showNotification('Archive processing completed!', 'success');
    }
  });
  
  return uploadResult;
}

// Handle archive processing webhook
app.post('/webhook/archive-processed', express.json(), (req, res) => {
  const { results, cmsId, status, totalImages } = req.body;
  
  console.log(`Archive processing ${status} for CMS ${cmsId}`);
  console.log(`Processed ${totalImages} images`);
  
  if (status === 'completed') {
    // Process the results
    const processedImages = results.map(image => ({
      url: `https://your-cdn.com${image.url}`,
      width: image.width,
      height: image.height,
      originalName: image.originalName,
      size: image.size
    }));
    
    // Update your CMS or database
    updateCMSWithProcessedImages(cmsId, processedImages);
    
    // Notify users
    sendArchiveProcessingNotification(cmsId, processedImages);
  }
  
  res.status(200).json({ received: true });
});
```

### Client-side Example / 客户端示例

```javascript
// Upload file and process
async function uploadAndProcess(file) {
  // Get signed URL
  const signedResponse = await fetch('/api/upload/generate-signed-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type
    })
  });
  
  const { uploadUrl } = await signedResponse.json();
  
  // Upload file
  const formData = new FormData();
  formData.append('file', file);
  
  await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });
  
  // Create processing job
  const jobResponse = await fetch('/api/processing/job', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret
    },
    body: JSON.stringify({
      fileId: 'file-id',
      type: 'video-transcode',
      parameters: {
        width: 1920,
        height: 1080,
        format: 'mp4'
      }
    })
  });
  
  const { id: jobId } = await jobResponse.json();
  
  // Connect to WebSocket for updates
  const socket = io('http://localhost:3000');
  socket.emit('subscribe-job', jobId);
  
  socket.on('job-progress', (data) => {
    console.log(`Progress: ${data.progress}%`);
  });
}
```