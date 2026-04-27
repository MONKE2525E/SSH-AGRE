const { getDatabase } = require('./database');
const { encrypt, decrypt, isEncrypted } = require('../utils/encryption');

function getUserConnections(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(
      `SELECT id, name, host, port, username, use_key_auth, group_name, group_color,
              CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END as has_password,
              CASE WHEN private_key IS NOT NULL THEN 1 ELSE 0 END as has_private_key,
              created_at
       FROM connections
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

function getConnectionById(connectionId, userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get(
      'SELECT * FROM connections WHERE id = ? AND user_id = ?',
      [connectionId, userId],
      (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          // Decrypt sensitive fields
          try {
            if (row.password) {
              row.password = decrypt(row.password);
            }
            if (row.private_key) {
              row.private_key = decrypt(row.private_key);
            }
          } catch (decryptErr) {
            console.error('[DB] Failed to decrypt connection credentials:', decryptErr);
            reject(new Error('Failed to decrypt credentials'));
            return;
          }
          resolve(row);
        } else {
          resolve(null);
        }
      }
    );
  });
}

function createConnection(userId, connectionData) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const { name, host, port, username, password, privateKey, useKeyAuth, group_name, group_color } = connectionData;
    
    // Encrypt sensitive fields
    const encryptedPassword = password ? encrypt(password) : null;
    const encryptedPrivateKey = privateKey ? encrypt(privateKey) : null;
    
    db.run(
      `INSERT INTO connections (user_id, name, host, port, username, password, private_key, use_key_auth, group_name, group_color) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, host, port || 22, username, encryptedPassword, encryptedPrivateKey, useKeyAuth ? 1 : 0, group_name || null, group_color || null],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...connectionData });
        }
      }
    );
  });
}

function updateConnection(connectionId, userId, connectionData) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const { name, host, port, username, password, privateKey, useKeyAuth, group_name, group_color } = connectionData;

    let sql = 'UPDATE connections SET name = ?, host = ?, port = ?, username = ?, group_name = ?, group_color = ?';
    const values = [name, host, port || 22, username, group_name || null, group_color || null];

    if (password !== undefined) {
      sql += ', password = ?';
      values.push(password ? encrypt(password) : null);
    }

    if (privateKey !== undefined) {
      sql += ', private_key = ?';
      values.push(privateKey ? encrypt(privateKey) : null);
    }

    sql += ', use_key_auth = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?';
    values.push(useKeyAuth ? 1 : 0, connectionId, userId);
    
    db.run(sql, values, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function deleteConnection(connectionId, userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(
      'DELETE FROM connections WHERE id = ? AND user_id = ?',
      [connectionId, userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

module.exports = {
  getUserConnections,
  getConnectionById,
  createConnection,
  updateConnection,
  deleteConnection
};
