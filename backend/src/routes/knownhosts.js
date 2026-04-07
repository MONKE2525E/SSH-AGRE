const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getUserKnownHosts, deleteKnownHost } = require('../db/knownHosts');

const router = express.Router();

// Get all known hosts for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const hosts = await getUserKnownHosts(req.user.userId);
    res.json(hosts);
  } catch (error) {
    console.error('[KNOWNHOSTS] Get known hosts error:', error);
    res.status(500).json({ error: 'Failed to retrieve known hosts' });
  }
});

// Delete a known host entry
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const hostId = parseInt(req.params.id);
    if (isNaN(hostId) || hostId <= 0) {
      return res.status(400).json({ error: 'Invalid host ID' });
    }
    
    await deleteKnownHost(req.user.userId, hostId);
    res.json({ success: true });
  } catch (error) {
    console.error('[KNOWNHOSTS] Delete known host error:', error);
    res.status(500).json({ error: 'Failed to delete known host' });
  }
});

module.exports = router;
