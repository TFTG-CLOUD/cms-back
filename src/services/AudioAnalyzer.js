const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

class AudioAnalyzer {
  constructor() {
    this.supportedFormats = [
      'mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'aac'
    ];
  }

  async analyzeAudio(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        const format = metadata.format;

        if (!audioStream) {
          reject(new Error('No audio stream found'));
          return;
        }

        const analysis = {
          duration: parseFloat(format.duration) || 0,
          bitrate: parseInt(format.bit_rate) || 0,
          size: parseInt(format.size) || 0,
          format: format.format_name || 'unknown',
          codec: audioStream.codec_name || 'unknown',
          sampleRate: parseInt(audioStream.sample_rate) || 0,
          channels: audioStream.channels || 0,
          bitDepth: audioStream.bits_per_sample || 0,
          profile: audioStream.profile || 'unknown'
        };

        resolve(analysis);
      });
    });
  }

  async detectAudioFormat(filePath) {
    try {
      const analysis = await this.analyzeAudio(filePath);
      return {
        format: analysis.format,
        codec: analysis.codec,
        isSupported: this.supportedFormats.includes(analysis.format.toLowerCase())
      };
    } catch (error) {
      return {
        format: 'unknown',
        codec: 'unknown',
        isSupported: false,
        error: error.message
      };
    }
  }

  async extractWaveform(filePath, outputPath, width = 800, height = 200) {
    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .output(outputPath)
        .audioChannels(1)
        .audioFrequency(44100)
        .format('wav')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async convertToCompressedFormat(inputPath, outputPath, format = 'mp3', quality = 'medium') {
    return new Promise((resolve, reject) => {
      const qualityMap = {
        'low': { bitrate: '64k', abr: true },
        'medium': { bitrate: '128k', abr: true },
        'high': { bitrate: '192k', abr: false },
        'very-high': { bitrate: '320k', abr: false }
      };

      const config = qualityMap[quality] || qualityMap['medium'];
      
      let command = ffmpeg(inputPath)
        .output(outputPath)
        .audioCodec('libmp3lame')
        .audioBitrate(config.bitrate);

      if (config.abr) {
        command.outputOptions(['-abr', '1']);
      }

      command
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async normalizeAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .audioFilters([
          'loudnorm=I=-16:LRA=11:TP=-1.5',
          'volume=1.0'
        ])
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async trimAudio(inputPath, outputPath, startTime, duration) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .seekInput(startTime)
        .duration(duration)
        .audioCodec('copy')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async mergeAudioFiles(inputPaths, outputPath) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      inputPaths.forEach(inputPath => {
        command.input(inputPath);
      });

      command
        .output(outputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .outputOptions(['-filter_complex', 'concat=n=' + inputPaths.length + ':v=0:a=1'])
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  async extractAudioFromVideo(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(outputPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  isFormatSupported(format) {
    return this.supportedFormats.includes(format.toLowerCase());
  }

  getOptimalSettingsForFormat(format, quality = 'medium') {
    const settings = {
      mp3: {
        codec: 'libmp3lame',
        quality: {
          low: { bitrate: '64k', flags: ['-q:a', '9'] },
          medium: { bitrate: '128k', flags: ['-q:a', '5'] },
          high: { bitrate: '192k', flags: ['-q:a', '2'] },
          'very-high': { bitrate: '320k', flags: ['-q:a', '0'] }
        }
      },
      aac: {
        codec: 'aac',
        quality: {
          low: { bitrate: '64k', flags: ['-profile:a', 'aac_low'] },
          medium: { bitrate: '128k', flags: ['-profile:a', 'aac_low'] },
          high: { bitrate: '192k', flags: ['-profile:a', 'aac_he'] },
          'very-high': { bitrate: '256k', flags: ['-profile:a', 'aac_he'] }
        }
      },
      ogg: {
        codec: 'libvorbis',
        quality: {
          low: { bitrate: '64k', flags: ['-q:a', '3'] },
          medium: { bitrate: '128k', flags: ['-q:a', '5'] },
          high: { bitrate: '192k', flags: ['-q:a', '7'] },
          'very-high': { bitrate: '320k', flags: ['-q:a', '10'] }
        }
      }
    };

    return settings[format.toLowerCase()] || settings.mp3;
  }
}

module.exports = AudioAnalyzer;