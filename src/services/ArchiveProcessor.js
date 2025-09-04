const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const crypto = require('crypto');

class ArchiveProcessor {
  constructor(io) {
    this.io = io;
  }

  async isArchive(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.zip', '.7z'].includes(ext);
  }

  async extractArchive(filePath, extractDir) {
    try {
      await fs.mkdir(extractDir, { recursive: true });
      
      const ext = path.extname(filePath).toLowerCase();
      let command;

      if (ext === '.zip') {
        command = `unzip -o "${filePath}" -d "${extractDir}"`;
      } else if (ext === '.7z') {
        command = `7z x "${filePath}" -o"${extractDir}" -y`;
      } else {
        throw new Error('Unsupported archive format');
      }

      execSync(command, { stdio: 'inherit' });
      return true;
    } catch (error) {
      console.error('Archive extraction failed:', error);
      throw error;
    }
  }

  async findImagesInDirectory(dirPath) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
    const images = [];

    async function scanDirectory(currentPath) {
      const files = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(currentPath, file.name);
        
        if (file.isDirectory()) {
          await scanDirectory(fullPath);
        } else {
          const ext = path.extname(file.name).toLowerCase();
          if (imageExtensions.includes(ext)) {
            images.push(fullPath);
          }
        }
      }
    }

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

  async processArchive(filePath, webhookUrl, webhookSecret, cmsId) {
    try {
      const extractDir = path.join(process.cwd(), 'extracted', crypto.randomBytes(16).toString('hex'));
      const outputDir = path.join(process.cwd(), 'public', 'processed', crypto.randomBytes(16).toString('hex'));
      
      await fs.mkdir(outputDir, { recursive: true });
      
      await this.extractArchive(filePath, extractDir);
      
      const imageFiles = await this.findImagesInDirectory(extractDir);
      
      const results = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const relativePath = path.relative(extractDir, imageFile);
        const outputFileName = `${path.basename(relativePath, path.extname(relativePath))}.webp`;
        const outputPath = path.join(outputDir, outputFileName);
        
        const result = await this.convertImageToWebp(imageFile, outputPath);
        
        results.push({
          url: `/processed/${path.basename(outputPath)}`,
          width: result.width,
          height: result.height,
          originalName: path.basename(imageFile),
          size: result.size
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