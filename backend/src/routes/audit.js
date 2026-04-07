const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getAuditLog, getAuditStats } = require('../db/audit');

const router = express.Router();

// Get command audit log for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit, offset, connectionId, sessionId, commandType, startDate, endDate } = req.query;
    
    const options = {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      connectionId: connectionId || null,
      sessionId: sessionId || null,
      commandType: commandType || null,
      startDate: startDate || null,
      endDate: endDate || null
    };
    
    const logs = await getAuditLog(req.user.userId, options);
    res.json(logs);
  } catch (error) {
    console.error('[AUDIT] Get audit log error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit log' });
  }
});

// Get audit statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { days } = req.query;
    const stats = await getAuditStats(req.user.userId, parseInt(days) || 30);
    res.json(stats);
  } catch (error) {
    console.error('[AUDIT] Get audit stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit statistics' });
  }
});

module.exports = router;
