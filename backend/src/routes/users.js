const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validators, handleValidationErrors } = require('../middleware/security');
const { getUserById, updateUserProfile, getAllUsers, getPendingUsers, approveUser, deleteUser, toggleUserAdmin } = require('../db/users');

const router = express.Router();

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('[USERS] Get profile error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// Update user profile with input validation
router.put('/me', authenticateToken, validators.profile, handleValidationErrors, async (req, res) => {
  try {
    const { name, username, password } = req.body;
    const updates = {};
    
    if (name !== undefined) updates.name = name;
    if (password) updates.password = password;
    
    // Only admins can change their username
    if (username !== undefined && req.user.isAdmin) {
      updates.username = username;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    await updateUserProfile(req.user.userId, updates);
    res.json({ success: true });
  } catch (error) {
    console.error('[USERS] Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Delete current user account
router.delete('/me', authenticateToken, async (req, res) => {
  try {
    await deleteUser(req.user.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[USERS] Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Get all users (admin only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('[USERS] Get all users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get pending users (admin only)
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const users = await getPendingUsers();
    res.json(users);
  } catch (error) {
    console.error('[USERS] Get pending users error:', error);
    res.status(500).json({ error: 'Failed to retrieve pending users' });
  }
});

// Approve user (admin only) with ID validation
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    await approveUser(userId);
    
    // Create default macros for newly approved user
    const { createDefaultMacros } = require('../db/commands');
    await createDefaultMacros(userId);
    
    res.json({ success: true, message: 'User approved successfully' });
  } catch (error) {
    console.error('[USERS] Approve user error:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Delete user (admin only) with ID validation
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account via admin panel' });
    }
    
    await deleteUser(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[USERS] Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Toggle user admin status (admin only) with ID validation
router.post('/:id/toggle-admin', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot change your own admin status' });
    }
    
    const { isAdmin } = req.body;
    await toggleUserAdmin(userId, isAdmin);
    res.json({ success: true, isAdmin });
  } catch (error) {
    console.error('[USERS] Toggle admin error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Reset user password (admin only)
router.post('/:id/reset-password', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Use the Account tab to change your own password' });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'Password must be 8-128 characters' });
    }

    await updateUserProfile(userId, { password: newPassword });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('[USERS] Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
