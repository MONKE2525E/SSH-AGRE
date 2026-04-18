import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { API_URL } from './config';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LogViewer from './pages/LogViewer';
import SetupWizard from './components/SetupWizard';

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function App() {
  const [needsSetup, setNeedsSetup] = useState(null);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    console.log('[App] Starting setup check...');
    const checkSetup = async () => {
      try {
        console.log('[App] Fetching setup-status from:', `${API_URL}/api/auth/setup-status`);
        const response = await fetch(`${API_URL}/api/auth/setup-status`);
        console.log('[App] Response status:', response.status, 'ok:', response.ok);
        if (response.ok) {
          const data = await response.json();
          console.log('[App] Setup data:', data);
          if (data.needsSetup) {
            console.log('[App] Setup needed - clearing auth data');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
          console.log('[App] Setting needsSetup to:', data.needsSetup);
          setNeedsSetup(data.needsSetup);
        } else {
          console.log('[App] Response not OK, defaulting to setup mode');
          setNeedsSetup(true);
        }
      } catch (error) {
        console.error('[App] Setup check failed:', error);
        setNeedsSetup(true);
      } finally {
        console.log('[App] Setting checkingSetup to false');
        setCheckingSetup(false);
      }
    };

    checkSetup();
  }, []);

  // If still checking, show loading
  if (checkingSetup) {
    console.log('[App] Render: Loading screen (checkingSetup=true)');
    return <div className="loading-screen">Loading...</div>;
  }

  // If setup is needed, show setup wizard
  console.log('[App] Render: checkingSetup=false, needsSetup=', needsSetup);
  if (needsSetup === true) {
    console.log('[App] Render: Showing SetupWizard');
    return (
      <div className="App">
        <SetupWizard onComplete={() => {
          console.log('[App] Setup complete, setting needsSetup=false');
          setNeedsSetup(false);
        }} />
      </div>
    );
  }

  console.log('[App] Render: Showing Routes (needsSetup is not true)');

  return (
    <div className="app">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/" 
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/logs/:scheduleId" 
          element={
            <PrivateRoute>
              <LogViewer />
            </PrivateRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;
