import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Grid3x3, Eye, EyeOff, RotateCcw, 
  ChevronDown, FileText, Clock, Cpu 
} from 'lucide-react';
import ModelViewer from './ModelViewer';
import ReportPanel from './ReportPanel';
import ActionSection from './ActionSection';
import { mockValidationReport } from '../data/mockData';
import './Dashboard.css';

function Dashboard({ file, onBack }) {
  const [wireframe, setWireframe] = useState(false);
  const [showIssues, setShowIssues] = useState(true);
  const [report] = useState(() => ({
    ...mockValidationReport,
    modelName: file?.name || 'model.stl'
  }));
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true));
  }, []);

  const handleResetView = () => {
    setWireframe(false);
    setShowIssues(true);
  };

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
          <span className="header-filename">{report.modelName}</span>
          <span className="header-meta">{report.fileSize}</span>
          <span className="header-meta-separator">•</span>
          <span className="header-meta">{report.triangleCount.toLocaleString()} triangles</span>
        </div>

        <div className="dashboard-header-right">
          <div className="header-status">
            <Clock size={14} />
            <span>Analysis: {report.analysisTime}</span>
          </div>
          <div className="header-badge header-badge-score" data-score={report.overallScore >= 80 ? 'good' : report.overallScore >= 60 ? 'fair' : 'poor'}>
            <Cpu size={14} />
            <span>Score: {report.overallScore}/100</span>
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
                  className={`toolbar-btn ${showIssues ? 'toolbar-btn-active' : ''}`}
                  onClick={() => setShowIssues(!showIssues)}
                  title="Show/Hide Issues"
                >
                  {showIssues ? <Eye size={16} /> : <EyeOff size={16} />}
                  <span>Issues</span>
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
              <ModelViewer wireframe={wireframe} showIssues={showIssues} />
            </div>
          </motion.div>

          {/* Right — Report Panel */}
          <motion.div 
            className="dashboard-report-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <ReportPanel report={report} />
          </motion.div>
        </div>

        {/* Action Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <ActionSection report={report} />
        </motion.div>
      </div>
    </div>
  );
}

export default Dashboard;
