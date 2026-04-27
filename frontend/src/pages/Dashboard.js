import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import Terminal from '../components/Terminal';
import ConnectionModal from '../components/ConnectionModal';
import CommandModal from '../components/CommandModal';
import ProfileModal from '../components/ProfileModal';
import '../styles/dashboard.css';
import { GROUP_COLORS as GROUP_COLOR_MAP } from '../utils/groups';

function Dashboard() {
  const { user } = useAuth();
  const [connections, setConnections] = useState([]);
  const [commands, setCommands] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [editingCommand, setEditingCommand] = useState(null);
  const [connectionHealth, setConnectionHealth] = useState({});
  
  // Batch execution state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedConnections, setSelectedConnections] = useState([]);
  const [pendingCommand, setPendingCommand] = useState(null);

  // Use refs for persistent values that don't trigger re-renders
  const timersRef = useRef([]);

  const fetchConnectionStatuses = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/connections/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setConnectionHealth(data);
      }
    } catch (error) {
      console.error('Failed to fetch connection statuses:', error);
    }
  }, []);

  const fetchConnections = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/connections`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setConnections(data);
      }
    } catch (error) {
      console.error('Failed to fetch connections:', error);
    }
  }, []);

  const fetchCommands = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/commands`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCommands(data);
      }
    } catch (error) {
      console.error('Failed to fetch commands:', error);
    }
  }, []);

  // Fetch connections and commands on load
  useEffect(() => {
    fetchConnections();
    fetchCommands();
    fetchConnectionStatuses();

    // Poll health statuses every 2 minutes
    const healthInterval = setInterval(fetchConnectionStatuses, 120000);
    
    return () => {
      clearInterval(healthInterval);
      // Clean up any remaining timers
      timersRef.current.forEach(clearTimeout);
    };
  }, [fetchConnections, fetchCommands, fetchConnectionStatuses]);

  const handleConnect = useCallback((connection) => {
    setActiveSessions(prev => {
      // Check if already connected
      const existingSession = prev.find(s => s.connectionId === connection.id);
      if (existingSession) {
        setCurrentSessionId(existingSession.id);
        return prev;
      }

      // Create new session
      const newSession = {
        id: `session-${Date.now()}`,
        connectionId: connection.id,
        connectionName: connection.name,
        connectionHost: `${connection.username}@${connection.host}:${connection.port}`,
        status: 'connecting'
      };
      setCurrentSessionId(newSession.id);
      return [...prev, newSession];
    });
  }, []);

  const handleDisconnect = useCallback((sessionId) => {
    if (!window.confirm('Are you sure you want to disconnect this session? This cannot be undone.')) return;
    setActiveSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
      }
      return filtered;
    });
  }, [currentSessionId]);

  const handleSessionStatusChange = useCallback((sessionId, status) => {
    setActiveSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, status } : s
    ));
  }, []);

  const handleRunCommand = useCallback((command) => {
    if (!currentSessionId) return;
    const terminal = document.getElementById(`terminal-${currentSessionId}`);
    if (terminal) {
      const event = new CustomEvent('run-command', { detail: command.command, bubbles: true });
      terminal.dispatchEvent(event);
    }
  }, [currentSessionId]);

  // Batch execution handlers
  const toggleBatchMode = useCallback((command) => {
    setBatchMode(prev => {
      if (prev && pendingCommand?.id === command.id) {
        setPendingCommand(null);
        setSelectedConnections([]);
        return false;
      }
      setPendingCommand(command);
      setSelectedConnections([]);
      return true;
    });
  }, [pendingCommand]);

  const toggleConnectionSelection = useCallback((connId) => {
    setSelectedConnections(prev => 
      prev.includes(connId) 
        ? prev.filter(id => id !== connId)
        : [...prev, connId]
    );
  }, []);

  const executeBatch = async () => {
    if (!pendingCommand || selectedConnections.length === 0) return;

    const results = [];
    const command = pendingCommand.command;

    // First pass: ensure all connections are opened
    const sessionIdsToWaitFor = [];
    
    for (const connId of selectedConnections) {
      const connection = connections.find(c => c.id === connId);
      if (!connection) {
        results.push({ connectionId: connId, status: 'error', message: 'Connection not found' });
        continue;
      }

      // Check if already connected
      let session = activeSessions.find(s => s.connectionId === connId);

      if (!session) {
        // Create new session
        const sessionId = `session-${Date.now()}-${connId}`;
        const newSession = {
          id: sessionId,
          connectionId: connId,
          connectionName: connection.name,
          connectionHost: `${connection.username}@${connection.host}:${connection.port}`,
          status: 'connecting'
        };
        setActiveSessions(prev => [...prev, newSession]);
        sessionIdsToWaitFor.push({ sessionId, connId, connection });
      } else {
        // Already has a session, just need to wait for it to be connected
        if (session.status === 'connected') {
          const terminal = document.getElementById(`terminal-${session.id}`);
          if (terminal) {
            terminal.setAttribute('data-pending-command', command);
            window.dispatchEvent(new CustomEvent('check-pending-command', { 
              detail: { sessionId: session.id, command }
            }));

            let ready = false;
            const onReady = () => { ready = true; };
            terminal.addEventListener('terminal-ready', onReady, { once: true });
            
            let readyAttempts = 0;
            while (!ready && readyAttempts < 40) {
              await new Promise(resolve => setTimeout(resolve, 200));
              readyAttempts++;
            }
            terminal.removeEventListener('terminal-ready', onReady);

            if (!ready) {
              results.push({ connectionId: connId, status: 'error', message: 'Terminal connection timed out' });
              continue;
            }
            results.push({ connectionId: connId, status: 'success', connectionName: connection.name });
          }
        } else {
          sessionIdsToWaitFor.push({ sessionId: session.id, connId, connection });
        }
      }
    }

    // Wait for new terminals
    for (const { sessionId, connId } of sessionIdsToWaitFor) {
      try {
        let terminal = null;
        let attempts = 0;
        while (!terminal && attempts < 50) {
          terminal = document.getElementById(`terminal-${sessionId}`);
          if (!terminal) {
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
          }
        }

        if (terminal) {
          terminal.setAttribute('data-pending-command', command);
          window.dispatchEvent(new CustomEvent('check-pending-command', { 
            detail: { sessionId, command },
            bubbles: true 
          }));

          let ready = false;
          const onReady = () => { ready = true; };
          terminal.addEventListener('terminal-ready', onReady, { once: true });
          
          let readyAttempts = 0;
          while (!ready && readyAttempts < 40) {
            await new Promise(resolve => setTimeout(resolve, 200));
            readyAttempts++;
          }
          terminal.removeEventListener('terminal-ready', onReady);

          if (!ready) {
            results.push({ connectionId: connId, status: 'error', message: 'Terminal connection timed out' });
            continue;
          }
          results.push({ connectionId: connId, status: 'success' });
        }
      } catch (error) {
        results.push({ connectionId: connId, status: 'error', message: 'Failed to execute command' });
      }
    }

    alert(`Batch execution complete: ${results.filter(r => r.status === 'success').length} succeeded`);
    setBatchMode(false);
    setSelectedConnections([]);
    setPendingCommand(null);
  };

  const handleEditConnection = useCallback((connection) => {
    setEditingConnection(connection);
    setShowConnectionModal(true);
  }, []);

  const handleDeleteConnection = useCallback(async (connectionId) => {
    if (!window.confirm('Are you sure you want to delete this connection? This cannot be undone.')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/connections/${connectionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchConnections();
      }
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  }, [fetchConnections]);

  const handleEditCommand = useCallback((command) => {
    setEditingCommand(command);
    setShowCommandModal(true);
  }, []);

  const handleDeleteCommand = useCallback(async (commandId) => {
    if (!window.confirm('Delete this command macro?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/commands/${commandId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchCommands();
      }
    } catch (error) {
      console.error('Failed to delete command:', error);
    }
  }, [fetchCommands]);

  const activeConnections = useMemo(() => connections.filter(c => 
    activeSessions.some(s => s.connectionId === c.id)
  ), [connections, activeSessions]);

  const inactiveConnections = useMemo(() => connections.filter(c => 
    !activeSessions.some(s => s.connectionId === c.id)
  ), [connections, activeSessions]);

  const existingGroups = useMemo(() => {
    const groups = new Map();
    connections.forEach(c => {
      if (c.group_name) {
        groups.set(c.group_name, c.group_color || null);
      }
    });
    return Array.from(groups.entries()).map(([name, color]) => ({ name, color }));
  }, [connections]);

  const groupedInactiveConnections = useMemo(() => {
    const grouped = { 'Ungrouped': [] };
    inactiveConnections.forEach(c => {
      const groupName = c.group_name || 'Ungrouped';
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(c);
    });
    return grouped;
  }, [inactiveConnections]);

  const existingCommandGroups = useMemo(() => {
    const groups = new Map();
    commands.forEach(c => {
      if (c.group_name) {
        groups.set(c.group_name, c.group_color || null);
      }
    });
    return Array.from(groups.entries()).map(([name, color]) => ({ name, color }));
  }, [commands]);

  const groupedCommands = useMemo(() => {
    const grouped = { 'Ungrouped': [] };
    commands.forEach(c => {
      const groupName = c.group_name || 'Ungrouped';
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(c);
    });
    return grouped;
  }, [commands]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <span className="header-logo">SSH AGRE</span>
          <div className="header-toggle">
            <button 
              className={`btn btn-secondary toggle-btn ${leftSidebarOpen ? 'active' : ''}`}
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              title="Toggle Connection Panel"
            >
              Connections
            </button>
            <button 
              className={`btn btn-secondary toggle-btn ${rightSidebarOpen ? 'active' : ''}`}
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              title="Toggle Command Panel"
            >
              Commands
            </button>
          </div>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-name">{user?.name}</span>
            <span>({user?.username})</span>
          </div>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowProfileModal(true)}
          >
            Settings
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Left Sidebar - Connections */}
        <aside className={`sidebar sidebar-left ${leftSidebarOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-header">
            <span className="sidebar-title">Connections</span>
            <div className="sidebar-actions">
              <button 
                className="icon-btn"
                onClick={() => {
                  setEditingConnection(null);
                  setShowConnectionModal(true);
                }}
                title="Add Connection"
              >
                +
              </button>
            </div>
          </div>
          <div className="sidebar-content">
            {activeConnections.length > 0 && (
              <>
                <div className="sidebar-title" style={{padding: '8px 8px 4px'}}>Active</div>
                {activeConnections.map(conn => {
                  const session = activeSessions.find(s => s.connectionId === conn.id);
                  const isSelected = selectedConnections.includes(conn.id);
                  return (
                    <div 
                      key={conn.id}
                      className={`connection-item ${currentSessionId === session?.id ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => batchMode ? toggleConnectionSelection(conn.id) : setCurrentSessionId(session?.id)}
                    >
                      {batchMode ? (
                        <div className={`connection-checkbox ${isSelected ? 'checked' : ''}`}>
                          {isSelected ? '✓' : ''}
                        </div>
                      ) : (
                        <div className="connection-status connected"></div>
                      )}
                      <div className="connection-info">
                        <div className="connection-name">{conn.name}</div>
                        <div className="connection-host">{conn.host}</div>
                      </div>
                      <button 
                        className="icon-btn connection-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDisconnect(session?.id);
                        }}
                        title="Disconnect"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </>
            )}
            
            {inactiveConnections.length > 0 && (
              <>
                {Object.entries(groupedInactiveConnections).sort(([a], [b]) => a === 'Ungrouped' ? 1 : b === 'Ungrouped' ? -1 : a.localeCompare(b)).map(([groupName, groupConns]) => {
                  if (groupConns.length === 0) return null;
                  const groupColorName = groupName !== 'Ungrouped' && existingGroups.find(g => g.name === groupName)?.color;
                  const groupColorHex = groupColorName ? GROUP_COLOR_MAP[groupColorName] : null;
                  return (
                    <div key={groupName} style={{ marginBottom: '8px' }}>
                      <div className="sidebar-title" style={{padding: '16px 8px 4px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        {groupColorHex && <div style={{width: '8px', height: '8px', borderRadius: '50%', backgroundColor: groupColorHex}}></div>}
                        {groupName === 'Ungrouped' ? 'Saved' : groupName}
                      </div>
                      {groupConns.map(conn => {
                        const isSelected = selectedConnections.includes(conn.id);
                        const health = connectionHealth[conn.id];
                        const isOffline = health && health.status === 'offline';

                        return (
                          <div 
                            key={conn.id}
                            className={`connection-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => batchMode ? toggleConnectionSelection(conn.id) : handleConnect(conn)}
                          >
                            {batchMode ? (
                              <div className={`connection-checkbox ${isSelected ? 'checked' : ''}`}>
                                {isSelected ? '✓' : ''}
                              </div>
                            ) : (
                              <div className={`connection-status ${isOffline ? 'offline' : 'disconnected'}`}></div>
                            )}
                            <div className="connection-info">
                              <div className="connection-name">{conn.name}</div>
                              <div className="connection-host">{conn.host}</div>
                            </div>
                            <button 
                              className="icon-btn connection-menu-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditConnection(conn);
                              }}
                              title="Edit"
                            >
                              ⋮
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}

            {connections.length === 0 && (
              <div className="sidebar-empty">
                No connections saved.<br />
                Click + to add one.
              </div>
            )}
          </div>
        </aside>

        {/* Terminal Area */}
        <section className="terminal-area">
          <div className="terminal-container">
            {activeSessions.map(session => (
              <div
                key={session.id}
                className="terminal-instance"
                style={{display: currentSessionId === session.id ? 'block' : 'none'}}
              >
                <Terminal
                  id={`terminal-${session.id}`}
                  sessionId={session.id}
                  connectionId={session.connectionId}
                  isActive={currentSessionId === session.id}
                  onStatusChange={(status) => handleSessionStatusChange(session.id, status)}
                  onDisconnect={() => handleDisconnect(session.id)}
                />
              </div>
            ))}
            {activeSessions.length === 0 && (
              <div className="sidebar-empty" style={{paddingTop: '40px'}}>
                Select a connection from the left sidebar to start a session.
              </div>
            )}
          </div>
        </section>

        {/* Right Sidebar - Commands */}
        <aside className={`sidebar sidebar-right ${rightSidebarOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-header">
            <span className="sidebar-title">Command Library</span>
            <div className="sidebar-actions">
              <button 
                className="icon-btn"
                onClick={() => {
                  setEditingCommand(null);
                  setShowCommandModal(true);
                }}
                title="Add Command"
              >
                +
              </button>
            </div>
          </div>
          <div className="sidebar-content">
            {Object.entries(groupedCommands).sort(([a], [b]) => a === 'Ungrouped' ? 1 : b === 'Ungrouped' ? -1 : a.localeCompare(b)).map(([groupName, groupCmds]) => {
              if (groupCmds.length === 0) return null;
              const groupColorName = groupName !== 'Ungrouped' && existingCommandGroups.find(g => g.name === groupName)?.color;
              const groupColorHex = groupColorName ? GROUP_COLOR_MAP[groupColorName] : null;
              return (
                <div key={groupName} style={{ marginBottom: '8px' }}>
                  {groupName !== 'Ungrouped' && (
                    <div className="sidebar-title" style={{padding: '16px 8px 4px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      {groupColorHex && <div style={{width: '8px', height: '8px', borderRadius: '50%', backgroundColor: groupColorHex}}></div>}
                      {groupName}
                    </div>
                  )}
                  {groupCmds.map(cmd => (
                    <div
                      key={cmd.id}
                      className={`command-item ${batchMode && pendingCommand?.id === cmd.id ? 'batch-active' : ''}`}
                      title={cmd.description || cmd.command}
                    >
                      <div
                        className="command-icon batch-toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBatchMode(cmd);
                        }}
                        title={batchMode && pendingCommand?.id === cmd.id ? 'Cancel batch mode' : 'Select for batch execution'}
                      >
                        {batchMode && pendingCommand?.id === cmd.id ? '⚡' : '$'}
                      </div>
                      <div className="command-info" onClick={() => handleRunCommand(cmd)}>
                        <div className="command-name">{cmd.name}</div>
                        {cmd.description && (
                          <div className="command-description">{cmd.description}</div>
                        )}
                      </div>
                      <button
                        className="icon-btn connection-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditCommand(cmd);
                        }}
                        title="Edit"
                      >
                        ⋮
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            {commands.length === 0 && (
              <div className="sidebar-empty">
                No commands saved.<br />
                Click + to add one.
              </div>
            )}
          </div>
          
          {batchMode && pendingCommand && (
            <div className="batch-execute-bar">
              <span className="batch-status">
                {selectedConnections.length} connection{selectedConnections.length !== 1 ? 's' : ''} selected
              </span>
              <button 
                className="btn btn-primary batch-send-btn"
                onClick={executeBatch}
                disabled={selectedConnections.length === 0}
              >
                Execute "{pendingCommand.name}"
              </button>
              <button 
                className="btn btn-secondary batch-cancel-btn"
                onClick={() => {
                  setBatchMode(false);
                  setSelectedConnections([]);
                  setPendingCommand(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </aside>
      </main>

      {/* Modals */}
      {showConnectionModal && (
        <ConnectionModal
          connection={editingConnection}
          existingGroups={existingGroups}
          onClose={() => {
            setShowConnectionModal(false);
            setEditingConnection(null);
          }}
          onSave={() => {
            fetchConnections();
            setShowConnectionModal(false);
            setEditingConnection(null);
          }}
          onDelete={editingConnection ? () => handleDeleteConnection(editingConnection.id) : null}
        />
      )}

      {showCommandModal && (
        <CommandModal
          command={editingCommand}
          existingGroups={existingCommandGroups}
          onClose={() => {
            setShowCommandModal(false);
            setEditingCommand(null);
          }}
          onSave={() => {
            fetchCommands();
            setShowCommandModal(false);
            setEditingCommand(null);
          }}
          onDelete={editingCommand ? () => handleDeleteCommand(editingCommand.id) : null}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}

export default Dashboard;
