const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validators, handleValidationErrors } = require('../middleware/security');
const { 
  getUserConnections, 
  getConnectionById, 
  createConnection, 
  updateConnection, 
  deleteConnection 
} = require('../db/connections');
const { getAllHealthStatuses } = require('../utils/healthCheck');

const router = express.Router();

// Get connection health statuses
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const statuses = getAllHealthStatuses();
    res.json(statuses);
  } catch (error) {
    console.error('[CONNECTIONS] Get statuses error:', error);
    res.status(500).json({ error: 'Failed to retrieve statuses' });
  }
});

// Get all connections for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connections = await getUserConnections(req.user.userId);
    res.json(connections);
  } catch (error) {
    console.error('[CONNECTIONS] Get connections error:', error);
    res.status(500).json({ error: 'Failed to retrieve connections' });
  }
});

// Create a new connection with input validation
router.post('/', authenticateToken, validators.connection, handleValidationErrors, async (req, res) => {
  try {
    const { name, host, port, username, password, privateKey, useKeyAuth, group_name, group_color } = req.body;
    
    if (!name || !host || !username) {
      return res.status(400).json({ error: 'Name, host, and username are required' });
    }
    
    if (useKeyAuth && !privateKey) {
      return res.status(400).json({ error: 'Private key is required for key authentication' });
    }
    
    if (!useKeyAuth && password === undefined) {
      return res.status(400).json({ error: 'Password is required for password authentication' });
    }
    
    const connection = await createConnection(req.user.userId, {
      name,
      host,
      port,
      username,
      password,
      privateKey,
      useKeyAuth,
      group_name,
      group_color
    });
    
    res.status(201).json(connection);
  } catch (error) {
    console.error('[CONNECTIONS] Create connection error:', error);
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

// Update a connection with input validation
router.put('/:id', authenticateToken, validators.connection, handleValidationErrors, async (req, res) => {
  try {
    const connectionId = parseInt(req.params.id);
    if (isNaN(connectionId) || connectionId <= 0) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }
    const { name, host, port, username, password, privateKey, useKeyAuth, group_name, group_color } = req.body;

    if (!name || !host || !username) {
      return res.status(400).json({ error: 'Name, host, and username are required' });
    }

    const updateData = { name, host, port, username, privateKey, useKeyAuth, group_name, group_color };
    if (password !== undefined) {
      updateData.password = password;
    }

    await updateConnection(connectionId, req.user.userId, updateData);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[CONNECTIONS] Update connection error:', error);
    res.status(500).json({ error: 'Failed to update connection' });
  }
});

// Delete a connection
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const connectionId = parseInt(req.params.id);
    if (isNaN(connectionId) || connectionId <= 0) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }
    await deleteConnection(connectionId, req.user.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[CONNECTIONS] Delete connection error:', error);
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

module.exports = router;
