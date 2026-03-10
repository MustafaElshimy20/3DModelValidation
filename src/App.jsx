import { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AuthPage from './components/AuthPage';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'loading' | 'dashboard'
  const [uploadedFile, setUploadedFile] = useState(null);

  const handleFileUpload = useCallback((file) => {
    setUploadedFile(file);
    setCurrentView('loading');
    
    // Simulate analysis time
    setTimeout(() => {
      setCurrentView('dashboard');
    }, 3500);
  }, []);

  const handleBackToHome = useCallback(() => {
    setCurrentView('landing');
    setUploadedFile(null);
  }, []);

  return (
    <div className="app">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1f2937',
            color: '#f9fafb',
            borderRadius: '12px',
            padding: '14px 20px',
            fontSize: '14px',
            fontFamily: 'var(--font-sans)',
            boxShadow: 'var(--shadow-xl)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#f9fafb',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#f9fafb',
            },
          },
        }}
      />
      
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={
          <>
            {currentView === 'landing' && (
              <LandingPage onFileUpload={handleFileUpload} />
            )}
            
            {currentView === 'loading' && (
              <LoadingScreen fileName={uploadedFile?.name} />
            )}
            
            {currentView === 'dashboard' && (
              <Dashboard 
                file={uploadedFile} 
                onBack={handleBackToHome} 
              />
            )}
          </>
        } />
      </Routes>
    </div>
  );
}

function LoadingScreen({ fileName }) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-cube">
          <div className="cube-face cube-front"></div>
          <div className="cube-face cube-back"></div>
          <div className="cube-face cube-right"></div>
          <div className="cube-face cube-left"></div>
          <div className="cube-face cube-top"></div>
          <div className="cube-face cube-bottom"></div>
        </div>
        <h2 className="loading-title">Analyzing Your Model</h2>
        <p className="loading-subtitle">{fileName || 'model.stl'}</p>
        <div className="loading-steps">
          <LoadingStep label="Parsing mesh geometry" delay={0} />
          <LoadingStep label="Checking manifold integrity" delay={800} />
          <LoadingStep label="Detecting print issues" delay={1600} />
          <LoadingStep label="Generating report" delay={2400} />
        </div>
        <div className="loading-bar-container">
          <div className="loading-bar">
            <div className="loading-bar-fill"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingStep({ label, delay }) {
  const [active, setActive] = useState(false);
  
  useState(() => {
    const timer = setTimeout(() => setActive(true), delay);
    return () => clearTimeout(timer);
  });

  return (
    <div className={`loading-step ${active ? 'active' : ''}`}>
      <div className="loading-step-dot"></div>
      <span>{label}</span>
    </div>
  );
}

export default App;
