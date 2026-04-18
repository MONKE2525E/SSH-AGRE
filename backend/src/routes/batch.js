const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getConnectionById } = require('../db/connections');
const { logCommand } = require('../db/audit');
const { SSHSession } = require('../ssh/sshManager');

// Batch execute command on multiple connections
router.post('/execute', authenticateToken, async (req, res) => {
  const { command, connectionIds } = req.body;
  const userId = req.user.userId;

  console.log('[BATCH] Execute request:', { command, connectionIds, userId });

  if (!command || typeof command !== 'string' || !connectionIds || !Array.isArray(connectionIds) || connectionIds.length === 0) {
    return res.status(400).json({ error: 'Command and at least one connection ID required' });
  }

  const results = [];
  
  // Execute on each connection
  for (const connectionId of connectionIds) {
    try {
      const connection = await getConnectionById(connectionId, userId);
      console.log('[BATCH] Connection lookup:', { connectionId, found: !!connection, name: connection?.name });
      
      if (!connection) {
        results.push({ connectionId, status: 'error', message: 'Connection not found' });
        continue;
      }

      // Check if we have credentials
      const hasPassword = !!connection.password;
      const hasKey = !!connection.sshKey;
      console.log('[BATCH] Credentials check:', { hasPassword, hasKey, username: connection.username });
      
      if (!hasPassword && !hasKey) {
        results.push({ 
          connectionId, 
          status: 'error', 
          message: 'No stored credentials for this connection. Please edit the connection and add password or SSH key.' 
        });
        continue;
      }

      // Create temporary SSH session
      const session = new SSHSession(connectionId, userId);
      
      // Connect and execute
      await new Promise((resolve, reject) => {
        session.client.on('ready', () => {
          console.log('[BATCH] SSH ready, executing command');
          // codeql[js/uncontrolled-command-line]
          // lgtm[js/uncontrolled-command-line]
          session.client.exec(command, (err, stream) => {
            if (err) {
              reject(err);
              return;
            }
            
            let output = '';
            stream.on('data', (data) => {
              output += data.toString();
            });
            
            stream.on('close', (code) => {
              console.log('[BATCH] Command completed with code:', code);
              resolve({ code, output });
            });
          });
        });
        
        session.client.on('error', (err) => {
          console.error('[BATCH] SSH connection error:', err.message);
          reject(err);
        });
        
        // Connect with connection details
        session.client.connect({
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          privateKey: connection.sshKey,
          readyTimeout: 20000
        });
      });

      // Log the command
      await logCommand(userId, connectionId, `batch-${Date.now()}`, command, 'batch');
      
      results.push({ connectionId, status: 'success', connectionName: connection.name });
    } catch (error) {
      console.error(`[BATCH] Failed on connection ${connectionId}: ${error.message}`);
      results.push({ connectionId, status: 'error', message: error.message });
    }
  }

  console.log('[BATCH] Results:', results);
  res.json({ results });
});

module.exports = router;
exports = router;
