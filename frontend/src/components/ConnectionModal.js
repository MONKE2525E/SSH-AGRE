import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

function ConnectionModal({ connection, onClose, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    useKeyAuth: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEditing = !!connection;

  useEffect(() => {
    if (connection) {
      setFormData({
        name: connection.name || '',
        host: connection.host || '',
        port: connection.port || 22,
        username: connection.username || '',
        password: '',
        privateKey: '',
        useKeyAuth: connection.use_key_auth === 1
      });
    }
  }, [connection]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const url = isEditing 
        ? `${API_URL}/api/connections/${connection.id}`
        : `${API_URL}/api/connections`;
      
      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          host: formData.host,
          port: parseInt(formData.port) || 22,
          username: formData.username,
          password: formData.password || undefined,
          privateKey: formData.privateKey || undefined,
          useKeyAuth: formData.useKeyAuth
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save connection');
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
      <div className="modal-content connection-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEditing ? 'Edit Connection' : 'New Connection'}
          </h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="connection-form">
          <div className="modal-body">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Production Server"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Host *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.host}
                  onChange={(e) => setFormData({...formData, host: e.target.value})}
                  placeholder="hostname or IP"
                  required
                />
              </div>
              <div className="form-group">
                <label>Port</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.port}
                  onChange={(e) => setFormData({...formData, port: e.target.value})}
                  placeholder="22"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Username *</label>
              <input
                type="text"
                className="form-input"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                placeholder="root"
                required
              />
            </div>

            <div className="checkbox-group">
              <input
                type="checkbox"
                id="useKeyAuth"
                checked={formData.useKeyAuth}
                onChange={(e) => setFormData({...formData, useKeyAuth: e.target.checked})}
              />
              <label htmlFor="useKeyAuth">Use SSH Key Authentication</label>
            </div>

            {!formData.useKeyAuth ? (
              <div className="form-group">
                <label>Password {!isEditing && '*'}</label>
                <input
                  type="password"
                  className="form-input"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder={isEditing ? 'Leave blank to keep unchanged' : 'SSH password'}
                  required={!isEditing}
                />
              </div>
            ) : (
              <div className="form-group">
                <label>Private Key {!isEditing && '*'}</label>
                <textarea
                  className="form-input"
                  value={formData.privateKey}
                  onChange={(e) => setFormData({...formData, privateKey: e.target.value})}
                  placeholder={isEditing ? 'Leave blank to keep unchanged' : 'Paste your SSH private key here'}
                  rows={8}
                  required={!isEditing}
                />
                <div className="form-hint">Paste your PEM format private key</div>
              </div>
            )}
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
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConnectionModal;
