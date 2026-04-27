import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

// Helper: Format relative time
function formatRelativeTime(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// Helper: Success Rate Component
const SuccessRate = React.memo(({ scheduleId }) => {
  const [rate, setRate] = useState(null);
  
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/schedules/${scheduleId}/history?limit=50`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok && isMounted) {
          const history = await response.json();
          if (history.length === 0) {
            setRate(null);
            return;
          }
          
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const recentRuns = history.filter(run => new Date(run.executed_at) > oneDayAgo);
          const runsToCalculate = recentRuns.length > 0 ? recentRuns : history;
          
          const successfulRuns = runsToCalculate.filter(run => run.status === 'success').length;
          const calculatedRate = Math.round((successfulRuns / runsToCalculate.length) * 100);
          setRate(calculatedRate);
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [scheduleId]);

  if (rate === null) return <span className="rate-val secondary">--% Success Rate</span>;

  let colorClass = 'rate-red';
  if (rate === 100) colorClass = 'rate-mint';
  else if (rate > 90) colorClass = 'rate-yellow-green';
  else if (rate > 70) colorClass = 'rate-yellow';

  return (
    <span className={`rate-val ${colorClass}`}>
      {rate}% Success Rate
    </span>
  );
});

const SchedulesPanel = React.memo(({ 
  schedules, 
  onNewSchedule, 
  onEditSchedule, 
  onToggleSchedule, 
  onDeleteSchedule,
  onRunSchedule,
  onCloneSchedule
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSchedules, setSelectedSchedules] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredSchedules = useMemo(() => schedules.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.commands?.some(c => c.command.toLowerCase().includes(searchTerm.toLowerCase())))
  ), [schedules, searchTerm]);

  const totalPages = useMemo(() => Math.ceil(filteredSchedules.length / itemsPerPage), [filteredSchedules]);
  
  const paginatedSchedules = useMemo(() => filteredSchedules.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ), [filteredSchedules, currentPage]);

  const toggleSelection = useCallback((id) => {
    setSelectedSchedules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const selectAllOnPage = useCallback((e) => {
    const isChecked = e.target.checked;
    setSelectedSchedules(prev => {
      const newSet = new Set(prev);
      if (isChecked) {
        paginatedSchedules.forEach(s => newSet.add(s.id));
      } else {
        paginatedSchedules.forEach(s => newSet.delete(s.id));
      }
      return newSet;
    });
  }, [paginatedSchedules]);

  const handleBulkDelete = useCallback(async () => {
    if (!window.confirm(`Delete ${selectedSchedules.size} schedules?`)) return;
    for (const id of selectedSchedules) {
      await onDeleteSchedule(id);
    }
    setSelectedSchedules(new Set());
  }, [selectedSchedules, onDeleteSchedule]);

  const handleBulkToggle = useCallback(async (enable) => {
    for (const id of selectedSchedules) {
      const schedule = schedules.find(s => s.id === id);
      if (schedule && !!schedule.is_enabled !== enable) {
        await onToggleSchedule(schedule);
      }
    }
    setSelectedSchedules(new Set());
  }, [selectedSchedules, schedules, onToggleSchedule]);

  return (
    <div className="schedules-panel">
      <div className="panel-header">
        <div className="search-box">
          <input
            type="text"
            placeholder={`Search schedules...`}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <button className="btn-secondary" onClick={onNewSchedule}>
          + New Schedule
        </button>
      </div>

      <div className={`bulk-actions-bar ${selectedSchedules.size > 0 ? 'active' : ''}`}>
        <label className="select-all-label">
          <input 
            type="checkbox" 
            checked={paginatedSchedules.length > 0 && paginatedSchedules.every(s => selectedSchedules.has(s.id))}
            onChange={selectAllOnPage}
          />
          Select All
        </label>
        
        {selectedSchedules.size > 0 && (
          <div className="bulk-actions">
            <span className="selection-count">{selectedSchedules.size} selected</span>
            <button className="btn-secondary" onClick={() => handleBulkToggle(true)}>Enable</button>
            <button className="btn-secondary" onClick={() => handleBulkToggle(false)}>Pause</button>
            <button className="btn-danger" onClick={handleBulkDelete}>Delete</button>
          </div>
        )}
      </div>

      <div className="schedules-card-list">
        {filteredSchedules.length === 0 ? (
          <div className="schedules-empty" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No schedules found. Click "+ New Schedule" to create one.
          </div>
        ) : (
          paginatedSchedules.map((schedule) => (
          <div key={schedule.id} className="sched-card">
            <div className="sched-card-main">
              <div className="sched-card-left">
                <div className="sched-checkbox-wrap">
                  <input 
                    type="checkbox"
                    checked={selectedSchedules.has(schedule.id)}
                    onChange={() => toggleSelection(schedule.id)}
                  />
                </div>
                <div className="sched-info">
                  <div className="sched-title-row">
                    <div className={`sched-status-dot ${schedule.is_enabled ? 'status-enabled' : 'status-disabled'}`} title={schedule.is_enabled ? 'Enabled' : 'Paused'}></div>
                    <h3 className="sched-name">{schedule.name}</h3>
                  </div>
                  <div className="sched-command-wrap">
                    <span className="sched-prompt">$&gt;</span>
                    <code className="sched-command">
                      {schedule.commands?.map(c => c.command).join(' && ') || 'No commands'}
                    </code>
                  </div>
                </div>
              </div>

              <div className="card-actions">
                <button className="btn-secondary" onClick={() => onRunSchedule(schedule)}>
                  Run Now
                </button>
                <button className="btn-secondary" onClick={() => onEditSchedule(schedule)}>
                  Edit
                </button>
                <button className="btn-secondary" onClick={() => onCloneSchedule(schedule)}>
                  Clone
                </button>
                <button className="btn-secondary" onClick={() => navigate(`/logs/${schedule.id}`)}>
                  Logs
                </button>
                <button className="btn-danger" onClick={() => onDeleteSchedule(schedule.id)}>
                  Delete
                </button>
              </div>
            </div>

            <div className="sched-card-footer">
              <div className="sched-last-run">
                Last run: {schedule.last_run ? formatRelativeTime(schedule.last_run) : 'Never'}
              </div>
              <div className="sched-rate">
                <SuccessRate scheduleId={schedule.id} />
              </div>
            </div>
          </div>
        )))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>← Prev</button>
          <span className="page-info">Page {currentPage} of {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
});

export default SchedulesPanel;
