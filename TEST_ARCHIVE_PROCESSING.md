# 切片上传和压缩包处理测试

这个测试脚本演示了如何使用切片上传功能上传压缩包文件，然后创建压缩包处理任务来提取和处理其中的图片。

## 功能特性

1. **切片上传**: 将大文件分成小块上传，支持断点续传
2. **自动过期**: 上传会话24小时后自动过期，防止资源泄漏
3. **压缩包处理**: 自动提取压缩包中的图片并转换为WebP格式
4. **实时进度**: 通过API监控上传和处理进度

## 使用方法

### 1. 安装依赖

```bash
npm install axios form-data
```

### 2. 启动服务器

确保服务器正在运行：

```bash
npm run dev
```

### 3. 运行测试

```bash
node test-archive-processing.js
```

## 测试流程

1. **初始化上传**: 创建上传会话，获取uploadId
2. **分块上传**: 将文件分成2MB的块逐个上传
3. **等待完成**: 监控上传状态，等待自动合并完成
4. **创建处理任务**: 使用返回的fileId创建压缩包处理任务
5. **监控处理**: 实时查看处理进度和结果

## API端点

### 切片上传相关
- `POST /api/upload/chunked/init` - 初始化切片上传
- `POST /api/upload/chunked/upload/{uploadId}` - 上传文件块
- `GET /api/upload/status/{uploadId}` - 获取上传状态

### 处理任务相关
- `POST /api/processing/job` - 创建处理任务
- `GET /api/processing/job/{jobId}` - 获取任务状态

## 响应格式

### 初始化上传响应
```json
{
  "uploadId": "unique-upload-id",
  "chunkSize": 2097152,
  "totalChunks": 5,
  "uploadUrl": "/api/upload/chunk/unique-upload-id",
  "expiresAt": "2023-01-01T01:00:00.000Z"
}
```

### 上传完成响应
```json
{
  "uploadId": "unique-upload-id",
  "status": "completed",
  "fileId": "database-file-id",
  "filename": "unique-filename.zip",
  "path": "/path/to/uploads/unique-filename.zip",
  "size": 10485760,
  "contentType": "application/zip",
  "fileRecord": {
    "id": "database-file-id",
    "originalName": "test.zip",
    "filename": "unique-filename.zip",
    "size": 10485760,
    "mimeType": "application/zip",
    "uploadDate": "2023-01-01T00:00:00.000Z"
  }
}
```

### 处理任务完成响应
```json
{
  "results": [
    {
      "url": "/processed/image1.webp",
      "width": 1920,
      "height": 1080,
      "originalName": "image1.jpg",
      "size": 256000
    }
  ],
  "totalImages": 1,
  "status": "completed"
}
```

## 安全特性

1. **会话过期**: 上传会话24小时后自动过期
2. **自动清理**: 每小时清理过期会话和临时文件
3. **API认证**: 所有请求都需要API密钥认证
4. **权限验证**: 需要上传和处理权限
5. **文件验证**: 压缩包处理有文件数量和大小限制

## 故障排除

### 常见问题

1. **上传失败**: 检查API密钥是否正确
2. **处理超时**: 大文件处理可能需要较长时间
3. **文件不存在**: 确保test-files/test.zip文件存在
4. **服务器未启动**: 确保服务器在localhost:3001运行

### 调试技巧

1. 查看服务器日志了解详细错误信息
2. 使用较小的测试文件进行快速测试
3. 检查网络连接和API端点可用性
4. 验证文件权限和磁盘空间

## 扩展功能

可以基于此测试脚本扩展：

1. **批量上传**: 支持多个文件的批量上传
2. **断点续传**: 支持从中断的地方继续上传
3. **自定义处理**: 根据需要修改处理参数
4. **错误处理**: 添加更完善的错误处理和重试机制