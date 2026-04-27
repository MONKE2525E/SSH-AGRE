const cron = require('node-cron');
const Schedules = require('../db/schedules');
const Connections = require('../db/connections');
const { verifyHostKey, addKnownHost } = require('../db/knownHosts');
const { Client } = require('ssh2');

class Scheduler {
  constructor() {
    this.activeTasks = new Map(); // Store running cron tasks by schedule ID
    this.syncInterval = null;
  }

  start() {
    if (this.syncInterval) {
      console.log('[SCHEDULER] Already running');
      return;
    }

    console.log('[SCHEDULER] Starting scheduler service...');

    // Periodically sync tasks with database to catch any out-of-band updates
    this.syncInterval = setInterval(() => {
      this.syncSchedules();
    }, 60000);

    // Run initial sync
    this.syncSchedules();
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    // Stop all active tasks
    for (const [id, task] of this.activeTasks.entries()) {
      task.stop();
    }
    this.activeTasks.clear();
    
    console.log('[SCHEDULER] Scheduler stopped');
  }

  async syncSchedules() {
    try {
      // Get all enabled schedules
      const schedules = await Schedules.getEnabledSchedules();
      const currentScheduleIds = new Set(schedules.map(s => s.id));
      
      // Stop any tasks that are no longer enabled or were deleted
      for (const [id, task] of this.activeTasks.entries()) {
        if (!currentScheduleIds.has(id)) {
          console.log(`[SCHEDULER] Stopping unscheduled/disabled task ${id}`);
          task.stop();
          this.activeTasks.delete(id);
        }
      }

      // Start or update tasks
      for (const schedule of schedules) {
        if (!cron.validate(schedule.cron_expression)) {
          console.error(`[SCHEDULER] Invalid cron expression for schedule ${schedule.id}: ${schedule.cron_expression}`);
          continue;
        }

        if (!this.activeTasks.has(schedule.id)) {
          console.log(`[SCHEDULER] Scheduling task ${schedule.id} with cron: ${schedule.cron_expression}`);
          const task = cron.schedule(schedule.cron_expression, () => {
            console.log(`[SCHEDULER] CRON TRIGGERED - Executing schedule ${schedule.id}: ${schedule.name}`);
            this.executeSchedule(schedule).catch(err => {
              console.error(`[SCHEDULER] Error during execution of schedule ${schedule.id}:`, err);
            });
          });
          this.activeTasks.set(schedule.id, task);
        }
      }
    } catch (error) {
      console.error('[SCHEDULER] Error syncing schedules:', error);
    }
  }

  // Called when a schedule is updated via the API to immediately reflect changes
  async reloadSchedule(scheduleId) {
    try {
      console.log(`[SCHEDULER] Reloading schedule ${scheduleId}`);
      // Stop existing task
      if (this.activeTasks.has(scheduleId)) {
        this.activeTasks.get(scheduleId).stop();
        this.activeTasks.delete(scheduleId);
      }
      // Trigger a sync to pick up the fresh state
      await this.syncSchedules();
    } catch (error) {
      console.error(`[SCHEDULER] Error reloading schedule ${scheduleId}: ${error.message}`);
    }
  }

  async executeCommands(schedule, connection) {
    const commands = schedule.commands || [];
    const results = [];
    let shouldStop = false;

    for (let i = 0; i < commands.length && !shouldStop; i++) {
      const cmd = commands[i];
      console.log(`[SCHEDULER] Executing command ${i + 1}/${commands.length}: ${cmd.command.substring(0, 50)}...`);

      try {
        let result = await this.executeSSHCommand(connection, cmd.command, schedule.timeout_seconds);
        result.commandIndex = i;
        result.command = cmd.command;

        // Handle failure strategies
        if (result.code !== 0 && !result.timedOut) {
          console.log(`[SCHEDULER] Command failed with exit code ${result.code}, strategy: ${schedule.failure_strategy}`);

          if (schedule.failure_strategy === 'stop') {
            console.log('[SCHEDULER] Stopping execution due to failure strategy');
            shouldStop = true;
            result.stopped = true;
          } else if (schedule.failure_strategy === 'retry' && schedule.retry_count > 0) {
            // Retry logic
            let retries = 0;
            while (retries < schedule.retry_count && result.code !== 0 && !result.timedOut) {
              retries++;
              console.log(`[SCHEDULER] Retry attempt ${retries}/${schedule.retry_count}`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between retries
              result = await this.executeSSHCommand(connection, cmd.command, schedule.timeout_seconds);
              result.commandIndex = i;
              result.command = cmd.command;
              result.retried = retries;
            }
          }
        } else if (result.timedOut) {
            console.log(`[SCHEDULER] Command timed out after ${schedule.timeout_seconds || 3600} seconds, treating as clean termination.`);
            result.code = 0; // Treat timeouts as clean cutoffs, not failures
        }

        results.push(result);

        // Delay before next command
        if (cmd.delay > 0 && i < commands.length - 1 && !shouldStop) {
          console.log(`[SCHEDULER] Waiting ${cmd.delay}s before next command`);
          await new Promise(resolve => setTimeout(resolve, cmd.delay * 1000));
        }
      } catch (error) {
        console.error(`[SCHEDULER] Error executing command ${i + 1}:`, error.message);
        results.push({ code: -1, output: '', error: error.message, commandIndex: i, command: cmd.command });

        if (schedule.failure_strategy === 'stop') {
          shouldStop = true;
        }
      }
    }

    return results;
  }

  async executeSchedule(schedule) {
    const results = [];

    for (const connectionId of schedule.connection_ids) {
      try {
        // Get connection details
        const connection = await Connections.getConnectionById(connectionId, schedule.user_id);
        if (!connection) {
          await Schedules.addHistory({
            schedule_id: schedule.id,
            connection_id: connectionId,
            status: 'error',
            error: 'Connection not found or access denied'
          });
          results.push({ connectionId, status: 'error' });
          continue;
        }

        // Execute all commands in sequence with delays
        const cmdResults = await this.executeCommands(schedule, connection);
        const hasErrors = cmdResults.some(r => r.code !== 0);
        const finalResult = cmdResults.length > 0 ? cmdResults[cmdResults.length - 1] : { code: 0 };
        
        // Log history for each command
        for (const result of cmdResults) {
          await Schedules.addHistory({
            schedule_id: schedule.id,
            connection_id: connectionId,
            status: result.code === 0 ? 'success' : 'error',
            output: result.output?.substring(0, 5000), // Increased output limit
            error: result.code !== 0 ? `Exit code: ${result.code}${result.stopped ? ' (stopped)' : ''}${result.retried ? `, retried ${result.retried}x` : ''}` : null
          });
        }

        results.push({ 
          connectionId, 
          status: hasErrors ? 'error' : 'success',
          output: `Executed ${cmdResults.length} commands. Final exit code: ${finalResult.code}`,
          commandResults: cmdResults.map(r => ({
            command: r.command?.substring(0, 50),
            exitCode: r.code,
            stopped: r.stopped,
            retried: r.retried
          }))
        });

      } catch (error) {
        console.error(`[SCHEDULER] Error executing on connection ${connectionId}:`, error.message);
        
        await Schedules.addHistory({
          schedule_id: schedule.id,
          connection_id: connectionId,
          status: 'error',
          error: error.message
        });

        results.push({ connectionId, status: 'error', error: error.message });
      }
    }

    // Update last run time
    await Schedules.update(schedule.id, schedule.user_id, {
      last_run: new Date().toISOString()
    });

    console.log(`[SCHEDULER] Schedule ${schedule.id} execution complete:`, results);
  }

  executeSSHCommand(connection, command, timeoutSeconds = 3600) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';
      let ready = false;
      let timeoutObj = null;

      conn.on('ready', () => {
        ready = true;
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          timeoutObj = setTimeout(() => {
            output += `\n[stdout/stderr]: Command execution reached timeout limit of ${timeoutSeconds} seconds. Terminating connection.`;
            conn.end();
            resolve({ code: 124, output, timedOut: true });
          }, timeoutSeconds * 1000);

          stream.on('close', (code, signal) => {
            if (timeoutObj) clearTimeout(timeoutObj);
            conn.end();
            resolve({ code: code || 0, output, timedOut: false });
          }).on('data', (data) => {
            output += data.toString();
          }).stderr.on('data', (data) => {
            output += `[stderr]: ${data.toString()}`;
          });
        });
      });

      conn.on('error', (err) => {
        if (!ready) {
          reject(err);
        }
      });

      conn.on('end', () => {
        if (!ready) {
          reject(new Error('Connection closed before ready'));
        }
      });

      // Build connection config
      const config = {
        host: connection.host,
        port: connection.port || 22,
        username: connection.username,
        readyTimeout: 30000,
        // SECURITY: Host key verification
        hostHash: 'sha256',
        hostVerifier: (keyHash) => {
          return verifyHostKey(connection.user_id, connection.host, connection.port || 22, 'sha256', keyHash)
            .then(result => {
              if (result.status === 'match') return true;
              if (result.status === 'new') {
                return addKnownHost(connection.user_id, connection.host, connection.port || 22, 'sha256', keyHash)
                  .then(() => true);
              }
              return false; // mismatch
            });
        }
      };

      if (connection.use_key_auth && connection.private_key) {
        config.privateKey = connection.private_key;
      } else if (connection.password) {
        config.password = connection.password;
      } else {
        reject(new Error('No authentication method available'));
        return;
      }

      conn.connect(config);
    });
  }
}

module.exports = new Scheduler();
