const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const ProcessingJob = require('../models/ProcessingJob');
const File = require('../models/File');
const AudioAnalyzer = require('./AudioAnalyzer');
const { getStorageService } = require('./storage/StorageService');
const { buildProcessedObjectKey } = require('./storage/ObjectKeyHelper');
const { detectContentType } = require('./ImageVariantService');
const { buildProtectedObjectUrl } = require('./PublicAssetService');

class MediaProcessor {
  constructor(io, storageService = getStorageService()) {
    this.io = io;
    this.audioAnalyzer = new AudioAnalyzer();
    this.storage = storageService;
  }

  async processVideo(job) {
    let tempInputPath = null;
    let outputPath = null;

    try {
      await this.updateJobStatus(job._id, 'processing', 0);

      tempInputPath = await this.storage.materializeToFile(job.inputStorageKey || job.inputPath);
      outputPath = await this.createTempOutputPath(
        job._id,
        tempInputPath,
        job.parameters.format || 'mp4'
      );

      const ffmpegCommand = ffmpeg(tempInputPath)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac');

      if (job.parameters.width && job.parameters.height) {
        ffmpegCommand.size(`${job.parameters.width}x${job.parameters.height}`);
      }

      if (job.parameters.bitrate) {
        ffmpegCommand.videoBitrate(job.parameters.bitrate);
      }

      if (job.parameters.quality) {
        ffmpegCommand.outputOptions([`-crf ${job.parameters.quality}`]);
      }

      let duration = 0;
      let currentTime = 0;

      ffmpegCommand.on('progress', (progress) => {
        if (progress.percent) {
          this.updateJobProgress(job._id, Math.round(progress.percent));
        }
      });

      ffmpegCommand.on('codecData', (data) => {
        duration = data.duration;
      });

      await new Promise((resolve, reject) => {
        ffmpegCommand.on('end', async () => {
          try {
            await this.storeProcessedOutput(job, outputPath, job.parameters.format || 'mp4');
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        ffmpegCommand.on('error', async (err) => {
          await this.updateJobStatus(job._id, 'failed', 0, null, err.message);
          reject(err);
        });

        ffmpegCommand.run();
      });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
    } finally {
      await this.cleanupTempInput(tempInputPath);
      await this.cleanupTempOutput(outputPath);
    }
  }

  async processAudio(job) {
    let tempInputPath = null;
    let outputPath = null;

    try {
      await this.updateJobStatus(job._id, 'processing', 0);

      tempInputPath = await this.storage.materializeToFile(job.inputStorageKey || job.inputPath);
      outputPath = await this.createTempOutputPath(
        job._id,
        tempInputPath,
        job.parameters.format || 'mp3'
      );

      const ffmpegCommand = ffmpeg(tempInputPath)
        .output(outputPath)
        .audioCodec('libmp3lame')
        .audioBitrate(job.parameters.bitrate || '128k')
        .audioFrequency(job.parameters.sampleRate || 44100)
        .audioChannels(job.parameters.channels || 2);

      if (job.parameters.quality) {
        const qualityMap = {
          'low': 64,
          'medium': 128,
          'high': 192,
          'very-high': 320
        };
        const bitrate = qualityMap[job.parameters.quality] || 128;
        ffmpegCommand.audioBitrate(`${bitrate}k`);
      }

      ffmpegCommand.on('progress', (progress) => {
        if (progress.percent) {
          this.updateJobProgress(job._id, Math.round(progress.percent));
        }
      });

      await new Promise((resolve, reject) => {
        ffmpegCommand.on('end', async () => {
          try {
            const metadata = await this.extractAudioMetadata(outputPath);
            await this.storeProcessedOutput(job, outputPath, job.parameters.format || 'mp3', {
              duration: metadata.duration,
              bitrate: metadata.bitrate,
              sampleRate: metadata.sampleRate,
              channels: metadata.channels
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        ffmpegCommand.on('error', async (err) => {
          await this.updateJobStatus(job._id, 'failed', 0, null, err.message);
          reject(err);
        });

        ffmpegCommand.run();
      });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
    } finally {
      await this.cleanupTempInput(tempInputPath);
      await this.cleanupTempOutput(outputPath);
    }
  }

  async extractAudioMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        if (!audioStream) {
          reject(new Error('No audio stream found'));
          return;
        }

        resolve({
          duration: parseFloat(audioStream.duration) || 0,
          bitrate: parseInt(audioStream.bit_rate) || 0,
          sampleRate: parseInt(audioStream.sample_rate) || 0,
          channels: audioStream.channels || 0,
          codec: audioStream.codec_name || 'unknown'
        });
      });
    });
  }

  async processImage(job) {
    let tempInputPath = null;
    let outputPath = null;

    try {
      await this.updateJobStatus(job._id, 'processing', 0);

      tempInputPath = await this.storage.materializeToFile(job.inputStorageKey || job.inputPath);
      outputPath = await this.createTempOutputPath(
        job._id,
        tempInputPath,
        job.parameters.format || 'jpg'
      );

      let pipeline = sharp(tempInputPath);

      if (job.parameters.width && job.parameters.height) {
        pipeline = pipeline.resize(job.parameters.width, job.parameters.height);
      }

      if (job.parameters.quality) {
        pipeline = pipeline.jpeg({ quality: job.parameters.quality });
      }

      if (job.parameters.format === 'png') {
        pipeline = pipeline.png();
      } else if (job.parameters.format === 'webp') {
        pipeline = pipeline.webp({ quality: job.parameters.quality || 80 });
      }

      await pipeline.toFile(outputPath);

      const metadata = await sharp(outputPath).metadata();

      await this.storeProcessedOutput(job, outputPath, job.parameters.format || 'jpg', {
        width: metadata.width,
        height: metadata.height
      });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
    } finally {
      await this.cleanupTempInput(tempInputPath);
      await this.cleanupTempOutput(outputPath);
    }
  }

  async generateThumbnail(job) {
    let tempInputPath = null;
    let outputPath = null;

    try {
      await this.updateJobStatus(job._id, 'processing', 0);

      tempInputPath = await this.storage.materializeToFile(job.inputStorageKey || job.inputPath);
      outputPath = await this.createTempOutputPath(job._id, tempInputPath, 'jpg');
      const time = job.parameters.thumbnailTime || 1;

      await new Promise((resolve, reject) => {
        ffmpeg(tempInputPath)
          .screenshots({
            timestamps: [time],
            filename: path.basename(outputPath),
            folder: path.dirname(outputPath),
            size: job.parameters.size || '320x240'
          })
          .on('end', async () => {
            try {
              await this.storeProcessedOutput(job, outputPath, 'jpg');
              resolve();
            } catch (error) {
              reject(error);
            }
          })
          .on('error', async (err) => {
            await this.updateJobStatus(job._id, 'failed', 0, null, err.message);
            reject(err);
          });
      });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
    } finally {
      await this.cleanupTempInput(tempInputPath);
      await this.cleanupTempOutput(outputPath);
    }
  }

  async updateJobStatus(jobId, status, progress, result = null, error = null) {
    try {
      const update = {
        status,
        progress,
        ...(result && { result }),
        ...(error && { error: { message: error } }),
        ...(status === 'processing' && { startedAt: new Date() }),
        ...(status === 'completed' && { completedAt: new Date() })
      };

      const job = await ProcessingJob.findByIdAndUpdate(jobId, update, { new: true });
      
      if (this.io) {
        this.io.to(`job-${jobId}`).emit('job-progress', {
          jobId,
          status,
          progress,
          result,
          error: error ? { message: error } : null
        });
      }

      if (job.webhookUrl && (status === 'completed' || status === 'failed')) {
        await this.sendWebhook(job);
      }

      return job;
    } catch (error) {
      console.error('Error updating job status:', error);
    }
  }

  async updateJobProgress(jobId, progress) {
    try {
      await ProcessingJob.findByIdAndUpdate(jobId, { progress });
      
      if (this.io) {
        this.io.to(`job-${jobId}`).emit('job-progress', {
          jobId,
          progress
        });
      }
    } catch (error) {
      console.error('Error updating job progress:', error);
    }
  }

  async processArchive(job) {
    let tempInputPath = null;

    try {
      await this.updateJobStatus(job._id, 'processing', 0);

      tempInputPath = await this.storage.materializeToFile(job.inputStorageKey || job.inputPath);
      const ArchiveProcessor = require('./ArchiveProcessor');
      const archiveProcessor = new ArchiveProcessor(this.io, this.storage);
      
      const results = await archiveProcessor.processArchive(
        tempInputPath,
        job.webhookUrl,
        job.webhookSecret,
        job.cmsId,
        job.parameters
      );

      await this.updateJobStatus(job._id, 'completed', 100, {
        outputPath: job.inputStorageKey || job.inputPath,
        results,
        totalImages: results.length,
        format: 'archive'
      });
    } catch (error) {
      console.error('Archive processing failed:', error);
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
    } finally {
      await this.cleanupTempInput(tempInputPath);
    }
  }

  async createTempOutputPath(jobId, inputPath, extension) {
    const tempDir = path.join(os.tmpdir(), 'cms-processed');
    await fs.mkdir(tempDir, { recursive: true });

    const baseName = path.basename(inputPath, path.extname(inputPath));
    return path.join(tempDir, `${jobId}_${baseName}.${extension}`);
  }

  async storeProcessedOutput(job, localOutputPath, format, extra = {}) {
    const contentType = detectContentType(format, 'application/octet-stream');
    const storageFilename = path.basename(localOutputPath);
    const storageKey = buildProcessedObjectKey(storageFilename);

    await this.storage.putFile(storageKey, localOutputPath, { contentType });

    const stats = await fs.stat(localOutputPath);
    await this.updateJobStatus(job._id, 'completed', 100, {
      outputPath: storageKey,
      storageKey,
      size: stats.size,
      format,
      contentType,
      url: buildProtectedObjectUrl(storageKey),
      publicUrl: null,
      ...extra
    });
  }

  async cleanupTempInput(tempInputPath) {
    if (!tempInputPath || this.storage.driverName !== 's3') {
      return;
    }

    await fs.rm(tempInputPath, { force: true });
  }

  async cleanupTempOutput(outputPath) {
    if (!outputPath) {
      return;
    }

    await fs.rm(outputPath, { force: true });
  }

  async sendWebhook(job) {
    try {
      const payload = {
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        result: job.result,
        error: job.error,
        cmsId: job.cmsId,
        timestamp: new Date().toISOString()
      };

      const headers = {
        'Content-Type': 'application/json'
      };

      if (job.webhookSecret) {
        headers['X-Webhook-Secret'] = job.webhookSecret;
      }

      const axios = require('axios');
      await axios.post(job.webhookUrl, payload, { headers });
    } catch (error) {
      console.error('Error sending webhook:', error);
    }
  }
}

module.exports = MediaProcessor;
