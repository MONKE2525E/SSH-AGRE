const jwt = require('jsonwebtoken');
const { createSession, getSession, endSession, activeSessions } = require('../ssh/sshManager');

const JWT_SECRET = process.env.JWT_SECRET;

// SECURITY: Ensure JWT_SECRET is set
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[SECURITY] JWT_SECRET not configured properly in WebSocket');
  process.exit(1);
}

function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    console.log('[WS] New WebSocket connection attempt');
    
    // Extract token from query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
      ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
      ws.close(1008, 'Authentication required');
      return;
    }
    
    // Verify JWT token
    let user;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      ws.close(1008, 'Invalid token');
      return;
    }
    
    console.log(`[WS] Authenticated user: ${user.username}`);
    
    let currentSession = null;
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        switch (data.type) {
          case 'connect':
            // Connect to SSH server
            if (!data.connectionId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Connection ID required' }));
              return;
            }
            
            try {
              // End any existing session for this WebSocket
              if (currentSession) {
                currentSession.disconnect();
                currentSession = null;
              }
              
              currentSession = createSession(parseInt(data.connectionId), user.userId);
              await currentSession.connect(ws);
            } catch (error) {
              console.error('[WS] SSH connection error:', error);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: `Failed to connect: ${error.message}` 
              }));
            }
            break;
            
          case 'input':
            // Send input to SSH session
            if (currentSession && currentSession.connected) {
              currentSession.handleInput(data.data);
            }
            break;
            
          case 'resize':
            // Resize terminal
            if (currentSession && currentSession.connected) {
              currentSession.resize(data.columns, data.rows);
            }
            break;
            
          case 'disconnect':
            // Disconnect from SSH session
            if (currentSession) {
              currentSession.disconnect();
              currentSession = null;
            }
            ws.send(JSON.stringify({ type: 'disconnected' }));
            break;
            
          case 'command':
            // Execute a command macro
            if (currentSession && currentSession.connected && data.command) {
              currentSession.handleInput(data.command + '\n');
            }
            break;
            
          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
      } catch (error) {
        console.error('[WS] Message handling error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
    
    ws.on('close', () => {
      console.log('[WS] WebSocket connection closed');
      if (currentSession) {
        currentSession.disconnect();
        currentSession = null;
      }
    });
    
    ws.on('error', (error) => {
      console.error('[WS] WebSocket error:', error);
      if (currentSession) {
        currentSession.disconnect();
        currentSession = null;
      }
    });
    
    // Send ready message
    ws.send(JSON.stringify({ type: 'ready' }));
  });
}

module.exports = { setupWebSocket };
