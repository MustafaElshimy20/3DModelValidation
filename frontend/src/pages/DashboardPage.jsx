import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Grid3x3, Ruler, RotateCcw, ZoomIn, ZoomOut, FileText, Clock, Cpu
} from 'lucide-react';
import ReportPanel from '../components/ReportPanel';
import './DashboardPage.css';

const ModelViewer = lazy(() => import('../components/ModelViewer'));

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '0';
}

function formatDuration(seconds) {
  return `${(seconds || 0).toFixed(2)}s`;
}

function healthScore(report) {
  return Math.max(0, Math.round((1 - (report?.severity_score || 0)) * 100));
}

function ViewerFallback() {
  return (
    <div className="viewer-loading-state">
      <div className="viewer-loading-spinner" />
      <p>Loading 3D viewer...</p>
    </div>
  );
}

function DashboardPage({ file, report, onBack }) {
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [zoomInSignal, setZoomInSignal] = useState(0);
  const [zoomOutSignal, setZoomOutSignal] = useState(0);
  const [animateIn, setAnimateIn] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState('');

  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true));
  }, []);

  if (!report) {
    return (
      <div className="dashboard dashboard-visible">
        <div className="dashboard-content">
          <p>No analysis report available. Please upload and analyze a model first.</p>
        </div>
      </div>
    );
  }

  const handleResetView = () => {
    setResetSignal((prev) => prev + 1);
  };

  const handleZoomIn = () => {
    setZoomInSignal((prev) => prev + 1);
  };

  const handleZoomOut = () => {
    setZoomOutSignal((prev) => prev + 1);
  };

  const modelInfo = report.model_info || {};
  const statusScore = healthScore(report);
  const headerScoreState = statusScore >= 80 ? 'good' : statusScore >= 55 ? 'fair' : 'poor';
  const issueTotal = report.error_summary?.total || 0;
  const viewerIssues = useMemo(() => {
    return Object.entries(report.errors || {}).flatMap(([group, items]) =>
      (items || []).map((issue, index) => ({
        ...issue,
        id: `${group}-${index}`,
        group,
      })),
    );
  }, [report.errors]);
  const selectedIssue = viewerIssues.find((issue) => issue.id === selectedIssueId) || null;

  return (
    <div className={`dashboard ${animateIn ? 'dashboard-visible' : ''}`}>
      {/* Top Bar */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button className="header-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>
          <div className="header-divider"></div>
          <div className="header-logo">
            <img src="/logo.jpg" alt="Printopia" className="header-logo-img" />
            <span>Printopia</span>
          </div>
        </div>
        
        <div className="dashboard-header-center">
          <FileText size={16} />
          <span className="header-filename">{modelInfo.filename}</span>
          <span className="header-meta">{modelInfo.format?.toUpperCase() || 'MODEL'}</span>
          <span className="header-meta-separator">•</span>
          <span className="header-meta">{formatNumber(modelInfo.faces)} faces</span>
          <span className="header-meta-separator">•</span>
          <span className="header-meta">{formatNumber(modelInfo.vertices)} vertices</span>
        </div>

        <div className="dashboard-header-right">
          <div className="header-status">
            <Clock size={14} />
            <span>Analysis: {formatDuration(report.analysis_duration_seconds)}</span>
          </div>
          <div className="header-badge header-badge-score" data-score={headerScoreState}>
            <Cpu size={14} />
            <span>Health: {statusScore}/100</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="dashboard-split">
          {/* Left — 3D Viewer */}
          <motion.div 
            className="dashboard-viewer-panel"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="viewer-toolbar">
              <div className="viewer-toolbar-group">
                <button 
                  className={`toolbar-btn ${wireframe ? 'toolbar-btn-active' : ''}`}
                  onClick={() => setWireframe(!wireframe)}
                  title="Toggle Wireframe"
                >
                  <Grid3x3 size={16} />
                  <span>Wireframe</span>
                </button>
                <button 
                  className={`toolbar-btn ${showGrid ? 'toolbar-btn-active' : ''}`}
                  onClick={() => setShowGrid(!showGrid)}
                  title="Toggle Grid"
                >
                  <Ruler size={16} />
                  <span>Grid</span>
                </button>
                <button 
                  className="toolbar-btn"
                  onClick={handleZoomIn}
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                  <span>Zoom In</span>
                </button>
                <button 
                  className="toolbar-btn"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                  <span>Zoom Out</span>
                </button>
                <button 
                  className="toolbar-btn"
                  onClick={handleResetView}
                  title="Reset View"
                >
                  <RotateCcw size={16} />
                  <span>Reset</span>
                </button>
              </div>
              <div className="viewer-info-badge">
                <span className="viewer-info-dot"></span>
                Orbit: drag • Zoom: scroll • Pan: right-click
              </div>
            </div>
            
            <div className="viewer-container">
              <Suspense fallback={<ViewerFallback />}>
                <ModelViewer
                  file={file}
                  report={report}
                  selectedIssue={selectedIssue}
                  wireframe={wireframe}
                  showGrid={showGrid}
                  resetSignal={resetSignal}
                  zoomInSignal={zoomInSignal}
                  zoomOutSignal={zoomOutSignal}
                />
              </Suspense>
            </div>
          </motion.div>

          {/* Right — Report Panel */}
          <motion.div 
            className="dashboard-report-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <ReportPanel
              report={report}
              selectedIssueId={selectedIssueId}
              onSelectIssue={setSelectedIssueId}
            />
          </motion.div>
        </div>

        <div className="dashboard-footer-note">
          <span>{issueTotal} detected issues visualized in the viewer.</span>
          <span>Click any issue in the report to focus the camera on its location.</span>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
