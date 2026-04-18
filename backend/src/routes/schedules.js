const express = require('express');
const router = express.Router();
const Schedules = require('../db/schedules');
const Scheduler = require('../utils/scheduler');
const { authenticateToken } = require('../middleware/auth');

// Get all schedules for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const schedules = await Schedules.getAll(req.user.userId || req.user.id);
    res.json(schedules);
  } catch (error) {
    console.error('[SCHEDULES] Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Get a specific schedule
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const schedule = await Schedules.getById(req.params.id, req.user.userId || req.user.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json(schedule);
  } catch (error) {
    console.error('[SCHEDULES] Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Create a new schedule
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, commands, schedule_config, connection_ids, is_enabled, failure_strategy, retry_count, timeout_seconds } = req.body;
    
    console.log('[SCHEDULES] CREATE - Received payload:', JSON.stringify(req.body, null, 2));
    
    // Validation
    if (!name || !commands || commands.length === 0 || !connection_ids || connection_ids.length === 0) {
      console.log('[SCHEDULES] CREATE - Validation failed:', { name, commands, connection_ids });
      return res.status(400).json({ 
        error: 'Missing required fields: name, commands, connection_ids' 
      });
    }

    // Build cron from visual config
    let cron_expression;
    if (schedule_config) {
      console.log('[SCHEDULES] CREATE - Building cron from config:', schedule_config);
      cron_expression = Schedules.buildCronExpression(schedule_config);
    } else {
      console.log('[SCHEDULES] CREATE - Missing schedule_config');
      return res.status(400).json({ error: 'Missing schedule_config' });
    }

    const createData = {
      user_id: req.user.userId || req.user.id,
      name,
      commands,
      cron_expression,
      connection_ids,
      is_enabled,
      failure_strategy: failure_strategy || 'continue',
      retry_count: retry_count || 0,
      timeout_seconds: timeout_seconds || 3600,
      schedule_config
    };
    console.log('[SCHEDULES] CREATE - Calling Schedules.create with:', JSON.stringify(createData, null, 2));
    
    const result = await Schedules.create(createData);

    // Tell scheduler to reload immediately
    try {
      Scheduler.reloadSchedule(result.id);
    } catch (schedErr) {
      console.error('[SCHEDULES] Error reloading scheduler after create:', schedErr);
    }

    const schedule = await Schedules.getById(result.id, req.user.userId || req.user.id);
    res.status(201).json(schedule);
  } catch (error) {
    console.error('[SCHEDULES] Error creating schedule:', error);
    res.status(500).json({ 
      error: 'Failed to create schedule',
      details: error.message 
    });
  }
});

// Update a schedule
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, commands, schedule_config, connection_ids, is_enabled, failure_strategy, retry_count, timeout_seconds } = req.body;

    const updates = {
      name,
      commands,
      connection_ids,
      is_enabled,
      failure_strategy,
      retry_count,
      timeout_seconds
    };

    // If schedule_config provided, rebuild cron
    if (schedule_config) {
      updates.cron_expression = Schedules.buildCronExpression(schedule_config);
      updates.schedule_config = schedule_config;
    }

    const result = await Schedules.update(req.params.id, req.user.userId || req.user.id, updates);

    if (result.updated === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Tell scheduler to reload immediately
    try {
      Scheduler.reloadSchedule(req.params.id);
    } catch (schedErr) {
      console.error('[SCHEDULES] Error reloading scheduler after update:', schedErr);
    }

    const schedule = await Schedules.getById(req.params.id, req.user.userId || req.user.id);
    res.json(schedule);
  } catch (error) {
    console.error('[SCHEDULES] Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete a schedule
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await Schedules.delete(req.params.id, req.user.userId || req.user.id);
    
    if (result.deleted === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Tell scheduler to clear the task
    try {
      Scheduler.reloadSchedule(req.params.id);
    } catch (schedErr) {
      console.error('[SCHEDULES] Error reloading scheduler after delete:', schedErr);
    }

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('[SCHEDULES] Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// Get schedule execution history
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    // Verify schedule belongs to user
    const schedule = await Schedules.getById(req.params.id, req.user.userId || req.user.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const history = await Schedules.getHistory(req.params.id, limit);
    res.json(history);
  } catch (error) {
    console.error('[SCHEDULES] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch schedule history' });
  }
});

// Preview cron from schedule config
router.post('/preview', authenticateToken, async (req, res) => {
  try {
    const { schedule_config } = req.body;
    if (!schedule_config) {
      return res.status(400).json({ error: 'Missing schedule_config' });
    }

    const cron = Schedules.buildCronExpression(schedule_config);
    const description = Schedules.getScheduleDescription(schedule_config);
    const nextRun = Schedules.getNextRunTime(cron);

    res.json({
      cron_expression: cron,
      description,
      next_run: nextRun
    });
  } catch (error) {
    console.error('[SCHEDULES] Error previewing schedule:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Manually trigger a schedule
router.post('/:id/run', authenticateToken, async (req, res) => {
  console.log(`[SCHEDULES] Manual run requested for schedule ${req.params.id}`);
  try {
    const userId = req.user.userId || req.user.id;
    const schedule = await Schedules.getById(req.params.id, userId);
    
    if (!schedule) {
      console.log(`[SCHEDULES] Manual run failed: Schedule ${req.params.id} not found for user ${userId}`);
      return res.status(404).json({ error: 'Schedule not found' });
    }

    console.log(`[SCHEDULES] Manually executing schedule ${schedule.id}: ${schedule.name}`);
    
    // Run the schedule asynchronously so it doesn't block the request
    Scheduler.executeSchedule(schedule).catch(err => {
      console.error('[SCHEDULES] Error in manual schedule run execution:', err);
    });

    res.json({ message: 'Schedule execution started' });
  } catch (error) {
    console.error('[SCHEDULES] Error in manual run route:', error);
    res.status(500).json({ error: 'Failed to run schedule', details: error.message });
  }
});

module.exports = router;
