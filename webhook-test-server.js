const express = require('express');
const app = express();
const port = 3002;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 存储接收到的webhook数据
const webhookData = [];

// Webhook接收端点
app.post('/webhook', (req, res) => {
  const timestamp = new Date().toISOString();
  const headers = req.headers;
  const body = req.body;
  
  const webhookEntry = {
    timestamp,
    headers,
    body,
    id: Date.now()
  };
  
  webhookData.unshift(webhookEntry); // 最新的在前面
  
  // 只保留最近50条记录
  if (webhookData.length > 50) {
    webhookData.splice(50);
  }
  
  console.log('\n=== 收到Webhook回调 ===');
  console.log('时间:', timestamp);
  console.log('Headers:', JSON.stringify(headers, null, 2));
  console.log('Body:', JSON.stringify(body, null, 2));
  console.log('========================\n');
  
  res.status(200).json({ received: true, timestamp });
});

// 查看webhook数据的Web界面
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Webhook测试服务器</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .webhook-entry { 
            border: 1px solid #ddd; 
            margin: 10px 0; 
            padding: 15px; 
            border-radius: 5px;
            background: #f9f9f9;
        }
        .timestamp { color: #666; font-size: 0.9em; }
        .headers { background: #e8f4f8; padding: 10px; margin: 10px 0; border-radius: 3px; }
        .body { background: #f0f8e8; padding: 10px; margin: 10px 0; border-radius: 3px; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
        .clear-btn { 
            background: #dc3545; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 5px; 
            cursor: pointer;
            margin-bottom: 20px;
        }
        .refresh-btn { 
            background: #007bff; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 5px; 
            cursor: pointer;
            margin-bottom: 20px;
            margin-left: 10px;
        }
        .info { 
            background: #d1ecf1; 
            border: 1px solid #bee5eb; 
            color: #0c5460; 
            padding: 15px; 
            border-radius: 5px; 
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <h1>Webhook测试服务器</h1>
    
    <div class="info">
        <strong>Webhook URL:</strong> http://localhost:${port}/webhook<br>
        <strong>状态:</strong> 运行中<br>
        <strong>接收到的回调数量:</strong> ${webhookData.length}
    </div>
    
    <button class="clear-btn" onclick="clearData()">清空数据</button>
    <button class="refresh-btn" onclick="location.reload()">刷新页面</button>
    
    <h2>接收到的Webhook数据:</h2>
    
    ${webhookData.length === 0 ? '<p>暂无webhook数据</p>' : ''}
    
    ${webhookData.map(entry => `
        <div class="webhook-entry">
            <div class="timestamp">时间: ${entry.timestamp}</div>
            <div class="headers">
                <strong>Headers:</strong>
                <pre>${JSON.stringify(entry.headers, null, 2)}</pre>
            </div>
            <div class="body">
                <strong>Body:</strong>
                <pre>${JSON.stringify(entry.body, null, 2)}</pre>
            </div>
        </div>
    `).join('')}
    
    <script>
        function clearData() {
            fetch('/clear', { method: 'POST' })
                .then(() => location.reload())
                .catch(err => console.error('清空失败:', err));
        }
        
        // 自动刷新
        setInterval(() => {
            location.reload();
        }, 10000); // 每10秒刷新一次
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

// 清空数据端点
app.post('/clear', (req, res) => {
  webhookData.length = 0;
  console.log('Webhook数据已清空');
  res.json({ cleared: true });
});

// 获取JSON格式的webhook数据
app.get('/api/webhooks', (req, res) => {
  res.json({
    count: webhookData.length,
    data: webhookData
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`\n=== Webhook测试服务器已启动 ===`);
  console.log(`访问地址: http://localhost:${port}`);
  console.log(`Webhook URL: http://localhost:${port}/webhook`);
  console.log(`API端点: http://localhost:${port}/api/webhooks`);
  console.log('================================\n');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭Webhook测试服务器...');
  process.exit(0);
});