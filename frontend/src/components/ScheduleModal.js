import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config';

const DAYS_OF_WEEK = [
  { id: 0, label: 'Sun', full: 'Sunday' },
  { id: 1, label: 'Mon', full: 'Monday' },
  { id: 2, label: 'Tue', full: 'Tuesday' },
  { id: 3, label: 'Wed', full: 'Wednesday' },
  { id: 4, label: 'Thu', full: 'Thursday' },
  { id: 5, label: 'Fri', full: 'Friday' },
  { id: 6, label: 'Sat', full: 'Saturday' }
];

const FREQUENCIES = [
  { id: 'minute', label: 'Minute' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' }
];

const FAILURE_STRATEGIES = [
  { id: 'continue', label: 'Continue', description: 'Continue to next command' },
  { id: 'stop', label: 'Stop', description: 'Stop execution' },
  { id: 'retry', label: 'Retry', description: 'Retry failed command' }
];

function ScheduleModal({ schedule, connections, commands: savedCommands, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    commands: [{ command: '', delay: 0 }],
    connection_ids: [],
    is_enabled: true,
    failure_strategy: 'continue',
    retry_count: 0,
    schedule_config: {
      frequency: 'daily',
      time: '09:00',
      interval: 1,
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth: 1
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [activeTab, setActiveTab] = useState('commands');

  useEffect(() => {
    if (schedule) {
      setFormData({
        name: schedule.name || '',
        commands: schedule.commands || [{ command: '', delay: 0 }],
        connection_ids: schedule.connection_ids || [],
        is_enabled: schedule.is_enabled !== undefined ? schedule.is_enabled : true,
        failure_strategy: schedule.failure_strategy || 'continue',
        retry_count: schedule.retry_count || 0,
        schedule_config: schedule.schedule_config || {
          frequency: 'daily',
          time: '09:00',
          interval: 1,
          daysOfWeek: [1, 2, 3, 4, 5],
          dayOfMonth: 1
        }
      });
    }
  }, [schedule]);

  useEffect(() => {
    generatePreview();
  }, [formData.schedule_config]);

  const generatePreview = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/schedules/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ schedule_config: formData.schedule_config })
      });
      
      if (response.ok) {
        const data = await response.json();
        setPreview(data);
      }
    } catch (err) {
      console.error('Failed to generate preview:', err);
    }
  }, [formData.schedule_config]);

  const addCommand = () => {
    setFormData(prev => ({
      ...prev,
      commands: [...prev.commands, { command: '', delay: 0 }]
    }));
  };

  const removeCommand = (index) => {
    if (formData.commands.length === 1) return;
    setFormData(prev => ({
      ...prev,
      commands: prev.commands.filter((_, i) => i !== index)
    }));
  };

  const updateCommand = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      commands: prev.commands.map((cmd, i) => 
        i === index ? { ...cmd, [field]: value } : cmd
      )
    }));
  };

  const addSavedCommand = (cmd) => {
    setFormData(prev => ({
      ...prev,
      commands: [...prev.commands, { command: cmd.command, delay: 0 }]
    }));
  };

  const toggleDay = (dayId) => {
    setFormData(prev => ({
      ...prev,
      schedule_config: {
        ...prev.schedule_config,
        daysOfWeek: prev.schedule_config.daysOfWeek.includes(dayId)
          ? prev.schedule_config.daysOfWeek.filter(d => d !== dayId)
          : [...prev.schedule_config.daysOfWeek, dayId].sort()
      }
    }));
  };

  const updateScheduleConfig = (field, value) => {
    setFormData(prev => ({
      ...prev,
      schedule_config: {
        ...prev.schedule_config,
        [field]: value
      }
    }));
  };

  const toggleConnection = (connId) => {
    setFormData(prev => ({
      ...prev,
      connection_ids: prev.connection_ids.includes(connId)
        ? prev.connection_ids.filter(id => id !== connId)
        : [...prev.connection_ids, connId]
    }));
  };

  const selectAllConnections = () => {
    setFormData(prev => ({
      ...prev,
      connection_ids: connections.map(c => c.id)
    }));
  };

  const deselectAllConnections = () => {
    setFormData(prev => ({
      ...prev,
      connection_ids: []
    }));
  };

  const isFormValid = () => {
    const hasName = formData.name.trim().length > 0;
    const hasTargets = formData.connection_ids.length > 0;
    const hasCommands = formData.commands.every(cmd => cmd.command.trim().length > 0);
    return hasName && hasTargets && hasCommands;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isFormValid()) {
      setError('Please fill in all required fields: Schedule name, at least one command, and at least one target connection.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const url = schedule 
        ? `${API_URL}/api/schedules/${schedule.id}`
        : `${API_URL}/api/schedules`;
      const method = schedule ? 'PUT' : 'POST';

      console.log('Submitting schedule payload:', JSON.stringify(formData, null, 2));

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Schedule creation failed:', data);
        throw new Error(data.error || `Failed to ${schedule ? 'update' : 'create'} schedule`);
      }

      const savedSchedule = await response.json();
      console.log('Schedule saved successfully:', savedSchedule);
      onSave(savedSchedule);
    } catch (err) {
      console.error('Schedule submission error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content schedule-modal-v2" onClick={e => e.stopPropagation()}>
        <div className="modal-header-v2">
          <div>
            <h3 className="modal-title">{schedule ? 'Edit Schedule' : 'New Schedule'}</h3>
            {preview && (
              <div className="next-run-preview">
                Next run: {new Date(preview.next_run).toLocaleString()}
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          {/* Schedule Name */}
          <div className="form-section">
            <label className="section-label">Schedule Name</label>
            <input
              type="text"
              className="form-input-lg"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Daily Backup Check"
              required
            />
          </div>

          {/* Tab Navigation */}
          <div className="tab-nav">
            <button
              type="button"
              className={activeTab === 'commands' ? 'active' : ''}
              onClick={() => setActiveTab('commands')}
            >
              Commands ({formData.commands.length})
            </button>
            <button
              type="button"
              className={activeTab === 'schedule' ? 'active' : ''}
              onClick={() => setActiveTab('schedule')}
            >
              When
            </button>
            <button
              type="button"
              className={activeTab === 'targets' ? 'active' : ''}
              onClick={() => setActiveTab('targets')}
            >
              Targets ({formData.connection_ids.length})
            </button>
            <button
              type="button"
              className={activeTab === 'options' ? 'active' : ''}
              onClick={() => setActiveTab('options')}
            >
              Options
            </button>
          </div>

          {/* Commands Tab */}
          {activeTab === 'commands' && (
            <div className="tab-content">
              {savedCommands.length > 0 && (
                <div className="saved-commands-bar">
                  <span>Add saved command:</span>
                  {savedCommands.map(cmd => (
                    <button
                      key={cmd.id}
                      type="button"
                      className="chip-btn"
                      onClick={() => addSavedCommand(cmd)}
                      title={cmd.command}
                    >
                      {cmd.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="commands-list">
                {formData.commands.map((cmd, index) => (
                  <div key={index} className="command-item-v2">
                    <div className="command-number">{index + 1}</div>
                    <div className="command-fields">
                      <input
                        type="text"
                        className="form-input command-input"
                        value={cmd.command}
                        onChange={(e) => updateCommand(index, 'command', e.target.value)}
                        placeholder="Enter command..."
                        required
                      />
                      <div className="delay-field">
                        <label>Wait after:</label>
                        <input
                          type="number"
                          min="0"
                          max="300"
                          value={cmd.delay}
                          onChange={(e) => updateCommand(index, 'delay', parseInt(e.target.value) || 0)}
                        />
                        <span>seconds</span>
                      </div>
                    </div>
                    {formData.commands.length > 1 && (
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => removeCommand(index)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button type="button" className="btn-secondary" onClick={addCommand}>
                + Add Command to Sequence
              </button>
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="tab-content">
              {/* Frequency Selection */}
              <div className="frequency-grid">
                {FREQUENCIES.map(freq => (
                  <button
                    key={freq.id}
                    type="button"
                    className={`freq-card ${formData.schedule_config.frequency === freq.id ? 'active' : ''}`}
                    onClick={() => updateScheduleConfig('frequency', freq.id)}
                  >
                    <span className="freq-label">{freq.label}</span>
                  </button>
                ))}
              </div>

              {/* Time Selection - Hide for minute frequency, show minute picker for hourly */}
              <div className="form-row">
                {formData.schedule_config.frequency !== 'minute' && (
                  <div className="form-col">
                    <label>{formData.schedule_config.frequency === 'hourly' ? 'Minute past hour' : 'Time'}</label>
                    {formData.schedule_config.frequency === 'hourly' ? (
                      <input
                        type="number"
                        min="0"
                        max="59"
                        className="form-input"
                        value={parseInt(formData.schedule_config.time?.split(':')[1] || '0')}
                        onChange={(e) => {
                          const minutes = e.target.value.padStart(2, '0');
                          updateScheduleConfig('time', `00:${minutes}`);
                        }}
                      />
                    ) : (
                      <input
                        type="time"
                        className="form-input"
                        value={formData.schedule_config.time}
                        onChange={(e) => updateScheduleConfig('time', e.target.value)}
                      />
                    )}
                  </div>
                )}
                <div className="form-col">
                  <label>Interval</label>
                  <div className="interval-input">
                    <span>Every</span>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={formData.schedule_config.interval}
                      onChange={(e) => updateScheduleConfig('interval', parseInt(e.target.value) || 1)}
                    />
                    <span>
                      {formData.schedule_config.frequency === 'minute' && 'minutes'}
                      {formData.schedule_config.frequency === 'hourly' && 'hours'}
                      {formData.schedule_config.frequency === 'daily' && 'days'}
                      {formData.schedule_config.frequency === 'weekly' && 'weeks'}
                      {formData.schedule_config.frequency === 'monthly' && 'months'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Days of Week (for weekly) */}
              {formData.schedule_config.frequency === 'weekly' && (
                <div className="days-selector">
                  <label>Days of Week</label>
                  <div className="days-grid">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.id}
                        type="button"
                        className={`day-btn ${formData.schedule_config.daysOfWeek.includes(day.id) ? 'active' : ''}`}
                        onClick={() => toggleDay(day.id)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Day of Month (for monthly) */}
              {formData.schedule_config.frequency === 'monthly' && (
                <div className="form-row">
                  <label>Day of Month</label>
                  <select
                    className="form-input"
                    value={formData.schedule_config.dayOfMonth}
                    onChange={(e) => updateScheduleConfig('dayOfMonth', parseInt(e.target.value))}
                  >
                    {[...Array(31)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Preview */}
              {preview && (
                <div className="schedule-preview-box">
                  <div className="preview-item">
                    <span className="preview-label">Cron:</span>
                    <code className="preview-code">{preview.cron_expression}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Targets Tab */}
          {activeTab === 'targets' && (
            <div className="tab-content">
              <div className="targets-header">
                <span className="selection-count">{formData.connection_ids.length} selected</span>
                <div className="target-actions">
                  <button type="button" className="text-btn" onClick={selectAllConnections}>
                    Select All
                  </button>
                  <button type="button" className="text-btn" onClick={deselectAllConnections}>
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="connections-grid-v2">
                {connections.map(conn => (
                  <label key={conn.id} className={`connection-card-v2 ${formData.connection_ids.includes(conn.id) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={formData.connection_ids.includes(conn.id)}
                      onChange={() => toggleConnection(conn.id)}
                    />
                    <div className="conn-info">
                      <strong>{conn.name}</strong>
                      <span>{conn.username}@{conn.host}:{conn.port}</span>
                    </div>
                  </label>
                ))}
              </div>

              {connections.length === 0 && (
                <div className="empty-hint">
                  <p>No connections available.</p>
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => {
                      onClose();
                      window.location.href = '/dashboard?tab=connections';
                    }}
                  >
                    Create connections
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Options Tab */}
          {activeTab === 'options' && (
            <div className="tab-content">
              <div className="option-group">
                <label>Schedule Status</label>
                <label className="checkbox-v2">
                  <div className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={formData.is_enabled}
                      onChange={(e) => setFormData({...formData, is_enabled: e.target.checked})}
                    />
                    <span className="checkmark"></span>
                    <strong>Enable this schedule</strong>
                  </div>
                  <small>Disabled schedules will not run automatically</small>
                </label>
              </div>

              <div className="option-group">
                <label>Command Timeout (Seconds)</label>
                <div className="interval-input" style={{ marginTop: '8px' }}>
                  <span>Timeout after</span>
                  <input
                    type="number"
                    min="1"
                    max="86400"
                    value={formData.timeout_seconds}
                    onChange={(e) => setFormData({...formData, timeout_seconds: parseInt(e.target.value) || 3600})}
                  />
                  <span>seconds</span>
                </div>
                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '8px' }}>Commands that run longer than this will be safely terminated and logged.</small>
              </div>

              <div className="option-group">
                <label>ON FAILURE</label>
                <div className="strategy-options">
                  {FAILURE_STRATEGIES.map(strategy => (
                    <label key={strategy.id} className={`strategy-card ${formData.failure_strategy === strategy.id ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="failure_strategy"
                        value={strategy.id}
                        checked={formData.failure_strategy === strategy.id}
                        onChange={(e) => setFormData({...formData, failure_strategy: e.target.value})}
                      />
                      <div className="strategy-info">
                        <strong>{strategy.label}</strong>
                        <small>{strategy.description}</small>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formData.failure_strategy === 'retry' && (
                <div className="option-group">
                  <label>Retry Count</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    className="form-input"
                    value={formData.retry_count}
                    onChange={(e) => setFormData({...formData, retry_count: parseInt(e.target.value) || 0})}
                  />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="modal-actions-v2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || !isFormValid()}
            >
              {loading ? 'Saving...' : (schedule ? 'Update Schedule' : 'Create Schedule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ScheduleModal;
