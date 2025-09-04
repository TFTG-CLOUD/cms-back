const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const ProcessingJob = require('../models/ProcessingJob');
const File = require('../models/File');
const AudioAnalyzer = require('./AudioAnalyzer');

class MediaProcessor {
  constructor(io) {
    this.io = io;
    this.audioAnalyzer = new AudioAnalyzer();
  }

  async processVideo(job) {
    try {
      await this.updateJobStatus(job._id, 'processing', 0);
      
      const outputPath = path.join(process.cwd(), 'public', 'processed', `${job._id}_${path.basename(job.inputPath, path.extname(job.inputPath))}.${job.parameters.format || 'mp4'}`);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      const ffmpegCommand = ffmpeg(job.inputPath)
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

      ffmpegCommand.on('end', async () => {
        const stats = await fs.stat(outputPath);
        await this.updateJobStatus(job._id, 'completed', 100, {
          outputPath,
          size: stats.size,
          format: job.parameters.format || 'mp4'
        });
      });

      ffmpegCommand.on('error', async (err) => {
        await this.updateJobStatus(job._id, 'failed', 0, null, err.message);
      });

      await new Promise((resolve, reject) => {
        ffmpegCommand.run();
        ffmpegCommand.on('end', resolve);
        ffmpegCommand.on('error', reject);
      });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
    }
  }

  async processAudio(job) {
    try {
      await this.updateJobStatus(job._id, 'processing', 0);
      
      const outputPath = path.join(process.cwd(), 'public', 'processed', `${job._id}_${path.basename(job.inputPath, path.extname(job.inputPath))}.${job.parameters.format || 'mp3'}`);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      const ffmpegCommand = ffmpeg(job.inputPath)
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

      ffmpegCommand.on('end', async () => {
        const stats = await fs.stat(outputPath);
        
        // Extract audio metadata
        const metadata = await this.extractAudioMetadata(outputPath);
        
        await this.updateJobStatus(job._id, 'completed', 100, {
          outputPath,
          size: stats.size,
          format: job.parameters.format || 'mp3',
          duration: metadata.duration,
          bitrate: metadata.bitrate,
          sampleRate: metadata.sampleRate,
          channels: metadata.channels
        });
      });

      ffmpegCommand.on('error', async (err) => {
        await this.updateJobStatus(job._id, 'failed', 0, null, err.message);
      });

      await new Promise((resolve, reject) => {
        ffmpegCommand.run();
        ffmpegCommand.on('end', resolve);
        ffmpegCommand.on('error', reject);
      });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
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
    try {
      await this.updateJobStatus(job._id, 'processing', 0);
      
      const outputPath = path.join(process.cwd(), 'public', 'processed', `${job._id}_${path.basename(job.inputPath, path.extname(job.inputPath))}.${job.parameters.format || 'jpg'}`);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      let pipeline = sharp(job.inputPath);

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

      const stats = await fs.stat(outputPath);
      const metadata = await sharp(outputPath).metadata();

      await this.updateJobStatus(job._id, 'completed', 100, {
        outputPath,
        size: stats.size,
        format: job.parameters.format || 'jpg',
        width: metadata.width,
        height: metadata.height
      });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
    }
  }

  async generateThumbnail(job) {
    try {
      await this.updateJobStatus(job._id, 'processing', 0);
      
      const outputPath = path.join(process.cwd(), 'public', 'processed', `${job._id}_thumb.jpg`);
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      const time = job.parameters.thumbnailTime || 1;

      ffmpeg(job.inputPath)
        .screenshots({
          timestamps: [time],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: job.parameters.size || '320x240'
        })
        .on('end', async () => {
          const stats = await fs.stat(outputPath);
          await this.updateJobStatus(job._id, 'completed', 100, {
            outputPath,
            size: stats.size,
            format: 'jpg'
          });
        })
        .on('error', async (err) => {
          await this.updateJobStatus(job._id, 'failed', 0, null, err.message);
        });

    } catch (error) {
      await this.updateJobStatus(job._id, 'failed', 0, null, error.message);
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