const { spawn } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const crypto = require('crypto');

class ArchiveProcessor {
  constructor(io) {
    this.io = io;
    // 安全限制配置
    this.maxExtractedSize = 2 * 1024 * 1024 * 1024; // 2GB 最大解压大小
    this.maxFileCount = 5000; // 最大文件数量
    this.minImageCount = 5; // 最少图片数量
    this.maxImageCount = 5000; // 最大图片数量
    this.maxDepth = 5; // 最大目录深度
    this.extractTimeout = 300000; // 5分钟超时
    this.imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  }

  async isArchive(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.zip', '.7z'].includes(ext);
  }

  async extractArchive(filePath, extractDir) {
    try {
      await fs.mkdir(extractDir, { recursive: true });

      // 验证输入文件路径
      const resolvedFilePath = path.resolve(filePath);
      const resolvedExtractDir = path.resolve(extractDir);

      // 检查文件是否存在
      const fileStats = await fs.stat(resolvedFilePath);
      if (!fileStats.isFile()) {
        throw new Error('Invalid file path');
      }

      const ext = path.extname(resolvedFilePath).toLowerCase();

      if (ext === '.zip') {
        await this.extractZipSafely(resolvedFilePath, resolvedExtractDir);
      } else if (ext === '.7z') {
        await this.extract7zSafely(resolvedFilePath, resolvedExtractDir);
      } else {
        throw new Error('Unsupported archive format');
      }

      // 验证解压结果并返回图片文件列表
      const imageFiles = await this.validateExtractedContent(resolvedExtractDir);

      return imageFiles;
    } catch (error) {
      console.error('Archive extraction failed:', error);
      // 清理可能的部分解压内容
      try {
        await fs.rm(extractDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
      throw error;
    }
  }

  async extractZipSafely(filePath, extractDir) {
    return new Promise((resolve, reject) => {
      // 使用7z命令解压zip文件，更好地处理编码问题
      const childProcess = spawn('7z', [
        'x', // 解压命令
        '-y', // 对所有询问回答yes
        '-bd', // 禁用进度指示器
        '-o' + extractDir, // 输出目录
        filePath
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const timeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new Error('Extraction timeout'));
      }, this.extractTimeout);

      let stderr = '';
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Extraction failed with code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async extract7zSafely(filePath, extractDir) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('7z', [
        'x',
        filePath,
        `-o${extractDir}`,
        '-y',
        '-bd' // 禁用进度指示器
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const timeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new Error('Extraction timeout'));
      }, this.extractTimeout);

      let stderr = '';
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Extraction failed with code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async validateExtractedContent(extractDir) {
    let totalSize = 0;
    let fileCount = 0;
    const imageFiles = [];

    const validateDirectory = async (dirPath, depth = 0) => {
      if (depth > this.maxDepth) {
        throw new Error('Directory depth limit exceeded');
      }

      const files = await fs.readdir(dirPath, { withFileTypes: true });

      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);

        // 验证文件名，防止路径遍历
        if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
          throw new Error(`Suspicious file name detected: ${file.name}`);
        }

        if (file.isDirectory()) {
          await validateDirectory(fullPath, depth + 1);
        } else {
          fileCount++;
          if (fileCount > this.maxFileCount) {
            throw new Error(`File count limit exceeded (max: ${this.maxFileCount})`);
          }

          const stats = await fs.stat(fullPath);
          totalSize += stats.size;

          if (totalSize > this.maxExtractedSize) {
            throw new Error(`Extracted content size limit exceeded (max: ${this.maxExtractedSize / (1024 * 1024 * 1024)}GB)`);
          }

          // 检查是否为图片文件
          const ext = path.extname(file.name).toLowerCase();
          if (this.imageExtensions.includes(ext)) {
            imageFiles.push(fullPath);
          }
        }
      }
    };

    await validateDirectory(extractDir);

    // 验证图片数量
    if (imageFiles.length < this.minImageCount) {
      throw new Error(`Insufficient image files (found: ${imageFiles.length}, required: at least ${this.minImageCount})`);
    }

    if (imageFiles.length > this.maxImageCount) {
      throw new Error(`Too many image files (found: ${imageFiles.length}, max allowed: ${this.maxImageCount})`);
    }

    console.log(`Validation passed: ${fileCount} files (${imageFiles.length} images), ${Math.round(totalSize / (1024 * 1024))}MB`);
    return imageFiles;
  }

  async findImagesInDirectory(dirPath) {
    const images = [];

    const scanDirectory = async (currentPath) => {
      const files = await fs.readdir(currentPath, { withFileTypes: true });

      for (const file of files) {
        const fullPath = path.join(currentPath, file.name);

        if (file.isDirectory()) {
          await scanDirectory(fullPath);
        } else {
          const ext = path.extname(file.name).toLowerCase();
          if (this.imageExtensions.includes(ext)) {
            images.push(fullPath);
          }
        }
      }
    };

    await scanDirectory(dirPath);
    return images;
  }

  async convertImageToWebp(inputPath, outputPath, quality = 80) {
    try {
      await sharp(inputPath)
        .webp({ quality })
        .toFile(outputPath);

      const metadata = await sharp(outputPath).metadata();
      const stats = await fs.stat(outputPath);

      return {
        path: outputPath,
        width: metadata.width,
        height: metadata.height,
        size: stats.size,
        format: 'webp'
      };
    } catch (error) {
      console.error('Image conversion failed:', error);
      throw error;
    }
  }

  async processArchive(filePath, webhookUrl, webhookSecret, cmsId, parameters = {}) {
    try {
      const extractDir = path.join(process.cwd(), 'extracted', crypto.randomBytes(16).toString('hex'));
      const outputDir = path.join(process.cwd(), 'public', 'processed', crypto.randomBytes(16).toString('hex'));

      await fs.mkdir(outputDir, { recursive: true });

      const imageFiles = await this.extractArchive(filePath, extractDir);

      const results = [];
      const quality = parameters.quality || 80;
      const convertToWebp = parameters.convertToWebp !== false;
      const extractImages = parameters.extractImages !== false;

      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const relativePath = path.relative(extractDir, imageFile);
        const outputFileName = `${path.basename(relativePath, path.extname(relativePath))}.webp`;
        const outputPath = path.join(outputDir, outputFileName);

        let result;
        if (convertToWebp && extractImages) {
          result = await this.convertImageToWebp(imageFile, outputPath, quality);
        } else {
          // Just copy the file if no conversion needed
          const stats = await fs.stat(imageFile);
          const metadata = await sharp(imageFile).metadata();
          result = {
            path: imageFile,
            width: metadata.width,
            height: metadata.height,
            size: stats.size,
            format: path.extname(imageFile).substring(1)
          };
        }

        results.push({
          url: `/processed/${path.basename(outputDir)}/${path.basename(outputPath)}`,
          width: result.width,
          height: result.height,
          originalName: path.basename(imageFile),
          size: result.size,
          format: result.format
        });

        if (this.io) {
          this.io.to(`archive-${cmsId}`).emit('archive-progress', {
            progress: Math.round(((i + 1) / imageFiles.length) * 100),
            currentFile: path.basename(imageFile),
            totalFiles: imageFiles.length,
            processedFiles: i + 1
          });
        }
      }

      if (webhookUrl) {
        await this.sendWebhook(webhookUrl, {
          results,
          cmsId,
          status: 'completed',
          totalImages: results.length,
          timestamp: new Date().toISOString()
        }, webhookSecret);
      }

      await fs.rm(extractDir, { recursive: true, force: true });

      return results;
    } catch (error) {
      console.error('Archive processing failed:', error);
      throw error;
    }
  }

  async sendWebhook(url, payload, secret = null) {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (secret) {
        headers['X-Webhook-Secret'] = secret;
      }

      const axios = require('axios');
      await axios.post(url, payload, { headers });
    } catch (error) {
      console.error('Webhook sending failed:', error);
    }
  }
}

module.exports = ArchiveProcessor;