const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const { initDatabase, createAdminUser } = require('./db/database');
const authRoutes = require('./routes/auth');
const connectionRoutes = require('./routes/connections');
const commandRoutes = require('./routes/commands');
const userRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');
const knownHostsRoutes = require('./routes/knownhosts');
const { setupWebSocket } = require('./ws/terminal');
const { apiLimiter, authLimiter, speedLimiter, auditLogger, sanitizeRequest } = require('./middleware/security');

// SECURITY: Require strong JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[SECURITY] FATAL: JWT_SECRET must be set and at least 32 characters long');
  console.error('[SECURITY] Set a secure random secret: export JWT_SECRET=$(openssl rand -base64 48)');
  process.exit(1);
}

// SECURITY: Require strong admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  console.error('[SECURITY] FATAL: ADMIN_PASSWORD must be set and at least 12 characters long');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 31457;

// Trust proxy (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// SECURITY: Helmet security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for xterm.js
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for WebSocket compatibility
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  noSniff: true,
  ieNoOpen: true,
  frameguard: { action: 'deny' }, // Prevent clickjacking
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

// SECURITY: Strict CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:27291'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
};
app.use(cors(corsOptions));

// SECURITY: Request size limits to prevent DoS
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// SECURITY: Sanitize all incoming requests
app.use(sanitizeRequest);

// SECURITY: Apply stricter rate limiting to auth endpoints
app.use('/api/auth/login', authLimiter, speedLimiter);
app.use('/api/auth/register', authLimiter, speedLimiter);

// SECURITY: General API rate limiting (50 per minute)
app.use('/api/', apiLimiter);

// SECURITY: Audit logging for sensitive operations
app.use('/api/', auditLogger);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/commands', commandRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/known-hosts', knownHostsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SECURITY: Global error handler - don't leak stack traces
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  // In production, don't expose error details
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
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

// SECURITY: Graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

// Initialize and start
async function start() {
  try {
    await initDatabase();
    // Admin user creation now handled by setup wizard
    // await createAdminUser();
    console.log('[INIT] Database initialized');
    console.log('[INIT] First-time setup available at /api/auth/setup-status');
    console.log('[SECURITY] Security middleware active');
    console.log(`[SECURITY] JWT secret length: ${JWT_SECRET.length} chars`);
    console.log(`[SECURITY] Admin password length: ${ADMIN_PASSWORD.length} chars`);
    console.log(`[SECURITY] CORS origins: ${corsOptions.origin}`);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] SSH AGRE Backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
  }
}

start();
