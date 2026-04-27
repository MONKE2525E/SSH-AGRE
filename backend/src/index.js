const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const { initializeSecrets } = require('./utils/secrets');

// Initialize security secrets (load from disk or generate new ones)
// This MUST happen before routes or db initialization that might depend on them
initializeSecrets();

const { initDatabase } = require('./db/database');
const authRoutes = require('./routes/auth');
const connectionRoutes = require('./routes/connections');
const commandRoutes = require('./routes/commands');
const userRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');
const knownHostsRoutes = require('./routes/knownhosts');
const batchRoutes = require('./routes/batch');
const scheduleRoutes = require('./routes/schedules');
const scheduler = require('./utils/scheduler');
const { startHealthCheckService } = require('./utils/healthCheck');
const { setupWebSocket } = require('./ws/terminal');
const { apiLimiter, authLimiter, speedLimiter, auditLogger, sanitizeRequest } = require('./middleware/security');

// SECURITY: Use environment variables or defaults
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
const PORT = process.env.PORT || 31457;

// Trust proxy (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// SECURITY: Helmet security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  noSniff: true,
  ieNoOpen: true,
  frameguard: { action: 'deny' },
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

// SECURITY: Strict CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:27291', 'http://127.0.0.1:27291'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
};
app.use(cors(corsOptions));

// SECURITY: Request size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// SECURITY: Sanitize all incoming requests
app.use(sanitizeRequest);

// SECURITY: Apply stricter rate limiting
app.use('/api/auth/login', authLimiter, speedLimiter);
app.use('/api/auth/register', authLimiter, speedLimiter);
app.use('/api/', apiLimiter);
app.use('/api/', auditLogger);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} Request received`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/commands', commandRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/known-hosts', knownHostsRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/schedules', scheduleRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SECURITY: Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(500).json({ error: message });
});

// SECURITY: 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/terminal' });

// Setup WebSocket for terminal
setupWebSocket(wss);

// SECURITY: Graceful shutdown
const shutdown = () => {
  console.log('[SERVER] Shutdown received, closing...');
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize and start
async function start() {
  try {
    await initDatabase();
    console.log('[INIT] Database initialized');
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] SSH AGRE Backend running on port ${PORT}`);
      scheduler.start();
      startHealthCheckService(120000);
    });
  } catch (error) {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
  }
}

start();
