const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { initializeDatabase } = require('./db/database');
const { getLocalIpAddresses } = require('./utils/networkUtils');

// Load environment variables
dotenv.config();

// Initialize Services
const streamingService = require('./services/streamingService');
const schedulerService = require('./services/schedulerService');
const rotationService = require('./services/rotationService');
const Stream = require('./models/Stream'); // Needed for cleanup on start

const app = express();
const port = process.env.PORT || 7575;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.google.com", "https://www.gstatic.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://www.google.com"],
      frameSrc: ["'self'", "https://www.google.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// Session setup
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: './db'
  }),
  secret: process.env.SESSION_SECRET || 'streamflow_secret_key_change_this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Make user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.userId ? { id: req.session.userId, username: req.session.username, avatar_path: req.session.avatar_path } : null;
  res.locals.path = req.path;
  next();
});

// App Locals (Helpers)
app.locals.helpers = require('./utils/helpers');

// Routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const videoRoutes = require('./routes/videos');
const streamRoutes = require('./routes/streams');
const playlistRoutes = require('./routes/playlists');
const rotationRoutes = require('./routes/rotations');

app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', adminRoutes);
app.use('/', settingsRoutes);
app.use('/', videoRoutes);
app.use('/', streamRoutes);
app.use('/', playlistRoutes);
app.use('/', rotationRoutes);

// Error Handling (Basic)
app.use((req, res, next) => {
  res.status(404).render('404', { title: '404 Not Found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Server Initialization
if (require.main === module) {
  const server = app.listen(port, '0.0.0.0', async () => {
    try {
      await initializeDatabase();
      console.log('Database initialized successfully.');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      process.exit(1);
    }

    const ipAddresses = getLocalIpAddresses();
    console.log(`StreamFlow running at:`);
    if (ipAddresses && ipAddresses.length > 0) {
      ipAddresses.forEach(ip => {
        console.log(`  http://${ip}:${port}`);
      });
    } else {
      console.log(`  http://localhost:${port}`);
    }

    // Cleanup stuck streams
    try {
      const streams = await Stream.findAll(null, 'live');
      if (streams && streams.length > 0) {
        console.log(`Resetting ${streams.length} live streams to offline state...`);
        for (const stream of streams) {
          await Stream.updateStatus(stream.id, 'offline');
        }
      }
    } catch (error) {
      console.error('Error resetting stream statuses:', error);
    }

    // Initialize Services
    schedulerService.init(streamingService);
    rotationService.init();
    try {
      await streamingService.syncStreamStatuses();
    } catch (error) {
      console.error('Failed to sync stream statuses:', error);
    }
  });

  // Server Timeout Settings
  server.timeout = 30 * 60 * 1000;
  server.keepAliveTimeout = 30 * 60 * 1000;
  server.headersTimeout = 30 * 60 * 1000;

  // Graceful Shutdown
  const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    schedulerService.shutdown();
    await streamingService.gracefulShutdown();
    rotationService.shutdown();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await gracefulShutdown();
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown();
  });
}

module.exports = app; // Export for testing