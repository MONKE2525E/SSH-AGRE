const { getDatabase } = require('./database');

function parseConnectionIds(connectionIds) {
  if (Array.isArray(connectionIds)) {
    return JSON.stringify(connectionIds);
  }
  return connectionIds;
}

function stringifyConnectionIds(connectionIds) {
  try {
    const parsed = JSON.parse(connectionIds);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCommands(commands) {
  if (Array.isArray(commands)) {
    return JSON.stringify(commands);
  }
  return commands;
}

function stringifyCommands(commands) {
  try {
    const parsed = JSON.parse(commands);
    return Array.isArray(parsed) ? parsed : [{ command: commands, delay: 0 }];
  } catch {
    return [{ command: commands || '', delay: 0 }];
  }
}

// Convert structured schedule to cron expression
function buildCronExpression(scheduleConfig) {
  const { frequency, time, daysOfWeek, dayOfMonth, interval = 1 } = scheduleConfig;
  const [hours, minutes] = time.split(':');
  
  switch (frequency) {
    case 'minute':
      return `*/${interval} * * * *`;
    case 'hourly':
      return `0 */${interval} * * *`;
    case 'daily':
      return `${minutes} ${hours} */${interval} * *`;
    case 'weekly':
      // daysOfWeek is array like [1,3,5] for Mon,Wed,Fri
      const days = daysOfWeek?.length > 0 ? daysOfWeek.join(',') : '*';
      return `${minutes} ${hours} * * ${days}`;
    case 'monthly':
      const dom = dayOfMonth || 1;
      return `${minutes} ${hours} ${dom} */${interval} *`;
    default:
      return `${minutes} ${hours} * * *`;
  }
}

// Generate human-readable description
function getScheduleDescription(scheduleConfig) {
  if (!scheduleConfig) return 'No configuration';
  const { frequency, time, daysOfWeek, dayOfMonth, interval = 1 } = scheduleConfig;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  switch (frequency) {
    case 'minute':
      return interval === 1 ? 'Every minute' : `Every ${interval} minutes`;
    case 'hourly':
      return interval === 1 ? 'Every hour' : `Every ${interval} hours`;
    case 'daily':
      return interval === 1 ? `Daily at ${time}` : `Every ${interval} days at ${time}`;
    case 'weekly':
      const days = daysOfWeek?.map(d => dayNames[d]).join(', ') || 'all days';
      return interval === 1 
        ? `Weekly on ${days} at ${time}` 
        : `Every ${interval} weeks on ${days} at ${time}`;
    case 'monthly':
      return interval === 1 
        ? `Monthly on day ${dayOfMonth || 1} at ${time}`
        : `Every ${interval} months on day ${dayOfMonth || 1} at ${time}`;
    default:
      return `At ${time}`;
  }
}

// Calculate next run time
function getNextRunTime(cronExpression) {
  // Simple implementation - for production use a proper cron parser
  return new Date(Date.now() + 60000);
}

class Schedules {
  static parseScheduleConfigSafe(config) {
    if (!config) return null;
    if (typeof config === 'object') return config;
    try {
      return JSON.parse(config);
    } catch {
      return null;
    }
  }

  static async getAll(userId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT s.*, 
          (SELECT COUNT(*) FROM schedule_history WHERE schedule_id = s.id) as run_count
         FROM schedules s 
         WHERE s.user_id = ? 
         ORDER BY s.created_at DESC`,
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => ({
              ...row,
              connection_ids: stringifyConnectionIds(row.connection_ids),
              commands: stringifyCommands(row.commands),
              schedule_config: Schedules.parseScheduleConfigSafe(row.schedule_config)
            })));
          }
        }
      );
    });
  }

  static async getById(id, userId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM schedules WHERE id = ? AND user_id = ?`,
        [id, userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve({
              ...row,
              connection_ids: stringifyConnectionIds(row.connection_ids),
              commands: stringifyCommands(row.commands),
              schedule_config: Schedules.parseScheduleConfigSafe(row.schedule_config)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  static async create({ user_id, name, commands, cron_expression, connection_ids, is_enabled = true, failure_strategy = 'continue', retry_count = 0, timeout_seconds = 3600, schedule_config }) {
    const db = getDatabase();
    const connectionIdsStr = parseConnectionIds(connection_ids);
    const commandsStr = parseCommands(commands);
    const scheduleConfigStr = schedule_config ? JSON.stringify(schedule_config) : null;
    
    // Build cron from config if provided
    const finalCron = schedule_config ? buildCronExpression(schedule_config) : cron_expression;
    
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO schedules (user_id, name, commands, cron_expression, connection_ids, is_enabled, failure_strategy, retry_count, timeout_seconds, schedule_config, next_run)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+1 minute'))`,
        [user_id, name, commandsStr, finalCron, connectionIdsStr, is_enabled ? 1 : 0, failure_strategy, retry_count, timeout_seconds, scheduleConfigStr],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  static async update(id, userId, updates) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.commands !== undefined) {
      fields.push('commands = ?');
      values.push(parseCommands(updates.commands));
    }
    if (updates.failure_strategy !== undefined) {
      fields.push('failure_strategy = ?');
      values.push(updates.failure_strategy);
    }
    if (updates.retry_count !== undefined) {
      fields.push('retry_count = ?');
      values.push(updates.retry_count);
    }
    if (updates.timeout_seconds !== undefined) {
      fields.push('timeout_seconds = ?');
      values.push(updates.timeout_seconds);
    }
    if (updates.schedule_config !== undefined) {
      fields.push('schedule_config = ?');
      values.push(updates.schedule_config ? JSON.stringify(updates.schedule_config) : null);
    }
    if (updates.cron_expression !== undefined) {
      fields.push('cron_expression = ?');
      values.push(updates.cron_expression);
    }
    if (updates.connection_ids !== undefined) {
      fields.push('connection_ids = ?');
      values.push(parseConnectionIds(updates.connection_ids));
    }
    if (updates.is_enabled !== undefined) {
      fields.push('is_enabled = ?');
      values.push(updates.is_enabled ? 1 : 0);
    }
    if (updates.last_run !== undefined) {
      fields.push('last_run = ?');
      values.push(updates.last_run);
    }
    if (updates.next_run !== undefined) {
      fields.push('next_run = ?');
      values.push(updates.next_run);
    }

    if (fields.length === 0) {
      return { updated: 0 };
    }

    values.push(id, userId);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE schedules SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
        values,
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ updated: this.changes });
          }
        }
      );
    });
  }

  static async delete(id, userId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM schedules WHERE id = ? AND user_id = ?`,
        [id, userId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ deleted: this.changes });
          }
        }
      );
    });
  }

  static async getEnabledSchedules() {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT s.*, u.username as user_username
         FROM schedules s
         JOIN users u ON s.user_id = u.id
         WHERE s.is_enabled = 1`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => ({
              ...row,
              connection_ids: stringifyConnectionIds(row.connection_ids),
              commands: stringifyCommands(row.commands),
              schedule_config: Schedules.parseScheduleConfigSafe(row.schedule_config)
            })));
          }
        }
      );
    });
  }

  static async addHistory({ schedule_id, connection_id, status, output, error }) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO schedule_history (schedule_id, connection_id, status, output, error)
         VALUES (?, ?, ?, ?, ?)`,
        [schedule_id, connection_id, status, output, error],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  static async getHistory(scheduleId, limit = 50) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT h.*, c.name as connection_name
         FROM schedule_history h
         JOIN connections c ON h.connection_id = c.id
         WHERE h.schedule_id = ?
         ORDER BY h.executed_at DESC
         LIMIT ?`,
        [scheduleId, limit],
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
}

// Export class and helpers
Schedules.buildCronExpression = buildCronExpression;
Schedules.getScheduleDescription = getScheduleDescription;
Schedules.getNextRunTime = getNextRunTime;

module.exports = Schedules;
