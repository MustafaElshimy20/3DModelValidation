import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import AnalyzingPage from './pages/AnalyzingPage';
import AppLayout from './layouts/AppLayout';
import { useAnalysisWorkflow } from './hooks/useAnalysisWorkflow';
import { getErrorMessage } from './utils/errorUtils';
import './App.css';

const VIEW = {
  LANDING: 'landing',
  ANALYZING: 'analyzing',
  DASHBOARD: 'dashboard',
};

function App() {
  const [currentView, setCurrentView] = useState(VIEW.LANDING);
  const {
    analysisReport,
    uploadedFile,
    isAnalyzing,
    analysisError,
    analysisProgress,
    analysisStage,
    runAnalysis,
    resetWorkflow,
  } = useAnalysisWorkflow();

  useEffect(() => {
    if (analysisError) {
      toast.error(analysisError);
    }
  }, [analysisError]);

  const handleFileUpload = useCallback(async (file) => {
    try {
      setCurrentView(VIEW.ANALYZING);
      await runAnalysis(file);
      setCurrentView(VIEW.DASHBOARD);
    } catch (error) {
      setCurrentView(VIEW.LANDING);
      toast.error(getErrorMessage(error, 'Model analysis failed.'));
    }
  }, [runAnalysis]);

  const handleBackToHome = useCallback(() => {
    resetWorkflow();
    setCurrentView(VIEW.LANDING);
  }, [resetWorkflow]);

  return (
    <AppLayout>
      {currentView === VIEW.LANDING && (
        <LandingPage onFileUpload={handleFileUpload} isAnalyzing={isAnalyzing} />
      )}

      {currentView === VIEW.DASHBOARD && (
        <DashboardPage
          file={uploadedFile}
          report={analysisReport}
          onBack={handleBackToHome}
        />
      )}

      {currentView === VIEW.ANALYZING && (
        <AnalyzingPage
          fileName={uploadedFile?.name}
          progress={analysisProgress}
          stage={analysisStage}
        />
      )}
    </AppLayout>
  );
}

export default App;
