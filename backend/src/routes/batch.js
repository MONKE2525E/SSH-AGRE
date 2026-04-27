const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getConnectionById } = require('../db/connections');
const { logCommand } = require('../db/audit');
const { verifyHostKey, addKnownHost } = require('../db/knownHosts');
const { SSHSession } = require('../ssh/sshManager');

const MAX_COMMAND_LENGTH = 1000;
const ALLOWED_BATCH_COMMANDS = new Set([
  'uptime',
  'whoami',
  'hostname',
  'date',
  'df -h',
  'free -m',
  'uname -a'
]);

function isSafeBatchCommand(command) {
  if (typeof command !== 'string') return false;

  const trimmed = command.trim();
  if (!trimmed || trimmed.length > MAX_COMMAND_LENGTH) return false;

  // Disallow shell metacharacters/control chars used for chaining/substitution/redirection.
  // This allows simple single commands with arguments while blocking common injection vectors.
  const forbiddenPattern = /[;&|`$<>\n\r\\]|(\|\|)|(&&)|\$\(|\$\{/;
  return !forbiddenPattern.test(trimmed);
}

function getAllowedBatchCommand(command) {
  if (typeof command !== 'string') return null;
  const normalized = command.trim().replace(/\s+/g, ' ');
  return ALLOWED_BATCH_COMMANDS.has(normalized) ? normalized : null;
}

// Batch execute command on multiple connections
router.post('/execute', authenticateToken, async (req, res) => {
  const { command, connectionIds } = req.body;
  const userId = req.user.userId;
  const allowedCommand = getAllowedBatchCommand(command);

  console.log('[BATCH] Execute request:', { command, connectionIds, userId });

  if (!allowedCommand || !connectionIds || !Array.isArray(connectionIds) || connectionIds.length === 0) {
    return res.status(400).json({ error: 'An allowed safe command and at least one connection ID are required' });
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
      const hasKey = !!connection.private_key;
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
          // Execute only validated allowlisted command.
          session.client.exec(allowedCommand, (err, stream) => {
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
          privateKey: connection.private_key,
          readyTimeout: 20000,
          // SECURITY: Host key verification
          hostHash: 'sha256',
          hostVerifier: (keyHash) => {
            return verifyHostKey(userId, connection.host, connection.port || 22, 'sha256', keyHash)
              .then(result => {
                if (result.status === 'match') return true;
                if (result.status === 'new') {
                  return addKnownHost(userId, connection.host, connection.port || 22, 'sha256', keyHash)
                    .then(() => true);
                }
                return false; // mismatch
              });
          }
        });
      });

      // Log the command
      await logCommand(userId, connectionId, `batch-${Date.now()}`, allowedCommand, 'batch');
      
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
