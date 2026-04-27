const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const { getUserByUsername, createUser, getAllUsers } = require('../db/users');
const { validators, handleValidationErrors } = require('../middleware/security');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// SECURITY: Ensure JWT_SECRET is set
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[SECURITY] JWT_SECRET not configured properly');
  process.exit(1);
}

// Check if setup is required (no users exist yet)
router.get('/setup-status', async (req, res) => {
  try {
    const users = await getAllUsers();
    const needsSetup = users.length === 0;
    res.json({ needsSetup, hasUsers: users.length > 0 });
  } catch (error) {
    console.error('[AUTH] Setup status error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// First-time setup: create admin user
router.post('/setup', validators.register, handleValidationErrors, async (req, res) => {
  try {
    const users = await getAllUsers();
    if (users.length > 0) {
      return res.status(400).json({ error: 'Setup already completed. Please login.' });
    }

    const { username, password, name } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Strong password validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      return res.status(400).json({ 
        error: 'Password must contain uppercase, lowercase, and numbers' 
      });
    }

    // Create first user as admin
    const user = await createUser(username, password, name || username);
    
    // Approve and make admin (bypass normal approval flow for first user)
    const database = require('../db/database').getDatabase();
    await new Promise((resolve, reject) => {
      database.run(
        'UPDATE users SET is_admin = 1, is_approved = 1 WHERE id = ?',
        [user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    console.log('[AUTH] First admin created during setup');
    
    // Generate token and return
    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: true },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: name || username,
        isAdmin: true
      },
      setupComplete: true
    });
  } catch (error) {
    console.error('[AUTH] Setup error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// Login with input validation
router.post('/login', validators.login, handleValidationErrors, async (req, res) => {
  console.log('[AUTH] Login attempt');
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const user = await getUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if user is approved
    if (!user.is_approved && !user.is_admin) {
      console.log('[AUTH] User not approved');
      return res.status(403).json({ error: 'Your account is pending admin approval' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('[AUTH] Login successful');
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        isAdmin: user.is_admin === 1
      }
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register with input validation and strong password requirements
router.post('/register', validators.register, handleValidationErrors, async (req, res) => {
  console.log('[AUTH] Register attempt');
  try {
    const { username, password, name } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Check password complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      return res.status(400).json({ 
        error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' 
      });
    }
    
    const existingUser = await getUserByUsername(username);
    
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    const user = await createUser(username, password, name || username);
    
    // Don't create default macros or token - user needs approval first
    console.log('[AUTH] Registration pending approval');
    res.status(201).json({
      message: 'Registration successful. Your account is pending admin approval.',
      pending: true
    });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark setup as complete
router.post('/setup-complete', authenticateToken, async (req, res) => {
  res.json({ success: true });
});

module.exports = router;
