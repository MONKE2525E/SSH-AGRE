import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import '../styles/setup.css';

function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  const [createdConnection, setCreatedConnection] = useState(null);
  const [createdCommand, setCreatedCommand] = useState(null);
  const [setupComplete, setSetupComplete] = useState(false);

  // Step 1: Admin account creation
  const [adminForm, setAdminForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    name: ''
  });

  // Step 2: First SSH connection
  const [connectionForm, setConnectionForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    useKeyAuth: false,
    privateKey: ''
  });

  // Step 3: First command macro
  const [commandForm, setCommandForm] = useState({
    name: '',
    command: '',
    description: ''
  });

  const steps = [
    { title: 'Welcome', description: 'Set up your SSH AGRE instance' },
    { title: 'Create Admin', description: 'Create your administrator account' },
    { title: 'Add Connection', description: 'Add your first SSH connection' },
    { title: 'Add Command', description: 'Create your first command macro' },
    { title: 'All Set!', description: 'Ready to use SSH AGRE' }
  ];

  const handleAdminSubmit = async (e, skipApi = false) => {
    e.preventDefault();
    setError('');

    if (adminForm.password !== adminForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (adminForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // If admin already created and we're just editing, just move to next step
    if (user && skipApi) {
      setStep(2);
      return;
    }

    setLoading(true);
    console.log('[SETUP] Creating admin account:', { username: adminForm.username, name: adminForm.name || adminForm.username });
    try {
      const response = await fetch(`${API_URL}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminForm.username,
          password: adminForm.password,
          name: adminForm.name || adminForm.username
        })
      });

      console.log('[SETUP] Response status:', response.status);
      const data = await response.json();
      console.log('[SETUP] Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || `Setup failed (${response.status})`);
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      setStep(2);
    } catch (err) {
      console.error('[SETUP] Create admin error:', err);
      setError(`Failed to create account: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectionSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: connectionForm.name,
          host: connectionForm.host,
          port: parseInt(connectionForm.port) || 22,
          username: connectionForm.username,
          password: connectionForm.useKeyAuth ? undefined : connectionForm.password,
          privateKey: connectionForm.useKeyAuth ? connectionForm.privateKey : undefined,
          useKeyAuth: connectionForm.useKeyAuth
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create connection');
      }

      const conn = await response.json();
      setCreatedConnection({
        name: connectionForm.name,
        host: connectionForm.host,
        port: connectionForm.port,
        username: connectionForm.username
      });
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommandSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: commandForm.name,
          command: commandForm.command,
          description: commandForm.description
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create command');
      }

      setCreatedCommand({
        name: commandForm.name,
        command: commandForm.command
      });
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const skipToDashboard = async () => {
    setLoading(true);
    try {
      // Mark setup as complete on backend
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/auth/setup-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Already logged in with token stored, just reload to go to dashboard
      window.location.reload();
    } catch (err) {
      console.error('Failed to mark setup complete:', err);
      // Still reload even if the request fails
      window.location.reload();
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="setup-step">
            <h2>Welcome to SSH AGRE</h2>
            <p className="setup-description">
              Let's get your SSH connection manager set up. This will only take a minute.
            </p>
            <div className="setup-features">
              <div className="feature">
                <span>Secure SSH connections</span>
              </div>
              <div className="feature">
                <span>Command macros</span>
              </div>
              <div className="feature">
                <span>Full terminal support</span>
              </div>
              <div className="feature">
                <span>Batch commands</span>
              </div>
              <div className="feature">
                <span>Scheduled tasks</span>
              </div>
            </div>
            <button className="btn btn-primary btn-large" onClick={() => setStep(1)}>
              Get Started
            </button>
          </div>
        );

      case 1:
        return (
          <form onSubmit={handleAdminSubmit} className="setup-step">
            <h2>Create Admin Account</h2>
            <p className="setup-description">
              This will be your administrator account with full access.
            </p>

            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label>Username *</label>
              <input
                type="text"
                className="form-input"
                value={adminForm.username}
                onChange={(e) => setAdminForm({...adminForm, username: e.target.value})}
                placeholder="admin"
                required
              />
            </div>

            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                className="form-input"
                value={adminForm.name}
                onChange={(e) => setAdminForm({...adminForm, name: e.target.value})}
                placeholder="Your name"
              />
            </div>

            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                className="form-input"
                value={adminForm.password}
                onChange={(e) => setAdminForm({...adminForm, password: e.target.value})}
                placeholder="Min 8 characters"
                required
              />
            </div>

            <div className="form-group">
              <label>Confirm Password *</label>
              <input
                type="password"
                className="form-input"
                value={adminForm.confirmPassword}
                onChange={(e) => setAdminForm({...adminForm, confirmPassword: e.target.value})}
                placeholder="Confirm password"
                required
              />
            </div>

            <div className="setup-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(0)}>
                Back
              </button>
              {user && (
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={(e) => handleAdminSubmit(e, true)}
                  disabled={loading}
                >
                  Next
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {user ? 'Save Changes' : (loading ? 'Creating...' : 'Create Account')}
              </button>
            </div>
          </form>
        );

      case 2:
        return (
          <form onSubmit={handleConnectionSubmit} className="setup-step">
            <h2>Add SSH Connection</h2>
            <p className="setup-description">
              Add your first SSH server. You can add more later.
            </p>

            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                className="form-input"
                value={connectionForm.name}
                onChange={(e) => setConnectionForm({...connectionForm, name: e.target.value})}
                placeholder="e.g., My Laptop"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Host *</label>
                <input
                  type="text"
                  className="form-input"
                  value={connectionForm.host}
                  onChange={(e) => setConnectionForm({...connectionForm, host: e.target.value})}
                  placeholder="192.168.1.100"
                  required
                />
              </div>
              <div className="form-group">
                <label>Port</label>
                <input
                  type="number"
                  className="form-input"
                  value={connectionForm.port}
                  onChange={(e) => setConnectionForm({...connectionForm, port: e.target.value})}
                  placeholder="22"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Username *</label>
              <input
                type="text"
                className="form-input"
                value={connectionForm.username}
                onChange={(e) => setConnectionForm({...connectionForm, username: e.target.value})}
                placeholder="e.g. username"
                required
              />
            </div>

            <div className="checkbox-group">
              <input
                type="checkbox"
                id="useKeyAuth"
                checked={connectionForm.useKeyAuth}
                onChange={(e) => setConnectionForm({...connectionForm, useKeyAuth: e.target.checked})}
              />
              <label htmlFor="useKeyAuth">Use SSH Key Authentication</label>
            </div>

            {!connectionForm.useKeyAuth ? (
              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={connectionForm.password}
                  onChange={(e) => setConnectionForm({...connectionForm, password: e.target.value})}
                  placeholder="SSH password"
                  required
                />
              </div>
            ) : (
              <div className="form-group">
                <label>Private Key *</label>
                <textarea
                  className="form-input"
                  value={connectionForm.privateKey}
                  onChange={(e) => setConnectionForm({...connectionForm, privateKey: e.target.value})}
                  placeholder="Paste your SSH private key here"
                  rows={3}
                  required
                />
              </div>
            )}

            <div className="setup-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btn btn-text" onClick={() => setStep(3)}>
                Skip
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Adding...' : 'Add Connection'}
              </button>
            </div>
          </form>
        );

      case 3:
        return (
          <form onSubmit={handleCommandSubmit} className="setup-step">
            <h2>Create Command Macro</h2>
            <p className="setup-description">
              Create a quick command you can run with one click. You can add more later.
            </p>

            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                className="form-input"
                value={commandForm.name}
                onChange={(e) => setCommandForm({...commandForm, name: e.target.value})}
                placeholder="e.g., List Directory"
                required
              />
            </div>

            <div className="form-group">
              <label>Command *</label>
              <input
                type="text"
                className="form-input"
                value={commandForm.command}
                onChange={(e) => setCommandForm({...commandForm, command: e.target.value})}
                placeholder="ls -la"
                required
              />
              <div className="form-hint">The command that will be executed</div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                className="form-input"
                value={commandForm.description}
                onChange={(e) => setCommandForm({...commandForm, description: e.target.value})}
                placeholder="Optional description"
              />
            </div>

            <div className="setup-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="btn btn-text" onClick={() => setStep(4)}>
                Skip
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Command'}
              </button>
            </div>
          </form>
        );

      case 4:
        return (
          <div className="setup-step">
            <h2>You're All Set!</h2>
            <p className="setup-description">
              Review your setup before going to the dashboard.
            </p>

            <div className="setup-review">
              <div className="review-section">
                <h3>Admin Account</h3>
                <div className="review-item">
                  <span className="review-label">Username:</span>
                  <span className="review-value">{user?.username || adminForm.username}</span>
                </div>
                {user?.name && (
                  <div className="review-item">
                    <span className="review-label">Display Name:</span>
                    <span className="review-value">{user.name}</span>
                  </div>
                )}
              </div>

              {createdConnection && (
                <div className="review-section">
                  <h3>SSH Connection</h3>
                  <div className="review-item">
                    <span className="review-label">Name:</span>
                    <span className="review-value">{createdConnection.name}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Host:</span>
                    <span className="review-value">{createdConnection.host}:{createdConnection.port}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Username:</span>
                    <span className="review-value">{createdConnection.username}</span>
                  </div>
                </div>
              )}

              {createdCommand && (
                <div className="review-section">
                  <h3>Command Macro</h3>
                  <div className="review-item">
                    <span className="review-label">Name:</span>
                    <span className="review-value">{createdCommand.name}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Command:</span>
                    <code className="review-code">{createdCommand.command}</code>
                  </div>
                </div>
              )}
            </div>

            <div className="setup-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(3)}>
                Back
              </button>
              <button className="btn btn-primary btn-large" onClick={skipToDashboard} disabled={loading}>
                {loading ? 'Finishing...' : 'Go to Dashboard'}
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <h1>SSH AGRE</h1>
          <div className="setup-progress">
            {steps.map((s, idx) => (
              <div
                key={idx}
                className={`progress-step ${idx === step ? 'active' : ''} ${idx < step ? 'completed' : ''}`}
              >
                <div className="step-number">{idx < step ? '✓' : idx + 1}</div>
                <div className="step-info">
                  <div className="step-title">{s.title}</div>
                  <div className="step-desc">{s.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="setup-content">
          {renderStep()}
        </div>

        <div className="setup-footer">
          <p>SSH AGRE v1.0</p>
        </div>
      </div>
    </div>
  );
}

export default SetupWizard;
