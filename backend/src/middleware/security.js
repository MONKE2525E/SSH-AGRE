const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');

// Strict rate limiter for auth endpoints (5 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Speed limiter - progressively slower responses for repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 2, // allow 2 requests at full speed
  delayMs: 500, // add 500ms delay per request after delayAfter
  maxDelayMs: 5000, // maximum delay of 5 seconds
});

// General API rate limiter (50 per minute)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for SSH command endpoints (20 per minute)
const sshCommandLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 commands per minute for SSH
  message: { error: 'Too many SSH commands. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation rules
const validators = {
  // Auth validators
  login: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 32 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username must be 3-32 alphanumeric characters'),
    body('password')
      .isLength({ min: 6, max: 128 })
      .withMessage('Password must be 6-128 characters')
  ],
  
  register: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 32 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username must be 3-32 alphanumeric characters'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be 8+ chars with uppercase, lowercase, and number'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\s-]+$/)
      .withMessage('Name must be 1-100 characters')
  ],
  
  // Connection validators
  connection: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\s-]+$/)
      .withMessage('Name must be 1-100 alphanumeric characters'),
    body('host')
      .trim()
      .isLength({ min: 1, max: 255 })
      .matches(/^[a-zA-Z0-9_.-]+$/)
      .withMessage('Host must be a valid hostname or IP'),
    body('port')
      .isInt({ min: 1, max: 65535 })
      .withMessage('Port must be 1-65535'),
    body('username')
      .trim()
      .isLength({ min: 1, max: 64 })
      .matches(/^[a-zA-Z0-9_@-]+$/)
      .withMessage('SSH username must be valid'),
    body('password')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Password too long'),
    body('privateKey')
      .optional()
      .isLength({ max: 10000 })
      .withMessage('Private key too large')
  ],
  
  // Macro validators
  macro: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\s-]+$/)
      .withMessage('Name must be 1-100 alphanumeric characters'),
    body('command')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Command must be 1-1000 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be under 500 characters')
  ],
  
  // Profile validators
  profile: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\s-]+$/)
      .withMessage('Name must be 1-100 alphanumeric characters'),
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 32 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username must be 3-32 alphanumeric characters'),
    body('password')
      .optional()
      .isLength({ min: 8, max: 128 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be 8+ chars with uppercase, lowercase, and number')
  ]
};

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// Security audit logger
const auditLogger = (req, res, next) => {
  // Log security-sensitive operations
  const sensitivePaths = ['/login', '/register', '/approve', '/delete', '/me'];
  const isSensitive = sensitivePaths.some(p => req.path.includes(p));
  
  if (isSensitive || req.method !== 'GET') {
    console.log(`[AUDIT] ${req.method} ${req.path} | User: ${req.user?.username || 'anonymous'} | IP: ${req.ip}`);
  }
  next();
};

// Sanitize input to prevent injection
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .trim();
};

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    });
  }
  next();
};

module.exports = {
  authLimiter,
  speedLimiter,
  apiLimiter,
  sshCommandLimiter,
  validators,
  handleValidationErrors,
  auditLogger,
  sanitizeRequest
};
