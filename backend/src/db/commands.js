const { getDatabase } = require('./database');

function getUserMacros(userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(
      'SELECT id, name, command, description, group_name, group_color, created_at FROM command_macros WHERE user_id = ? ORDER BY created_at DESC',
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

function createMacro(userId, macroData) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const { name, command, description, group_name, group_color } = macroData;

    db.run(
      'INSERT INTO command_macros (user_id, name, command, description, group_name, group_color) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name, command, description || null, group_name || null, group_color || null],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...macroData });
        }
      }
    );
  });
}

function updateMacro(macroId, userId, macroData) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const { name, command, description, group_name, group_color } = macroData;

    db.run(
      'UPDATE command_macros SET name = ?, command = ?, description = ?, group_name = ?, group_color = ? WHERE id = ? AND user_id = ?',
      [name, command, description || null, group_name || null, group_color || null, macroId, userId],
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

function deleteMacro(macroId, userId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(
      'DELETE FROM command_macros WHERE id = ? AND user_id = ?',
      [macroId, userId],
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

// Default macros for new users
const DEFAULT_MACROS = [
  { name: 'List Directory', command: 'ls -la', description: 'List all files in current directory' },
  { name: 'Current Directory', command: 'pwd', description: 'Print working directory' },
  { name: 'Disk Usage', command: 'df -h', description: 'Show disk space usage' },
  { name: 'Memory Info', command: 'free -h', description: 'Display memory information' },
  { name: 'Process List', command: 'ps aux | head -20', description: 'Show top processes' },
  { name: 'System Uptime', command: 'uptime', description: 'Show system uptime' },
  { name: 'Network Info', command: 'ip addr', description: 'Display network interfaces' },
  { name: 'Update Packages', command: 'sudo apt update && sudo apt upgrade -y', description: 'Update system packages (Debian/Ubuntu)' }
];

function createDefaultMacros(userId) {
  return Promise.all(DEFAULT_MACROS.map(macro => createMacro(userId, macro)));
}

module.exports = {
  getUserMacros,
  createMacro,
  updateMacro,
  deleteMacro,
  createDefaultMacros,
  DEFAULT_MACROS
};
