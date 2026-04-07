const { getDatabase } = require('./database');

/**
 * Log a command or input to the audit log
 */
function logCommand(userId, connectionId, sessionId, command, commandType = 'input') {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    // Truncate very long commands to prevent DB bloat
    const truncatedCommand = command && command.length > 1000 
      ? command.substring(0, 1000) + '...[truncated]' 
      : command;
    
    db.run(
      `INSERT INTO command_audit_log (user_id, connection_id, session_id, command, command_type) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, connectionId, sessionId, truncatedCommand, commandType],
      (err) => {
        if (err) {
          console.error('[AUDIT] Failed to log command:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Get audit log entries for a user
 * Supports pagination and filtering
 */
function getAuditLog(userId, options = {}) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const { 
      limit = 100, 
      offset = 0, 
      connectionId = null,
      sessionId = null,
      commandType = null,
      startDate = null,
      endDate = null
    } = options;
    
    let sql = `
      SELECT 
        cal.id,
        cal.command,
        cal.command_type,
        cal.timestamp,
        cal.session_id,
        c.name as connection_name,
        c.host,
        c.port
      FROM command_audit_log cal
      JOIN connections c ON cal.connection_id = c.id
      WHERE cal.user_id = ?
    `;
    const params = [userId];
    
    if (connectionId) {
      sql += ' AND cal.connection_id = ?';
      params.push(connectionId);
    }
    
    if (sessionId) {
      sql += ' AND cal.session_id = ?';
      params.push(sessionId);
    }
    
    if (commandType) {
      sql += ' AND cal.command_type = ?';
      params.push(commandType);
    }
    
    if (startDate) {
      sql += ' AND cal.timestamp >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      sql += ' AND cal.timestamp <= ?';
      params.push(endDate);
    }
    
    sql += ' ORDER BY cal.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Get audit log statistics for a user
 */
function getAuditStats(userId, days = 30) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    db.get(
      `SELECT 
        COUNT(*) as total_commands,
        COUNT(DISTINCT connection_id) as unique_connections,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT DATE(timestamp)) as active_days
       FROM command_audit_log 
       WHERE user_id = ? AND timestamp >= ?`,
      [userId, cutoffDate.toISOString()],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

/**
 * Clean up old audit log entries
 * Keeps last 90 days by default
 */
function cleanupOldAuditLogs(daysToKeep = 90) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    db.run(
      'DELETE FROM command_audit_log WHERE timestamp < ?',
      [cutoffDate.toISOString()],
      function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`[AUDIT] Cleaned up ${this.changes} old audit log entries`);
          resolve(this.changes);
        }
      }
    );
  });
}

module.exports = {
  logCommand,
  getAuditLog,
  getAuditStats,
  cleanupOldAuditLogs
};
