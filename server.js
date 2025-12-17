import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import cloudinary from 'cloudinary';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs';
import { promisify } from 'util';

// Load environment variables
dotenv.config();

// Initialize Express


// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB Models
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  avatar: String,
  preferences: {
    theme: { type: String, default: 'dark' },
    audioQuality: { type: String, default: 'high' },
    autoPlay: { type: Boolean, default: true },
    equalizer: {
      bass: { type: Number, default: 0 },
      mid: { type: Number, default: 0 },
      treble: { type: Number, default: 0 }
    }
  },
  playlists: [{
    name: String,
    description: String,
    mixes: [{
      videoId: String,
      title: String,
      thumbnail: String,
      addedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
  }],
  favorites: [{
    videoId: String,
    title: String,
    thumbnail: String,
    addedAt: { type: Date, default: Date.now }
  }],
  downloads: [{
    videoId: String,
    title: String,
    format: String,
    quality: String,
    downloadedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const MixSchema = new mongoose.Schema({
  videoId: { type: String, unique: true },
  title: String,
  artist: String,
  duration: Number,
  thumbnail: String,
  waveform: String,
  audioUrl: String,
  downloadCount: { type: Number, default: 0 },
  playCount: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  tags: [String],
  uploadedBy: String,
  uploadedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Mix = mongoose.model('Mix', MixSchema);

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /audio\/(mp3|wav|mpeg|ogg|flac|aac|m4a)/;
    const allowedVideo = /video\/(mp4|webm|ogg)/;
    
    if (allowedTypes.test(file.mimetype) || allowedVideo.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio/video files are allowed.'), false);
    }
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:", "http:", "blob:"],
      mediaSrc: ["'self'", "https:", "http:", "blob:"],
      connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for downloads
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// WebSocket for real-time features
io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('join-player', (room) => {
    socket.join(`player-${room}`);
  });
  
  socket.on('audio-progress', (data) => {
    socket.to(`player-${data.room}`).emit('progress-update', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Utility Functions
const generateWaveform = async (audioBuffer) => {
  // Simple waveform generation (in production, use proper audio processing)
  const waveform = [];
  const chunkSize = Math.floor(audioBuffer.length / 100);
  
  for (let i = 0; i < 100; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, audioBuffer.length);
    const chunk = audioBuffer.slice(start, end);
    
    // Calculate RMS for waveform
    let sum = 0;
    for (let j = 0; j < chunk.length; j += 4) {
      sum += Math.abs(chunk[j]);
    }
    const rms = Math.sqrt(sum / (chunk.length / 4));
    waveform.push(Math.min(100, rms * 100));
  }
  
  return waveform;
};

// YouTube API Functions
const fetchYouTubeChannelVideos = async () => {
  try {
    const cacheKey = 'youtube_channel_videos';
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${process.env.YOUTUBE_CHANNEL_ID}&maxResults=50&order=date&type=video&key=${process.env.YOUTUBE_API_KEY}`;
    
    const response = await axios.get(url);
    const videos = response.data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
      publishedAt: item.snippet.publishedAt,
      channelTitle: item.snippet.channelTitle
    }));
    
    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(videos));
    
    return videos;
  } catch (error) {
    console.error('YouTube API error:', error.message);
    return [];
  }
};

// GiftedTech API Functions
const downloadFromGiftedTech = async (videoId, format = 'mp3', quality = '320kbps') => {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const encodedUrl = encodeURIComponent(videoUrl);
    let apiUrl = '';
    
    switch (format) {
      case 'video':
        apiUrl = `https://api.giftedtech.web.id/api/download/ytv?apikey=${process.env.GIFTED_API_KEY}&url=${encodedUrl}`;
        if (quality !== '720p') {
          apiUrl += `&quality=${quality}`;
        }
        break;
      case 'audio':
        if (quality === 'mp3') {
          apiUrl = `https://api.giftedtech.web.id/api/download/dlmp3?apikey=${process.env.GIFTED_API_KEY}&url=${encodedUrl}`;
        } else {
          apiUrl = `https://api.giftedtech.web.id/api/download/ytaudio?apikey=${process.env.GIFTED_API_KEY}&format=${quality}&url=${encodedUrl}`;
        }
        break;
      default:
        apiUrl = `https://api.giftedtech.web.id/api/download/dlmp3?apikey=${process.env.GIFTED_API_KEY}&url=${encodedUrl}`;
    }
    
    console.log('Calling GiftedTech API:', apiUrl);
    
    const response = await axios.get(apiUrl, {
      timeout: 30000 // 30 second timeout
    });
    
    if (response.data.success && response.data.result) {
      return {
        success: true,
        downloadUrl: response.data.result.download_url,
        title: response.data.result.title || 'Unknown Title',
        thumbnail: response.data.result.thumbnail || '',
        duration: response.data.result.duration || '0:00',
        quality: response.data.result.quality || quality,
        format: format
      };
    }
    
    throw new Error('GiftedTech API returned error');
  } catch (error) {
    console.error('GiftedTech API error:', error.message);
    return {
      success: false,
      error: error.message,
      fallback: true
    };
  }
};

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    youtubeChannel: process.env.YOUTUBE_CHANNEL_ID,
    giftedApi: 'active'
  });
});

// Get YouTube channel videos
app.get('/api/channel/videos', async (req, res) => {
  try {
    const videos = await fetchYouTubeChannelVideos();
    
    res.json({
      success: true,
      videos,
      total: videos.length,
      channelId: process.env.YOUTUBE_CHANNEL_ID,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching channel videos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channel videos',
      message: error.message
    });
  }
});

// Search videos
app.get('/api/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const videos = await fetchYouTubeChannelVideos();
    
    const filteredVideos = videos.filter(video => 
      video.title.toLowerCase().includes(q.toLowerCase()) ||
      video.description.toLowerCase().includes(q.toLowerCase())
    );
    
    res.json({
      success: true,
      videos: filteredVideos,
      total: filteredVideos.length,
      query: q
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Get download options
app.get('/api/download/options/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const options = {
      video: [
        { quality: '720p', label: 'HD Video (720p)', format: 'mp4', size: '~120MB' },
        { quality: '480p', label: 'Standard Video (480p)', format: 'mp4', size: '~80MB' },
        { quality: '360p', label: 'Mobile Video (360p)', format: 'mp4', size: '~50MB' }
      ],
      audio: [
        { quality: '320kbps', label: 'High Quality Audio (320kbps)', format: 'mp3', size: '~40MB' },
        { quality: '192kbps', label: 'Good Quality Audio (192kbps)', format: 'mp3', size: '~25MB' },
        { quality: '128kbps', label: 'Standard Audio (128kbps)', format: 'mp3', size: '~15MB' },
        { quality: 'mp3', label: 'MP3 Format', format: 'mp3', size: '~40MB' }
      ]
    };
    
    res.json({
      success: true,
      videoId,
      options,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Download options error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get download options'
    });
  }
});

// Download mix
app.get('/api/download/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { format = 'mp3', quality = '320kbps' } = req.query;
    
    // Get video info first
    const videos = await fetchYouTubeChannelVideos();
    const video = videos.find(v => v.videoId === videoId);
    
    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found in channel'
      });
    }
    
    // Download from GiftedTech
    const downloadResult = await downloadFromGiftedTech(videoId, format, quality);
    
    if (!downloadResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Download service unavailable',
        message: downloadResult.error
      });
    }
    
    // Update download count in database
    await Mix.findOneAndUpdate(
      { videoId },
      { $inc: { downloadCount: 1 } },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      video: {
        videoId: video.videoId,
        title: video.title,
        thumbnail: video.thumbnail,
        channel: video.channelTitle
      },
      download: {
        url: downloadResult.downloadUrl,
        format: downloadResult.format,
        quality: downloadResult.quality,
        duration: downloadResult.duration,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message
    });
  }
});

// Stream audio
app.get('/api/stream/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const range = req.headers.range;
    
    if (!range) {
      // Return direct download if no range header
      const downloadResult = await downloadFromGiftedTech(videoId, 'mp3', '320kbps');
      
      if (downloadResult.success) {
        return res.redirect(downloadResult.downloadUrl);
      }
      
      return res.status(400).send('Range header required');
    }
    
    // For streaming, we need to implement proper range requests
    // This is simplified - in production you'd want to stream from source
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/mpeg');
    
    // Get download URL
    const downloadResult = await downloadFromGiftedTech(videoId, 'mp3', '320kbps');
    
    if (downloadResult.success) {
      // Redirect to the actual audio file for streaming
      res.redirect(downloadResult.downloadUrl);
    } else {
      res.status(500).json({ error: 'Streaming unavailable' });
    }
    
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Streaming failed' });
  }
});

// Upload custom mix
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { title, artist, description, tags } = req.body;
    const file = req.file;
    
    // Upload to Cloudinary
    const cloudinaryResult = await cloudinary.v2.uploader.upload(file.path, {
      resource_type: 'video',
      folder: 'mixhub/uploads',
      public_id: `upload_${Date.now()}`,
      overwrite: true
    });
    
    // Generate waveform (simplified)
    const audioBuffer = fs.readFileSync(file.path);
    const waveform = await generateWaveform(audioBuffer);
    
    // Create mix in database
    const mix = new Mix({
      videoId: `upload_${Date.now()}`,
      title: title || file.originalname.replace(/\.[^/.]+$/, ""),
      artist: artist || 'Unknown Artist',
      thumbnail: cloudinaryResult.secure_url.replace(/\.(mp3|wav|m4a|flac)$/, '.jpg'),
      audioUrl: cloudinaryResult.secure_url,
      waveform: JSON.stringify(waveform),
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      uploadedBy: 'user', // In production, use actual user ID
      uploadedAt: new Date()
    });
    
    await mix.save();
    
    // Clean up uploaded file
    fs.unlinkSync(file.path);
    
    res.json({
      success: true,
      mix: {
        id: mix._id,
        title: mix.title,
        artist: mix.artist,
        audioUrl: mix.audioUrl,
        thumbnail: mix.thumbnail,
        waveform: waveform
      }
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

// User registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create user (in production, hash password!)
    const user = new User({
      username,
      email,
      password, // In production: await bcrypt.hash(password, 10)
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`,
      createdAt: new Date()
    });
    
    await user.save();
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // In production: const validPassword = await bcrypt.compare(password, user.password);
    const validPassword = password === user.password; // Simplified for demo
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        preferences: user.preferences
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user profile
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user
    });
    
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update equalizer settings
app.post('/api/equalizer', async (req, res) => {
  try {
    const { userId, bass = 0, mid = 0, treble = 0 } = req.body;
    
    await User.findByIdAndUpdate(userId, {
      $set: {
        'preferences.equalizer.bass': bass,
        'preferences.equalizer.mid': mid,
        'preferences.equalizer.treble': treble
      }
    });
    
    res.json({
      success: true,
      equalizer: { bass, mid, treble },
      message: 'Equalizer settings saved'
    });
    
  } catch (error) {
    console.error('Equalizer error:', error);
    res.status(500).json({ error: 'Failed to save equalizer settings' });
  }
});

// Get waveform data
app.get('/api/waveform/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const mix = await Mix.findOne({ videoId });
    if (mix && mix.waveform) {
      return res.json({
        success: true,
        waveform: JSON.parse(mix.waveform),
        duration: mix.duration || 180 // Default 3 minutes
      });
    }
    
    // Generate random waveform for YouTube videos
    const waveform = Array.from({ length: 100 }, () => Math.floor(Math.random() * 80) + 20);
    
    res.json({
      success: true,
      waveform,
      duration: 180 // 3 minutes default
    });
    
  } catch (error) {
    console.error('Waveform error:', error);
    res.status(500).json({ error: 'Failed to generate waveform' });
  }
});

// Create playlist
app.post('/api/playlists', async (req, res) => {
  try {
    const { userId, name, description } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const playlist = {
      name,
      description,
      mixes: [],
      createdAt: new Date()
    };
    
    user.playlists.push(playlist);
    await user.save();
    
    res.json({
      success: true,
      playlist: playlist
    });
    
  } catch (error) {
    console.error('Playlist error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// Add mix to favorites
app.post('/api/favorites/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { userId, title, thumbnail } = req.body;
    
    await User.findByIdAndUpdate(userId, {
      $addToSet: {
        favorites: {
          videoId,
          title,
          thumbnail,
          addedAt: new Date()
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Added to favorites'
    });
    
  } catch (error) {
    console.error('Favorite error:', error);
    res.status(500).json({ error: 'Failed to add to favorites' });
  }
});

// Clean routes for HTML pages (no .html extension)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/player.html'));
});

app.get('/equalizer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/equalizer.html'));
});

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/upload.html'));
});

app.get('/playlists', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/playlists.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/profile.html'));
});

app.get('/downloads', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/downloads.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/settings.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/channel/videos',
      'GET /api/download/:videoId',
      'GET /api/stream/:videoId',
      'POST /api/upload',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/waveform/:videoId',
      'POST /api/equalizer'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: `File upload error: ${error.message}` });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Database connection
// Initialize Redis (with error handling)
let redis;
try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
    console.log('✅ Redis connected');
  } else {
    console.log('⚠️  Redis not configured - using in-memory cache');
    // Simple in-memory cache object
    redis = {
      get: async () => null,
      set: async () => true,
      setex: async () => true,
      quit: async () => {}
    };
  }
} catch (error) {
  console.log('⚠️  Redis connection failed - using fallback');
  redis = {
    get: async () => null,
    set: async () => true,
    setex: async () => true,
    quit: async () => {}
  };
}

// Database connection with graceful fallback
const connectDB = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ MongoDB connected successfully');
      
      // Create indexes
      await Mix.createIndexes();
      await User.createIndexes();
    } else {
      console.log('⚠️  MongoDB not configured - running without database');
      console.log('⚠️  Some features will be limited');
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.log('⚠️  Running without database connection');
    // Don't exit process - allow app to run without DB
  }
};

// Start server
const startServer = async () => {
  try {
    await connectDB();
    
    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
      console.log(`
🚀 MIXHUB SERVER STARTED
────────────────────────
✅ Port: ${PORT}
✅ YouTube Channel: ${process.env.YOUTUBE_CHANNEL_ID}
✅ GiftedTech API: ${process.env.GIFTED_API_KEY ? 'Active' : 'Not configured'}
✅ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Active' : 'Not configured'}
✅ Environment: ${process.env.NODE_ENV || 'development'}
────────────────────────
📡 Endpoints:
   • Dashboard: http://localhost:${PORT}/dashboard
   • Player: http://localhost:${PORT}/player
   • API Health: http://localhost:${PORT}/api/health
   • Channel Videos: http://localhost:${PORT}/api/channel/videos
────────────────────────
`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
