import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import '../styles/logviewer.css';

function LogViewer() {
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScheduleAndLogs();
  }, [scheduleId]);

  const fetchScheduleAndLogs = async () => {
    const token = localStorage.getItem('token');
    try {
      const [scheduleRes, logsRes] = await Promise.all([
        fetch(`${API_URL}/api/schedules/${scheduleId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/schedules/${scheduleId}/history`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      
      if (scheduleRes.ok) setSchedule(await scheduleRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="log-viewer-page">
      <div className="log-viewer-header">
        <button className="btn-secondary" onClick={() => navigate('/')}>
          ← Back to Schedules
        </button>
        <h2>{schedule?.name || 'Schedule Logs'}</h2>
        <div className="header-spacer" />
      </div>
      
      <div className="terminal-container">
        {logs.map((log, index) => (
          <div key={index} className={`terminal-entry ${log.status}`}>
            <div className="terminal-meta">
              <span className={`terminal-status ${log.status}`}>{log.status?.toUpperCase()}</span>
              <span className="terminal-time">{new Date(log.executed_at || log.created_at).toLocaleString()}</span>
              <span className="terminal-connection">{log.connection_name}</span>
            </div>
            {log.output && (
              <pre className="terminal-output">{log.output}</pre>
            )}
            {log.error && (
              <pre className="terminal-error">{log.error}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default LogViewer;