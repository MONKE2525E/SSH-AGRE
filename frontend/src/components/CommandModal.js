import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { parseGroupInput, buildGroupString } from '../utils/groups';
import GroupInput from './GroupInput';

function CommandModal({ command, existingGroups, onClose, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    name: '',
    command: '',
    description: '',
    group: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEditing = !!command;

  useEffect(() => {
    if (command) {
      setFormData({
        name: command.name || '',
        command: command.command || '',
        description: command.description || '',
        group: buildGroupString(command.group_name, command.group_color)
      });
    }
  }, [command]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { group_name, group_color } = parseGroupInput(formData.group);

    try {
      const token = localStorage.getItem('token');
      const url = isEditing
        ? `${API_URL}/api/commands/${command.id}`
        : `${API_URL}/api/commands`;

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          command: formData.command,
          description: formData.description || undefined,
          group_name,
          group_color
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save command');
      }

      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEditing ? 'Edit Command Macro' : 'New Command Macro'}
          </h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., List Directory"
                required
              />
            </div>

            <div className="form-group">
              <label>Command *</label>
              <input
                type="text"
                className="form-input"
                value={formData.command}
                onChange={(e) => setFormData({...formData, command: e.target.value})}
                placeholder="e.g., ls -la"
                required
              />
              <div className="form-hint">The command that will be executed when clicked</div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                className="form-input"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Brief description (optional)"
              />
            </div>

            <GroupInput
              value={formData.group}
              onChange={(val) => setFormData({...formData, group: val})}
              existingGroups={existingGroups}
              datalistId="command-group-suggestions"
            />
          </div>

          <div className="modal-footer">
            {isEditing && onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                style={{marginRight: 'auto'}}
                onClick={onDelete}
              >
                Delete
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Command'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CommandModal;
