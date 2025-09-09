# Webhook测试指南

本指南介绍如何使用webhook测试服务器来模拟和查看压缩包处理的callback数据。

## 快速开始

### 1. 启动Webhook测试服务器

```bash
node webhook-test-server.js
```

服务器将在 `http://localhost:3002` 启动，你会看到类似输出：

```
=== Webhook测试服务器已启动 ===
访问地址: http://localhost:3002
Webhook URL: http://localhost:3002/webhook
API端点: http://localhost:3002/api/webhooks
================================
```

### 2. 启动主服务器

在另一个终端窗口启动主服务器：

```bash
node src/server.js
```

### 3. 运行压缩包处理测试

在第三个终端窗口运行测试：

```bash
node test-chunked-upload.js
```

## 查看Webhook数据

### 方法1: Web界面查看

打开浏览器访问 `http://localhost:3002`，你将看到：

- 实时的webhook接收状态
- 所有接收到的callback数据
- 清空数据和刷新功能
- 页面每10秒自动刷新

### 方法2: 终端日志查看

在运行webhook测试服务器的终端中，每次收到callback时会打印详细信息：

```
=== 收到Webhook回调 ===
时间: 2023-12-07T10:30:45.123Z
Headers: {
  "content-type": "application/json",
  "x-webhook-secret": "your-secret"
}
Body: {
  "results": [...],
  "cmsId": "test-cms",
  "status": "completed",
  "totalImages": 5,
  "timestamp": "2023-12-07T10:30:45.123Z"
}
========================
```

### 方法3: API接口查看

使用curl或其他HTTP客户端获取JSON格式数据：

```bash
curl http://localhost:3002/api/webhooks
```

## Webhook数据格式

### 压缩包处理完成的Callback数据

```json
{
  "results": [
    {
      "url": "/processed/image1.webp",
      "width": 1920,
      "height": 1080,
      "originalName": "image1.jpg",
      "size": 245760,
      "format": "webp"
    }
  ],
  "cmsId": "test-cms",
  "status": "completed",
  "totalImages": 1,
  "timestamp": "2023-12-07T10:30:45.123Z"
}
```

### 处理失败的Callback数据

```json
{
  "cmsId": "test-cms",
  "status": "failed",
  "error": {
    "message": "Extraction failed",
    "code": "EXTRACTION_ERROR"
  },
  "timestamp": "2023-12-07T10:30:45.123Z"
}
```

## 测试不同场景

### 1. 成功处理场景

使用包含有效图片的zip文件进行测试：

```bash
# 确保test-files/test.zip包含有效的图片文件
node test-chunked-upload.js
```

### 2. 处理失败场景

可以通过以下方式模拟失败：

- 使用损坏的zip文件
- 使用包含非图片文件的zip
- 使用包含特殊字符文件名的zip

### 3. 自定义处理参数

修改 `test-chunked-upload.js` 中的处理参数：

```javascript
parameters: {
  extractImages: true,
  convertToWebp: true,
  quality: 80,
  preserveMetadata: true,
  // 添加其他自定义参数
}
```

## 高级功能

### 1. Webhook安全验证

测试服务器会显示接收到的所有headers，包括 `X-Webhook-Secret`，用于验证webhook的真实性。

### 2. 数据持久化

Webhook测试服务器在内存中保存最近50条记录。如需持久化存储，可以修改代码添加数据库支持。

### 3. 多端点支持

可以修改测试服务器添加多个webhook端点：

```javascript
app.post('/webhook/archive', handleArchiveWebhook);
app.post('/webhook/media', handleMediaWebhook);
app.post('/webhook/batch', handleBatchWebhook);
```

## 故障排除

### 1. 端口冲突

如果3002端口被占用，修改 `webhook-test-server.js` 中的端口号：

```javascript
const port = 3003; // 改为其他端口
```

同时更新 `test-chunked-upload.js` 中的webhook URL。

### 2. 没有收到Webhook

检查：
- 主服务器是否正常运行
- Webhook测试服务器是否启动
- 网络连接是否正常
- 处理任务是否成功完成

### 3. 数据格式问题

如果收到的数据格式不符合预期，检查：
- 主服务器的webhook发送逻辑
- Content-Type头是否正确
- JSON序列化是否正常

## 扩展开发

基于这个webhook测试服务器，你可以：

1. 添加数据过滤和搜索功能
2. 实现webhook数据的导出功能
3. 添加实时通知（如邮件、短信）
4. 集成到CI/CD流程中进行自动化测试
5. 添加性能监控和统计功能

## 注意事项

1. 测试服务器仅用于开发和测试环境
2. 生产环境请使用更安全的webhook处理方案
3. 注意清理测试数据，避免内存泄漏
4. 定期检查日志文件大小