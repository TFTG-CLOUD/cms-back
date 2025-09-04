const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const processingRoutes = require('./routes/processing');
const cmsRoutes = require('./routes/cms');
const batchRoutes = require('./routes/batch');
const processedRoutes = require('./routes/processed');
const demoApp = require('./app');
const DatabaseInitializer = require('./services/DatabaseInitializer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(helmet());
app.use(limiter);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/media_processing', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('MongoDB connected');
  
  // 初始化默认API密钥
  await DatabaseInitializer.initializeDefaultApiKey();
})
.catch(err => console.error('MongoDB connection error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/processed', processedRoutes);
app.use('/', demoApp);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe-job', (jobId) => {
    socket.join(`job-${jobId}`);
    console.log(`Client ${socket.id} subscribed to job ${jobId}`);
  });

  socket.on('subscribe-batch', (batchId) => {
    socket.join(`batch-${batchId}`);
    console.log(`Client ${socket.id} subscribed to batch ${batchId}`);
  });

  socket.on('subscribe-cms', (cmsId) => {
    socket.join(`cms-${cmsId}`);
    console.log(`Client ${socket.id} subscribed to CMS ${cmsId}`);
  });

  socket.on('subscribe-archive', (cmsId) => {
    socket.join(`archive-${cmsId}`);
    console.log(`Client ${socket.id} subscribed to archive processing for CMS ${cmsId}`);
  });

  socket.on('unsubscribe-cms', (cmsId) => {
    socket.leave(`cms-${cmsId}`);
    console.log(`Client ${socket.id} unsubscribed from CMS ${cmsId}`);
  });

  socket.on('unsubscribe-archive', (cmsId) => {
    socket.leave(`archive-${cmsId}`);
    console.log(`Client ${socket.id} unsubscribed from archive processing for CMS ${cmsId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.set('socketio', io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io };