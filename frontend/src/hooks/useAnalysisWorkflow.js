import { useCallback, useState } from 'react';
import { analyzeModel } from '../services/analysisService';

export function useAnalysisWorkflow() {
  const [analysisReport, setAnalysisReport] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState('idle');

  const runAnalysis = useCallback(async (file) => {
    let pulseTimer = null;
    let pulseStarted = false;

    const startAnalyzePulse = () => {
      if (pulseStarted) {
        return;
      }
      pulseStarted = true;
      setAnalysisStage('analyzing');
      pulseTimer = window.setInterval(() => {
        setAnalysisProgress((current) => {
          if (current >= 98) {
            return current;
          }
          return current + 1;
        });
      }, 220);
    };

    setIsAnalyzing(true);
    setAnalysisError('');
    setUploadedFile(file);
    setAnalysisProgress(0);
    setAnalysisStage('uploading');

    try {
      const response = await analyzeModel(file, {
        onProgress: (progress) => {
          const normalized = Math.min(90, Math.round(progress * 0.9));
          setAnalysisProgress((current) => (normalized > current ? normalized : current));
          if (progress >= 100) {
            startAnalyzePulse();
          }
        },
      });

      startAnalyzePulse();
      setAnalysisStage('finalizing');
      setAnalysisProgress(100);
      setAnalysisReport(response);
      return response;
    } catch (error) {
      setAnalysisError(error.message || 'Failed to analyze model.');
      setAnalysisStage('error');
      throw error;
    } finally {
      if (pulseTimer) {
        window.clearInterval(pulseTimer);
      }
      setIsAnalyzing(false);
    }
  }, []);

  const resetWorkflow = useCallback(() => {
    setUploadedFile(null);
    setAnalysisReport(null);
    setAnalysisError('');
    setAnalysisProgress(0);
    setAnalysisStage('idle');
  }, []);

  return {
    analysisReport,
    uploadedFile,
    isAnalyzing,
    analysisError,
    analysisProgress,
    analysisStage,
    runAnalysis,
    resetWorkflow,
  };
}
