import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { API_URL } from './config';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
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
    // Check if first-time setup is needed
    const checkSetupStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/setup-status`);
        const data = await response.json();
        setNeedsSetup(data.needsSetup);
      } catch (error) {
        console.error('Failed to check setup status:', error);
        setNeedsSetup(false);
      } finally {
        setCheckingSetup(false);
      }
    };

    checkSetupStatus();
  }, []);

  if (checkingSetup) {
    return <div className="loading-screen">Loading...</div>;
  }

  // If setup is needed, show setup wizard
  if (needsSetup) {
    return (
      <div className="app">
        <SetupWizard onComplete={() => setNeedsSetup(false)} />
      </div>
    );
  }

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
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;
