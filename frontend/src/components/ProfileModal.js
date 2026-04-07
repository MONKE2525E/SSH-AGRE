import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';

function ProfileModal({ onClose }) {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({ name: '', username: '' });
  const [passwords, setPasswords] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchProfile();
    if (user?.isAdmin) {
      fetchUsers();
      fetchPendingUsers();
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [user]);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('[Profile] Fetched profile:', data);
        setProfile(data);
      } else {
        console.error('[Profile] Failed to fetch profile:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const calculatePasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return strength;
  };

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setPasswords({...passwords, newPassword});
    setPasswordStrength(calculatePasswordStrength(newPassword));
  };

  const getStrengthLabel = () => {
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    return labels[passwordStrength] || 'Very Weak';
  };

  const getStrengthColor = () => {
    const colors = ['#f85149', '#f85149', '#d29922', '#58a6ff', '#3fb950', '#3fb950'];
    return colors[passwordStrength] || '#f85149';
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const updates = { name: profile.name };
      
      // Only admins can change username
      if (user?.isAdmin) {
        updates.username = profile.username;
      }
      
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      setMessage('Profile updated successfully');
      // Update local storage user name and username
      const savedUser = JSON.parse(localStorage.getItem('user'));
      savedUser.name = profile.name;
      if (user?.isAdmin) {
        savedUser.username = profile.username;
      }
      localStorage.setItem('user', JSON.stringify(savedUser));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwords.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: passwords.newPassword })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update password');
      }

      setMessage('Password updated successfully');
      setPasswords({ newPassword: '', confirmPassword: '' });
      setPasswordStrength(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      logout();
    } catch (err) {
      setError(err.message);
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      fetchUsers();
      fetchPendingUsers();
      setMessage('User deleted successfully');
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchPendingUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPendingUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch pending users:', error);
    }
  };

  const handleToggleAdmin = async (userId, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/${userId}/toggle-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isAdmin: !currentStatus })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user role');
      }

      fetchUsers();
      setMessage(`User role updated to ${!currentStatus ? 'Administrator' : 'Basic User'}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApproveUser = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/${userId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve user');
      }

      fetchPendingUsers();
      fetchUsers();
      setMessage('User approved successfully');
    } catch (err) {
      setError(err.message);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setError('');
    setMessage('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Settings</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => switchTab('profile')}>
            Account
          </button>
          <button className={`profile-tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => switchTab('security')}>
            Security
          </button>
          {user?.isAdmin && (
            <>
              <button className={`profile-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => switchTab('pending')}>
                Pending ({pendingUsers.length})
              </button>
              <button className={`profile-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => switchTab('users')}>
                Users
              </button>
            </>
          )}
        </div>

        <div className="settings-body">
          {message && (
            <div className="success-message">{message}</div>
          )}
          {error && <div className="error-message">{error}</div>}

          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile}>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.username}
                  onChange={(e) => setProfile({...profile, username: e.target.value})}
                  disabled={!user?.isAdmin}
                />
                <div className="form-hint">
                  {user?.isAdmin ? 'Administrators can change their username' : 'Basic accounts cannot change username'}
                </div>
              </div>

              <div className="form-group">
                <label>Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.name || ''}
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                  placeholder="Your display name"
                />
              </div>

              <div className="form-group">
                <label>Account Level</label>
                <input
                  type="text"
                  className="form-input"
                  value={user?.isAdmin ? 'Administrator' : 'Basic'}
                  disabled
                />
                <div className="form-hint">
                  {user?.isAdmin ? 'Full access to all features and user management' : 'Limited access, cannot manage users or change username'}
                </div>
              </div>

              <div style={{marginTop: '24px', display: 'flex', justifyContent: 'flex-end'}}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <>
              <form>
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={passwords.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter new password"
                    required
                  />
                  {passwords.newPassword && (
                    <div className="password-strength">
                      <div className="strength-bar">
                        <div 
                          className="strength-fill" 
                          style={{width: `${(passwordStrength / 5) * 100}%`, backgroundColor: getStrengthColor()}}
                        />
                      </div>
                      <span style={{color: getStrengthColor(), fontSize: '12px'}}>{getStrengthLabel()}</span>
                    </div>
                  )}
                  <div className="form-hint">Use at least 8 characters with uppercase, lowercase, numbers, and symbols</div>
                </div>

                <div className="form-group">
                  <label>Confirm New Password</label>
                  <div style={{display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                    <input
                      type="password"
                      className="form-input"
                      value={passwords.confirmPassword}
                      onChange={(e) => setPasswords({...passwords, confirmPassword: e.target.value})}
                      placeholder="Confirm new password"
                      required
                      style={{flex: 1}}
                    />
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      onClick={handleUpdatePassword} 
                      disabled={loading}
                      style={{marginTop: '0'}}
                    >
                      {loading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </div>
              </form>

              <div style={{borderTop: '1px solid var(--border-primary)', paddingTop: '20px', marginTop: '24px'}}>
                <h4 style={{marginBottom: '12px'}}>Session</h4>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={logout}
                >
                  Log Out
                </button>
              </div>

              <div style={{borderTop: '1px solid var(--border-primary)', paddingTop: '20px', marginTop: '24px'}}>
                <h4 style={{marginBottom: '12px', color: 'var(--accent-danger)'}}>Danger Zone</h4>
                {!showDeleteConfirm ? (
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)'}}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete My Account
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <p style={{color: 'var(--accent-danger)', marginBottom: '12px'}}>
                      This will permanently delete your account and all data. Are you sure?
                    </p>
                    <div style={{display: 'flex', gap: '8px'}}>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                      <button 
                        type="button" 
                        className="btn" 
                        style={{backgroundColor: 'var(--accent-danger)', color: 'white'}}
                        onClick={handleDeleteAccount}
                        disabled={loading}
                      >
                        {loading ? 'Deleting...' : 'Yes, Delete My Account'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'users' && user?.isAdmin && (
            <div className="users-list">
              <div style={{marginBottom: '16px'}}>
                <h4 style={{marginBottom: '8px'}}>User Management</h4>
                <p className="form-hint">Total users: {users.length}</p>
              </div>
              
              {users.length === 0 ? (
                <div className="sidebar-empty">No users found</div>
              ) : (
                users.map(u => (
                  <div key={u.id} className="user-item" style={{
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '12px', 
                    borderBottom: '1px solid var(--border-primary)',
                    gap: '12px'
                  }}>
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: 500}}>{u.name || u.username}</div>
                      <div style={{fontSize: '12px', color: 'var(--text-secondary)'}}>
                        {u.username} {u.is_admin && <span style={{color: 'var(--accent-primary)'}}>• Admin</span>}
                      </div>
                    </div>
                    <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </div>
                    {u.id !== user.id && (
                      <>
                        <button 
                          className="btn btn-secondary"
                          onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                          style={{padding: '4px 12px', fontSize: '12px'}}
                          title={u.is_admin ? 'Demote to Basic User' : 'Promote to Admin'}
                        >
                          {u.is_admin ? 'Demote' : 'Promote'}
                        </button>
                        <button 
                          className="icon-btn" 
                          onClick={() => handleDeleteUser(u.id)}
                          title="Delete user"
                          style={{color: 'var(--accent-danger)'}}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'pending' && user?.isAdmin && (
            <div className="users-list">
              <div style={{marginBottom: '16px'}}>
                <h4 style={{marginBottom: '8px'}}>Pending Approvals</h4>
                <p className="form-hint">Users waiting for approval: {pendingUsers.length}</p>
              </div>
              
              {pendingUsers.length === 0 ? (
                <div className="sidebar-empty">No pending approvals</div>
              ) : (
                pendingUsers.map(u => (
                  <div key={u.id} className="user-item" style={{
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '12px', 
                    borderBottom: '1px solid var(--border-primary)',
                    gap: '12px'
                  }}>
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: 500}}>{u.name || u.username}</div>
                      <div style={{fontSize: '12px', color: 'var(--text-secondary)'}}>
                        {u.username}
                      </div>
                    </div>
                    <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </div>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => handleApproveUser(u.id)}
                      style={{padding: '4px 12px', fontSize: '12px'}}
                    >
                      Approve
                    </button>
                    <button 
                      className="icon-btn" 
                      onClick={() => handleDeleteUser(u.id)}
                      title="Reject"
                      style={{color: 'var(--accent-danger)'}}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileModal;
