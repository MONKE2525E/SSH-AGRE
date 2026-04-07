const { getDatabase } = require('./database');
const bcrypt = require('bcryptjs');

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get('SELECT id, username, name, is_admin, is_approved, created_at FROM users WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function createUser(username, password, name) {
  return new Promise(async (resolve, reject) => {
    const db = getDatabase();
    // SECURITY: Use bcrypt with 12 rounds for stronger hashing
    const hashedPassword = await bcrypt.hash(password, 12);
    
    db.run(
      'INSERT INTO users (username, password, name, is_approved) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, name, 0],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, username, name, is_approved: 0 });
        }
      }
    );
  });
}

function updateUserProfile(userId, updates) {
  return new Promise(async (resolve, reject) => {
    const db = getDatabase();
    const fields = [];
    const values = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    
    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }
    
    if (updates.password) {
      // SECURITY: Use bcrypt with 12 rounds for stronger hashing
      const hashedPassword = await bcrypt.hash(updates.password, 12);
      fields.push('password = ?');
      values.push(hashedPassword);
    }
    
    if (fields.length === 0) {
      resolve();
      return;
    }
    
    values.push(userId);
    
    db.run(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values,
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

function getAllUsers() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all('SELECT id, username, name, is_admin, is_approved, created_at FROM users ORDER BY created_at DESC', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function getPendingUsers() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all('SELECT id, username, name, is_admin, is_approved, created_at FROM users WHERE is_approved = 0 ORDER BY created_at DESC', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function approveUser(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run('UPDATE users SET is_approved = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [userId], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function deleteUser(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function toggleUserAdmin(userId, isAdmin) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run('UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [isAdmin ? 1 : 0, userId], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  getUserByUsername,
  getUserById,
  createUser,
  updateUserProfile,
  getAllUsers,
  getPendingUsers,
  approveUser,
  deleteUser,
  toggleUserAdmin
};
