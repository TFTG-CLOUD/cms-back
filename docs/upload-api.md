# Upload API

本文档描述当前项目的上传能力，包括：

- 普通上传：适合图片、音频、小视频等小文件
- 分片上传：适合大文件
- 文件访问 URL：上传完成后返回可访问 URL
- 存储后端：支持本地存储或兼容 S3 协议的对象存储

## 认证

所有上传接口都需要以下请求头：

```http
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

认证来源有两种：

- `.env` 中配置固定 `API_KEY` / `API_SECRET`
- MongoDB 中保存的 API key / secret

如果需要在接口返回中生成完整公网地址，可以配置：

```bash
PUBLIC_BASE_URL=https://your-domain.com
```

未配置时，接口会返回站内相对路径。

## 公开访问开关

只有在上传时显式传递公开头，文件才允许通过公开直链访问：

```http
X-Public-Access: true
```

兼容写法：

```http
X-Public: true
```

未传时：

- 文件默认是私有的
- 仍然会返回受保护的 `url`
- `publicUrl` 会返回 `null`
- 访问 `/api/processed/public/file/{fileId}` 会返回 `403`

## 存储模式

通过 `.env` 控制存储后端：

```bash
STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=.
```

或：

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=https://your-s3-compatible-endpoint
S3_REGION=auto
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_FORCE_PATH_STYLE=true
```

支持的 S3 兼容对象存储包括：

- AWS S3
- MinIO
- Cloudflare R2
- 其他兼容 S3 API 的服务

## 1. 生成普通上传签名

先申请一个短期有效的上传 token。

### 请求

```http
POST /api/upload/generate-signed-url
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret

{
  "filename": "avatar.jpg",
  "contentType": "image/jpeg",
  "expiresIn": 3600
}
```

### 响应

```json
{
  "uploadUrl": "/api/upload/file/{signed-token}",
  "fileId": "generated-file-id",
  "expiresIn": 3600,
  "headers": {
    "Content-Type": "image/jpeg",
    "X-File-Name": "avatar.jpg"
  }
}
```

## 2. 普通上传

适合图片等小文件。当前接口使用 `multipart/form-data`。

### 请求

```http
POST /api/upload/file/{signed-token}
Content-Type: multipart/form-data
X-API-Key: your-api-key
X-API-Secret: your-api-secret
X-Public-Access: true

file: [binary data]
```

### 响应

```json
{
  "id": "6820abcd1234ef5678900001",
  "originalName": "avatar.jpg",
  "filename": "a1b2c3d4e5f6.jpg",
  "storageKey": "uploads/a1b2c3d4e5f6.jpg",
  "size": 245123,
  "mimeType": "image/jpeg",
  "isPublic": true,
  "uploadDate": "2026-05-11T08:00:00.000Z",
  "url": "https://assets.example.com/api/processed/file/6820abcd1234ef5678900001",
  "publicUrl": "https://assets.example.com/api/processed/public/file/6820abcd1234ef5678900001",
  "message": "File uploaded successfully"
}
```

### 说明

- `url` 是可访问 URL
- `url` 是受 API Key 保护的访问地址
- `publicUrl` 是公开直链，不需要 API Key
- 只有上传时传了 `X-Public-Access: true`，`publicUrl` 才会有值
- 对图片文件，这个 URL 同时支持实时处理参数
- 如果存储后端是 S3，文件会写入对象存储；如果是 `local`，文件会写入本地目录

## 3. 分片上传初始化

适合大文件，例如大视频、压缩包等。

### 请求

```http
POST /api/upload/chunked/init
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret
X-Public-Access: true

{
  "filename": "movie.mp4",
  "fileSize": 2147483648,
  "contentType": "video/mp4",
  "chunkSize": 5242880
}
```

### 响应

```json
{
  "uploadId": "chunk-upload-id",
  "chunkSize": 5242880,
  "totalChunks": 410,
  "uploadUrl": "/api/upload/chunked/upload/chunk-upload-id",
  "expiresAt": "2026-05-12T08:00:00.000Z"
}
```

## 4. 上传分片

### 请求

```http
POST /api/upload/chunked/upload/{uploadId}
Content-Type: multipart/form-data
X-API-Key: your-api-key
X-API-Secret: your-api-secret

chunk: [binary data]
chunkIndex: 0
```

### 响应

```json
{
  "uploadId": "chunk-upload-id",
  "chunkIndex": 0,
  "receivedChunks": 1,
  "totalChunks": 410,
  "progress": 0,
  "status": "initialized"
}
```

### 说明

- `chunkIndex` 从 `0` 开始
- 当最后一个分片上传完成后，服务端会自动合并文件
- `complete` 接口仍然可调用，用于客户端显式确认，且当前实现是幂等的

## 5. 完成分片上传

### 请求

```http
POST /api/upload/chunked/complete/{uploadId}
Content-Type: application/json
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

### 响应

```json
{
  "uploadId": "chunk-upload-id",
  "status": "completed",
  "filename": "final-movie.mp4",
  "path": "uploads/final-movie.mp4",
  "storageKey": "uploads/final-movie.mp4",
  "size": 2147483648,
  "contentType": "video/mp4",
  "isPublic": true,
  "fileId": "6820abcd1234ef5678900002",
  "url": "https://assets.example.com/api/processed/file/6820abcd1234ef5678900002",
  "publicUrl": "https://assets.example.com/api/processed/public/file/6820abcd1234ef5678900002"
}
```

## 6. 查询分片上传状态

### 请求

```http
GET /api/upload/chunked/status/{uploadId}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

### 响应

上传中：

```json
{
  "uploadId": "chunk-upload-id",
  "filename": "movie.mp4",
  "fileSize": 2147483648,
  "chunkSize": 5242880,
  "totalChunks": 410,
  "receivedChunks": 120,
  "progress": 29,
  "status": "initialized",
  "createdAt": "2026-05-11T08:00:00.000Z",
  "expiresAt": "2026-05-12T08:00:00.000Z"
}
```

完成后：

```json
{
  "uploadId": "chunk-upload-id",
  "filename": "final-movie.mp4",
  "fileSize": 2147483648,
  "chunkSize": 5242880,
  "totalChunks": 410,
  "receivedChunks": 410,
  "progress": 100,
  "status": "completed",
  "isPublic": true,
  "createdAt": "2026-05-11T08:00:00.000Z",
  "completedAt": "2026-05-11T08:30:00.000Z",
  "expiresAt": "2026-05-12T08:00:00.000Z",
  "fileId": "6820abcd1234ef5678900002",
  "path": "uploads/final-movie.mp4",
  "storageKey": "uploads/final-movie.mp4",
  "size": 2147483648,
  "contentType": "video/mp4",
  "url": "https://assets.example.com/api/processed/file/6820abcd1234ef5678900002",
  "publicUrl": "https://assets.example.com/api/processed/public/file/6820abcd1234ef5678900002"
}
```

## 7. 取消分片上传

### 请求

```http
DELETE /api/upload/chunked/cancel/{uploadId}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

### 响应

```json
{
  "uploadId": "chunk-upload-id",
  "status": "cancelled"
}
```

## 8. 访问上传后的文件

### 原始文件访问

```http
GET /api/processed/file/{fileId}
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

### 公开直链访问

```http
GET /api/processed/public/file/{fileId}
```

公开直链只有在该文件上传时传递了 `X-Public-Access: true` 才可访问。

### 图片实时处理

```http
GET /api/processed/file/{fileId}?width=300&height=200&format=webp
X-API-Key: your-api-key
X-API-Secret: your-api-secret
```

公开直链同样支持图片实时处理：

```http
GET /api/processed/public/file/{fileId}?width=300&height=200&format=webp
```

支持参数：

- `width`
- `height`
- `format`
- `quality`

处理规则：

- 只传 `width`：高度按比例自适应
- 只传 `height`：宽度按比例自适应
- 同时传 `width` 和 `height`：返回指定尺寸图片
- `format` 支持：`jpg` `jpeg` `png` `webp` `avif` `gif`
- 如果文件不是图片，比如视频、压缩包、音频，即使带了 `width` / `height` / `format` 参数，也会忽略这些参数并直接返回原文件，不会报错

## 9. 常见错误码

- `400` 请求参数错误
- `401` API key / secret 或签名 token 无效
- `403` 权限不足
- `404` 文件或上传会话不存在
- `500` 服务端错误

## 10. 当前实现结论

当前项目已经实现以下能力：

- 普通上传
- 分片上传
- 上传完成后返回可访问 URL
- 上传完成后返回公开直链
- 本地存储
- S3 兼容协议对象存储
- 上传后图片实时处理访问
- 公开访问必须由上传头显式开启
