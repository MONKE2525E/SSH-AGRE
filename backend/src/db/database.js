const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/ssh_agre.db');

let db = null;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[DB] Error opening database:', err);
      } else {
        console.log('[DB] Connected to SQLite database');
      }
    });
  }
  return db;
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    
    database.serialize(() => {
      // Users table
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT,
          is_admin BOOLEAN DEFAULT 0,
          is_approved BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Migration: Add is_approved column if it doesn't exist (for existing databases)
      database.run(`
        ALTER TABLE users ADD COLUMN is_approved BOOLEAN DEFAULT 0
      `, (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column')) {
          console.error('[DB] Migration error:', err.message);
        }
      });

      // Known hosts table for SSH host key verification
      database.run(`
        CREATE TABLE IF NOT EXISTS known_hosts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          host TEXT NOT NULL,
          port INTEGER DEFAULT 22,
          key_type TEXT NOT NULL,
          host_key TEXT NOT NULL,
          first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, host, port),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Command audit log table
      database.run(`
        CREATE TABLE IF NOT EXISTS command_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          connection_id INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          command TEXT,
          command_type TEXT DEFAULT 'input',
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        )
      `);

      // SSH Connections table
      database.run(`
        CREATE TABLE IF NOT EXISTS connections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER DEFAULT 22,
          username TEXT NOT NULL,
          password TEXT,
          private_key TEXT,
          use_key_auth BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Command macros table
      database.run(`
        CREATE TABLE IF NOT EXISTS command_macros (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          command TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Scheduled commands table with structured scheduling
      database.run(`
        CREATE TABLE IF NOT EXISTS schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          commands TEXT NOT NULL,
          cron_expression TEXT NOT NULL,
          connection_ids TEXT NOT NULL,
          is_enabled BOOLEAN DEFAULT 1,
          last_run DATETIME,
          next_run DATETIME,
          failure_strategy TEXT DEFAULT 'continue',
          retry_count INTEGER DEFAULT 0,
          schedule_config TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('[DB] Error creating schedules table:', err.message);
          return;
        }
        
        console.log('[DB] Schedules table ready, running migrations...');
        
        // Migration: Add new columns if they don't exist
        database.serialize(() => {
          database.run(`ALTER TABLE schedules ADD COLUMN commands TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.error('[DB] Migration commands error:', err.message);
            } else if (!err) {
              console.log('[DB] Migration: commands column added');
            }
          });
          
          database.run(`ALTER TABLE schedules ADD COLUMN failure_strategy TEXT DEFAULT 'continue'`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.error('[DB] Migration failure_strategy error:', err.message);
            } else if (!err) {
              console.log('[DB] Migration: failure_strategy column added');
            }
          });
          
          database.run(`ALTER TABLE schedules ADD COLUMN retry_count INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.error('[DB] Migration retry_count error:', err.message);
            } else if (!err) {
              console.log('[DB] Migration: retry_count column added');
            }
          });

          database.run(`ALTER TABLE schedules ADD COLUMN timeout_seconds INTEGER DEFAULT 3600`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.error('[DB] Migration timeout_seconds error:', err.message);
            } else if (!err) {
              console.log('[DB] Migration: timeout_seconds column added');
            }
          });
          
          database.run(`ALTER TABLE schedules ADD COLUMN schedule_config TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.error('[DB] Migration schedule_config error:', err.message);
            } else if (!err) {
              console.log('[DB] Migration: schedule_config column added');
            }
          });
        });
      });

      // Schedule execution history
      database.run(`
        CREATE TABLE IF NOT EXISTS schedule_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          schedule_id INTEGER NOT NULL,
          connection_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          output TEXT,
          error TEXT,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
          FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          // Add indexes for performance
          database.run('CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id)');
          database.run('CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id)');
          database.run('CREATE INDEX IF NOT EXISTS idx_schedule_history_schedule_id ON schedule_history(schedule_id)');
          database.run('CREATE INDEX IF NOT EXISTS idx_command_audit_user_id ON command_audit_log(user_id)');
          
          resolve();
        }
      });
    });
  });
}

async function createAdminUser() {
  const database = getDatabase();
  
  // SECURITY: Require strong admin password from environment
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    console.error('[SECURITY] FATAL: ADMIN_PASSWORD must be set and at least 12 characters long');
    process.exit(1);
  }
  
  // SECURITY: Use bcrypt with 12 rounds (higher = more secure but slower)
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  
  return new Promise((resolve, reject) => {
    database.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        database.run(
          'INSERT INTO users (username, password, name, is_admin, is_approved) VALUES (?, ?, ?, ?, ?)',
          ['admin', hashedPassword, 'Administrator', 1, 1],
          (err) => {
            if (err) {
              reject(err);
            } else {
              console.log('[INIT] Admin user created successfully');
              console.log('[SECURITY] Admin password hash generated with bcrypt (12 rounds)');
              resolve();
            }
          }
        );
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  getDatabase,
  initDatabase,
  createAdminUser
};
