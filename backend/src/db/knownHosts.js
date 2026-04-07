const { getDatabase } = require('./database');

/**
 * Get known host key for a given host
 */
function getKnownHost(userId, host, port = 22) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get(
      'SELECT * FROM known_hosts WHERE user_id = ? AND host = ? AND port = ?',
      [userId, host, port],
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
 * Add or update a known host key
 */
function addKnownHost(userId, host, port, keyType, hostKey) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    db.run(
      `INSERT INTO known_hosts (user_id, host, port, key_type, host_key, last_seen, first_seen) 
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, host, port) DO UPDATE SET
       key_type = excluded.key_type,
       host_key = excluded.host_key,
       last_seen = excluded.last_seen`,
      [userId, host, port, keyType, hostKey, now, now],
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

/**
 * Verify host key against known hosts
 * Returns: 'match', 'mismatch', 'new'
 */
async function verifyHostKey(userId, host, port, keyType, hostKey) {
  const known = await getKnownHost(userId, host, port);
  
  if (!known) {
    return { status: 'new', known: null };
  }
  
  if (known.key_type !== keyType || known.host_key !== hostKey) {
    return { 
      status: 'mismatch', 
      known: {
        keyType: known.key_type,
        hostKey: known.host_key,
        lastSeen: known.last_seen
      }
    };
  }
  
  // Update last seen
  await addKnownHost(userId, host, port, keyType, hostKey);
  return { status: 'match', known };
}

/**
 * Get all known hosts for a user
 */
function getUserKnownHosts(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(
      `SELECT id, host, port, key_type, last_seen, first_seen 
       FROM known_hosts 
       WHERE user_id = ? 
       ORDER BY host, port`,
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

/**
 * Delete a known host entry
 */
function deleteKnownHost(userId, hostId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(
      'DELETE FROM known_hosts WHERE id = ? AND user_id = ?',
      [hostId, userId],
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
  getKnownHost,
  addKnownHost,
  verifyHostKey,
  getUserKnownHosts,
  deleteKnownHost
};
