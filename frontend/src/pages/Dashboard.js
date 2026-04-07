import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import Terminal from '../components/Terminal';
import ConnectionModal from '../components/ConnectionModal';
import CommandModal from '../components/CommandModal';
import ProfileModal from '../components/ProfileModal';
import '../styles/dashboard.css';

function Dashboard() {
  const { user, logout } = useAuth();
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

  // Fetch connections and commands on load
  useEffect(() => {
    fetchConnections();
    fetchCommands();
    // Add Testing connection for 192.168.0.28 after a short delay
    const timer = setTimeout(() => {
      addTestingConnection();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Add Testing connection for local development
  const addTestingConnection = async () => {
    try {
      const token = localStorage.getItem('token');
      // Check if Testing connection already exists
      const response = await fetch(`${API_URL}/api/connections`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const connections = await response.json();
        const existingTest = connections.find(c => c.name === 'Testing');
        if (existingTest) {
          // Auto-connect to existing Testing connection
          handleConnect({
            id: existingTest.id,
            name: existingTest.name,
            host: existingTest.host,
            port: existingTest.port,
            username: existingTest.username
          });
          return;
        }
        
        // Create Testing connection
        const createResponse = await fetch(`${API_URL}/api/connections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: 'Testing',
            host: '192.168.0.28',
            port: 22,
            username: 'noah',
            password: '', // Will need to be entered manually
            useKeyAuth: false
          })
        });
        
        if (createResponse.ok) {
          const newConnection = await createResponse.json();
          await fetchConnections();
          // Auto-connect to the new Testing connection
          setTimeout(() => {
            handleConnect(newConnection);
          }, 500);
        }
      }
    } catch (error) {
      console.error('Failed to add Testing connection:', error);
    }
  };

  const fetchConnections = async () => {
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
  };

  const fetchCommands = async () => {
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
  };

  const handleConnect = (connection) => {
    // Check if already connected
    const existingSession = activeSessions.find(s => s.connectionId === connection.id);
    if (existingSession) {
      setCurrentSessionId(existingSession.id);
      return;
    }

    // Create new session
    const newSession = {
      id: `session-${Date.now()}`,
      connectionId: connection.id,
      connectionName: connection.name,
      connectionHost: `${connection.username}@${connection.host}:${connection.port}`,
      status: 'connecting'
    };
    setActiveSessions(prev => [...prev, newSession]);
    setCurrentSessionId(newSession.id);
  };

  const handleDisconnect = (sessionId) => {
    setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      const remaining = activeSessions.filter(s => s.id !== sessionId);
      setCurrentSessionId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const handleSessionStatusChange = (sessionId, status) => {
    setActiveSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, status } : s
    ));
  };

  const handleRunCommand = useCallback((command) => {
    console.log('[Dashboard] handleRunCommand called:', command);
    if (!currentSessionId) {
      console.log('[Dashboard] No current session');
      return;
    }
    const terminal = document.getElementById(`terminal-${currentSessionId}`);
    console.log('[Dashboard] Found terminal element:', terminal?.id);
    if (terminal) {
      const event = new CustomEvent('run-command', { detail: command.command, bubbles: true });
      console.log('[Dashboard] Dispatching event to', terminal.id);
      terminal.dispatchEvent(event);
    }
  }, [currentSessionId]);

  const handleEditConnection = (connection) => {
    setEditingConnection(connection);
    setShowConnectionModal(true);
  };

  const handleDeleteConnection = async (connectionId) => {
    if (!window.confirm('Delete this connection?')) return;
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
  };

  const handleEditCommand = (command) => {
    setEditingCommand(command);
    setShowCommandModal(true);
  };

  const handleDeleteCommand = async (commandId) => {
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
  };

  const activeConnections = connections.filter(c => 
    activeSessions.some(s => s.connectionId === c.id)
  );
  const inactiveConnections = connections.filter(c => 
    !activeSessions.some(s => s.connectionId === c.id)
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <span className="header-logo">SSH AGRE</span>
          <div className="header-toggle">
            <button 
              className={`toggle-btn ${leftSidebarOpen ? 'active' : ''}`}
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              title="Toggle Connection Panel"
            >
              Connections
            </button>
            <button 
              className={`toggle-btn ${rightSidebarOpen ? 'active' : ''}`}
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
                  return (
                    <div 
                      key={conn.id}
                      className={`connection-item ${currentSessionId === session?.id ? 'active' : ''}`}
                      onClick={() => setCurrentSessionId(session?.id)}
                    >
                      <div className="connection-status connected"></div>
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
                <div className="sidebar-title" style={{padding: '16px 8px 4px'}}>Saved</div>
                {inactiveConnections.map(conn => (
                  <div 
                    key={conn.id}
                    className="connection-item"
                    onClick={() => handleConnect(conn)}
                  >
                    <div className="connection-status disconnected"></div>
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
                ))}
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
            {commands.map(cmd => (
              <div 
                key={cmd.id}
                className="command-item"
                onClick={() => handleRunCommand(cmd)}
                title={cmd.description || cmd.command}
              >
                <div className="command-icon">$</div>
                <div className="command-info">
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

            {commands.length === 0 && (
              <div className="sidebar-empty">
                No commands saved.<br />
                Click + to add one.
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Modals */}
      {showConnectionModal && (
        <ConnectionModal
          connection={editingConnection}
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
