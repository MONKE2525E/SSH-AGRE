const net = require('net');
const { getUserConnections } = require('../db/connections');

// In-memory store for connection health statuses
// Format: { connectionId: { status: 'online' | 'offline', lastCheck: timestamp } }
const healthStatuses = new Map();

/**
 * Checks connectivity to a specific host and port via TCP
 * @param {string} host 
 * @param {number} port 
 * @param {number} timeout 
 * @returns {Promise<boolean>}
 */
function checkConnectivity(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      status = true;
      socket.destroy();
    });

    socket.on('timeout', () => {
      socket.destroy();
    });

    socket.on('error', () => {
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(status);
    });

    socket.connect(port, host);
  });
}

/**
 * Run health checks for all connections of all users
 * This is meant to be run periodically
 */
async function runAllHealthChecks() {
  try {
    // We need to get all connections from all users
    // Since our DB logic is user-centric, we might need a more global query 
    // or iterate over known connections. For now, let's assume we can get them.
    // NOTE: In a real multi-user app, we'd query all unique connections.
    
    // For simplicity in this implementation, we'll store statuses by connectionId
    // across all users.
    
    const { getDatabase } = require('../db/database');
    const db = getDatabase();
    
    db.all('SELECT id, host, port FROM connections', [], async (err, rows) => {
      if (err) {
        console.error('[HEALTH] Failed to fetch connections for health check:', err);
        return;
      }

      console.log(`[HEALTH] Running health checks for ${rows.length} connections...`);
      
      for (const row of rows) {
        const isOnline = await checkConnectivity(row.host, row.port || 22);
        healthStatuses.set(row.id, {
          status: isOnline ? 'online' : 'offline',
          lastCheck: Date.now()
        });
      }
    });
  } catch (error) {
    console.error('[HEALTH] Error in health check loop:', error);
  }
}

function getHealthStatus(connectionId) {
  return healthStatuses.get(connectionId) || { status: 'unknown', lastCheck: null };
}

function getAllHealthStatuses() {
  return Object.fromEntries(healthStatuses);
}

let healthInterval = null;

function startHealthCheckService(intervalMs = 120000) { // Default 2 minutes
  if (healthInterval) return;
  
  // Run immediately on start
  runAllHealthChecks();
  
  healthInterval = setInterval(runAllHealthChecks, intervalMs);
  console.log(`[HEALTH] Health check service started (interval: ${intervalMs}ms)`);
}

function stopHealthCheckService() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}

module.exports = {
  startHealthCheckService,
  stopHealthCheckService,
  getHealthStatus,
  getAllHealthStatuses,
  runAllHealthChecks
};
