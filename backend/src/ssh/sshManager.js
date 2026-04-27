const { Client } = require('ssh2');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { getConnectionById } = require('../db/connections');
const { verifyHostKey, addKnownHost } = require('../db/knownHosts');
const { logCommand } = require('../db/audit');

const IS_DOCKER = fs.existsSync('/.dockerenv');

// Active SSH sessions storage
const activeSessions = new Map();

// Session timeout: 30 minutes (in milliseconds)
const SESSION_TIMEOUT = 30 * 60 * 1000;
// Keep-alive interval: 30 seconds
const KEEP_ALIVE_INTERVAL = 30000;
// Output buffering: max 16KB per flush to prevent UI freezing
const MAX_BUFFER_SIZE = 16384;
const FLUSH_INTERVAL = 16; // 60fps equivalent

class SSHSession {
  constructor(sessionId, connectionId, userId) {
    this.sessionId = sessionId;
    this.connectionId = connectionId;
    this.userId = userId;
    this.client = new Client();
    this.stream = null;
    this.ws = null;
    this.lastActivity = Date.now();
    this.keepAliveTimer = null;
    this.timeoutTimer = null;
    this.connected = false;
    this.connectionInfo = null;
    // Output buffering for high-speed data
    this.outputBuffer = '';
    this.flushTimer = null;
    this.bufferLock = false;
  }

  async connect(ws) {
    this.ws = ws;
    
    try {
      // Get connection details from database
      this.connectionInfo = await getConnectionById(this.connectionId, this.userId);
      
      if (!this.connectionInfo) {
        throw new Error('Connection not found');
      }

      let targetHost = this.connectionInfo.host;
      // Handle Docker host networking if trying to connect to the host machine
      if ((targetHost === 'localhost' || targetHost === '127.0.0.1') && IS_DOCKER) {
        console.log(`[SSH] Remapping ${targetHost} to host.docker.internal for containerized environment`);
        targetHost = 'host.docker.internal';
      }

      const connectConfig = {
        host: targetHost,
        port: this.connectionInfo.port || 22,
        username: this.connectionInfo.username,
        keepaliveInterval: KEEP_ALIVE_INTERVAL,
        keepaliveCountMax: 3,
        readyTimeout: 20000,
        // SECURITY: Host key verification
        hostHash: 'sha256',
        hostVerifier: async (keyHash) => {
          try {
            return await this.verifyHostKey(keyHash);
          } catch (err) {
            console.error('[SSH] Host verification failed:', err);
            return false;
          }
        }
      };

      if (this.connectionInfo.use_key_auth) {
        connectConfig.privateKey = this.connectionInfo.private_key;
      } else {
        connectConfig.password = this.connectionInfo.password;
      }

      return new Promise((resolve, reject) => {
        this.client.on('ready', () => {
          console.log(`[SSH] Connection established: ${this.sessionId}`);
          this.connected = true;
          this.startKeepAlive();
          this.startTimeoutCheck();
          
          // Open shell session with 256-color terminal type and TUI support
          this.client.shell({
            term: 'xterm-256color',
            cols: 80,
            rows: 24,
            env: {
              TERM: 'xterm-256color',
              COLORTERM: 'truecolor',
              LANG: 'en_US.UTF-8',
              LC_ALL: 'en_US.UTF-8',
              PYTHONUNBUFFERED: '1',
              PYTHONIOENCODING: 'utf-8',
              DOCKER_CLI_HINTS: 'false',
              // Force interactive mode for TUIs
              FORCE_COLOR: '1',
              // Prevent tools from using alternate screen buffer in problematic ways
              LESS: '-R -X',
              // Ensure proper terminal behavior
              EDITOR: 'nano',
              PAGER: 'less'
            }
          }, (err, stream) => {
            if (err) {
              reject(err);
              return;
            }
            
            this.stream = stream;
            this.setupStreamHandlers();
            this.sendToClient({ type: 'connected', sessionId: this.sessionId });
            resolve();
          });
        });

        this.client.on('error', (err) => {
          console.error(`[SSH] Connection error: ${this.sessionId}`, err.message);
          this.sendToClient({ type: 'error', message: err.message });
          reject(err);
        });

        this.client.on('close', () => {
          console.log(`[SSH] Connection closed: ${this.sessionId}`);
          this.cleanup();
        });

        this.client.connect(connectConfig);
      });
    } catch (error) {
      console.error(`[SSH] Connection setup error: ${this.sessionId}`, error);
      throw error;
    }
  }

  setupStreamHandlers() {
    // Buffer management for high-output scenarios
    this.flushOutput = () => {
      if (this.bufferLock || !this.outputBuffer) return;
      
      this.bufferLock = true;
      const dataToSend = this.outputBuffer;
      this.outputBuffer = '';
      
      try {
        this.sendToClient({ 
          type: 'data', 
          data: dataToSend 
        });
      } catch (err) {
        console.error(`[SSH] Failed to send data: ${this.sessionId}`, err);
        // Re-buffer on failure
        this.outputBuffer = dataToSend + this.outputBuffer;
      }
      
      this.bufferLock = false;
    };

    this.stream.on('data', (data) => {
      this.updateActivity();
      
      // Convert buffer to string
      const dataStr = data.toString('utf-8');
      
      // Add to buffer
      this.outputBuffer += dataStr;
      
      // If buffer exceeds max size, flush immediately
      if (this.outputBuffer.length >= MAX_BUFFER_SIZE) {
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        this.flushOutput();
      } else if (!this.flushTimer) {
        // Schedule flush for next frame
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flushOutput();
        }, FLUSH_INTERVAL);
      }
    });

    this.stream.on('close', () => {
      console.log(`[SSH] Stream closed: ${this.sessionId}`);
      // Flush remaining data before closing
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      this.flushOutput();
      this.sendToClient({ type: 'disconnected' });
      this.cleanup();
    });

    this.stream.on('error', (err) => {
      console.error(`[SSH] Stream error: ${this.sessionId}`, err);
      this.sendToClient({ type: 'error', message: err.message });
    });
  }

  handleInput(data) {
    if (this.stream && this.connected) {
      this.updateActivity();
      this.stream.write(data);
      
      // SECURITY: Audit log commands (but not every keystroke)
      // Only log complete commands (ending with newline) or special commands
      if (data.includes('\n') || data.includes('\r')) {
        const command = data.trim();
        if (command) {
          logCommand(this.userId, this.connectionId, this.sessionId, command, 'input')
            .catch(err => console.error('[AUDIT] Failed to log command:', err));
        }
      }
    }
  }

  resize(columns, rows) {
    if (this.stream && this.connected) {
      this.stream.setWindow(rows, columns);
    }
  }

  sendToClient(message) {
    if (this.ws && this.ws.readyState === 1) { // WebSocket.OPEN
      this.ws.send(JSON.stringify(message));
    }
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  startKeepAlive() {
    this.keepAliveTimer = setInterval(() => {
      if (this.client && this.connected) {
        // Send SSH keepalive request
        this.client.exec('echo', (err, stream) => {
          if (err) {
            console.error(`[SSH] Keepalive error: ${this.sessionId}`, err);
          } else {
            stream.close();
          }
        });
      }
    }, KEEP_ALIVE_INTERVAL);
  }

  startTimeoutCheck() {
    this.timeoutTimer = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivity;
      if (inactiveTime > SESSION_TIMEOUT) {
        console.log(`[SSH] Session timeout: ${this.sessionId}`);
        this.sendToClient({ 
          type: 'timeout', 
          message: 'Session closed due to 30 minutes of inactivity' 
        });
        this.disconnect();
      }
    }, 60000); // Check every minute
  }

  disconnect() {
    this.cleanup();
  }

  cleanup() {
    this.connected = false;
    
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush any remaining output
    if (this.outputBuffer && this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify({ type: 'data', data: this.outputBuffer }));
      } catch (err) {
        console.error(`[SSH] Failed to flush final buffer: ${this.sessionId}`, err);
      }
    }
    this.outputBuffer = '';
    
    if (this.stream) {
      this.stream.close();
      this.stream = null;
    }
    
    if (this.client) {
      this.client.end();
    }
    
    // Remove from active sessions
    activeSessions.delete(this.sessionId);
  }

  // SECURITY: Verify SSH host key against known_hosts
  async verifyHostKey(keyHash) {
    try {
      const result = await verifyHostKey(
        this.userId,
        this.connectionInfo.host,
        this.connectionInfo.port || 22,
        'sha256',
        keyHash
      );

      if (result.status === 'match') {
        console.log(`[SSH] Host key verified for ${this.connectionInfo.host}`);
        return true;
      } else if (result.status === 'new') {
        console.log(`[SSH] New host key for ${this.connectionInfo.host}, adding to known hosts`);
        await addKnownHost(
          this.userId,
          this.connectionInfo.host,
          this.connectionInfo.port || 22,
          'sha256',
          keyHash
        );
        // Notify client about new host key
        this.sendToClient({
          type: 'hostkey',
          status: 'new',
          host: this.connectionInfo.host,
          message: `New host key added for ${this.connectionInfo.host}`
        });
        return true;
      } else if (result.status === 'mismatch') {
        console.error(`[SSH] HOST KEY MISMATCH for ${this.connectionInfo.host}!`);
        console.error(`[SSH] Expected: ${result.known.keyType} ${result.known.hostKey}`);
        console.error(`[SSH] Received: sha256 ${keyHash}`);

        // Notify client about mismatch - potential MITM attack
        this.sendToClient({
          type: 'hostkey',
          status: 'mismatch',
          host: this.connectionInfo.host,
          message: `WARNING: Host key mismatch for ${this.connectionInfo.host}! Possible man-in-the-middle attack.`,
          lastSeen: result.known.lastSeen
        });
        return false;
      }
      // Fallback: deny access if status is unknown
      console.error(`[SSH] Unknown host key verification status: ${result.status}`);
      return false;
    } catch (err) {
      console.error('[SSH] Host key verification error:', err);
      return false;
    }
  }
}

// Session management functions
function createSession(connectionId, userId) {
  const sessionId = uuidv4();
  const session = new SSHSession(sessionId, connectionId, userId);
  activeSessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

function endSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.disconnect();
  }
}

function endAllUserSessions(userId) {
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      session.disconnect();
    }
  }
}

function getSessionStatus() {
  const sessions = [];
  for (const [sessionId, session] of activeSessions.entries()) {
    sessions.push({
      sessionId,
      connectionId: session.connectionId,
      userId: session.userId,
      connected: session.connected,
      connectionInfo: session.connectionInfo ? {
        name: session.connectionInfo.name,
        host: session.connectionInfo.host
      } : null
    });
  }
  return sessions;
}

module.exports = {
  SSHSession,
  createSession,
  getSession,
  endSession,
  endAllUserSessions,
  getSessionStatus,
  activeSessions
};
