const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validators, handleValidationErrors } = require('../middleware/security');
const { 
  getUserMacros, 
  createMacro, 
  updateMacro, 
  deleteMacro 
} = require('../db/commands');

const router = express.Router();

// Get all command macros for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const macros = await getUserMacros(req.user.userId);
    res.json(macros);
  } catch (error) {
    console.error('[COMMANDS] Get macros error:', error);
    res.status(500).json({ error: 'Failed to retrieve command macros' });
  }
});

// Create a new command macro with input validation
router.post('/', authenticateToken, validators.macro, handleValidationErrors, async (req, res) => {
  try {
    const { name, command, description, group_name, group_color } = req.body;

    if (!name || !command) {
      return res.status(400).json({ error: 'Name and command are required' });
    }

    const macro = await createMacro(req.user.userId, { name, command, description, group_name, group_color });
    res.status(201).json(macro);
  } catch (error) {
    console.error('[COMMANDS] Create macro error:', error);
    res.status(500).json({ error: 'Failed to create command macro' });
  }
});

// Update a command macro with input validation
router.put('/:id', authenticateToken, validators.macro, handleValidationErrors, async (req, res) => {
  try {
    const macroId = parseInt(req.params.id);
    if (isNaN(macroId) || macroId <= 0) {
      return res.status(400).json({ error: 'Invalid macro ID' });
    }
    const { name, command, description, group_name, group_color } = req.body;

    if (!name || !command) {
      return res.status(400).json({ error: 'Name and command are required' });
    }

    await updateMacro(macroId, req.user.userId, { name, command, description, group_name, group_color });
    res.json({ success: true });
  } catch (error) {
    console.error('[COMMANDS] Update macro error:', error);
    res.status(500).json({ error: 'Failed to update command macro' });
  }
});

// Delete a command macro
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const macroId = parseInt(req.params.id);
    if (isNaN(macroId) || macroId <= 0) {
      return res.status(400).json({ error: 'Invalid macro ID' });
    }
    await deleteMacro(macroId, req.user.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[COMMANDS] Delete macro error:', error);
    res.status(500).json({ error: 'Failed to delete command macro' });
  }
});

module.exports = router;
