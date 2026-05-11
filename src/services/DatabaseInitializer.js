const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { getEnvApiKeyRecord } = require('../config/runtime');

class DatabaseInitializer {
  static async initializeDefaultApiKey() {
    try {
      if (getEnvApiKeyRecord()) {
        console.log('🔐 Environment API key configuration detected. Skipping database key initialization.');
        return {
          success: false,
          message: 'Environment API key configuration is active'
        };
      }

      // 检查是否已有API密钥
      const existingKeyCount = await ApiKey.countDocuments();
      
      if (existingKeyCount === 0) {
        // 生成随机的API密钥和密钥
        const apiKey = `cms_${crypto.randomBytes(32).toString('hex')}`;
        const apiSecret = crypto.randomBytes(48).toString('hex');
        
        // 创建默认API密钥
        const defaultKey = new ApiKey({
          name: 'Default Admin Key',
          apiKey,
          apiSecret,
          permissions: ['upload', 'process', 'read', 'delete'],
          allowedOrigins: ['*'],
          isActive: true
        });
        
        await defaultKey.save();
        
        console.log('='.repeat(60));
        console.log('🔑 DEFAULT API KEY CREATED');
        console.log('='.repeat(60));
        console.log(`Name: ${defaultKey.name}`);
        console.log(`API Key: ${apiKey}`);
        console.log(`API Secret: ${apiSecret}`);
        console.log(`Permissions: ${defaultKey.permissions.join(', ')}`);
        console.log('='.repeat(60));
        console.log('⚠️  Please save these credentials securely!');
        console.log('   You will need them to authenticate API requests.');
        console.log('='.repeat(60));
        
        return { apiKey, apiSecret, success: true };
      } else {
        console.log('📋 Database already contains API keys. Skipping initialization.');
        return { success: false, message: 'API keys already exist' };
      }
    } catch (error) {
      console.error('❌ Error initializing default API key:', error);
      throw error;
    }
  }
}

module.exports = DatabaseInitializer;
