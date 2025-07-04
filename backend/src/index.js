const express = require('express');
const dotenv = require('dotenv');
const { createServer } = require('http');
const routes = require('./api/routes');
const { initializeWebSocket } = require('./services/websocket');
const securityMiddleware = require('./api/middleware/security');
const rateLimiter = require('./api/middleware/rateLimiter');
const { logger } = require('./config/database');
const systemStatusService = require('./services/systemStatus.service');

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize WebSocket
initializeWebSocket(httpServer);
systemStatusService.startHealthMonitoring();

// Security middleware
securityMiddleware(app);

// General rate limiting
app.use('/api', rateLimiter.api);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    next();
  });
}

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - start;
    systemStatusService.recordPerformanceMetric(responseTime);
  });

  next();
});

// API Routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV === 'development';

  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Something went wrong!',
    ...(isDev && { stack: err.stack }),
  });
});

/*
// Start telemetry simulator in development
if (process.env.NODE_ENV === 'development') {
  const telemetrySimulator = require('./services/telemetrySimulator');
  setTimeout(() => {
    telemetrySimulator.start(5000); // Update every 5 seconds
  }, 5000);
}
*/

// Start server
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
});

module.exports = app;