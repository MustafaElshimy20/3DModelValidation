import { motion } from 'framer-motion';
import { Cpu, UploadCloud, Sparkles } from 'lucide-react';
import './AnalyzingPage.css';

function stageLabel(stage) {
  if (stage === 'uploading') {
    return 'Uploading model to validation engine';
  }
  if (stage === 'analyzing') {
    return 'Running topology and geometry checks';
  }
  if (stage === 'finalizing') {
    return 'Preparing interactive report';
  }
  return 'Preparing analysis';
}

function stageIcon(stage) {
  if (stage === 'uploading') {
    return UploadCloud;
  }
  if (stage === 'analyzing') {
    return Cpu;
  }
  return Sparkles;
}

function AnalyzingPage({ fileName, progress, stage }) {
  const percent = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const Icon = stageIcon(stage);

  return (
    <div className="analyzing-page">
      <div className="analyzing-bg" />

      <motion.div
        className="analyzing-card"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35 }}
      >
        <motion.div
          className="analyzing-icon"
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon size={30} />
        </motion.div>

        <h1 className="analyzing-title">Analyzing Your Model</h1>
        <p className="analyzing-file">{fileName || 'model file'}</p>
        <p className="analyzing-stage">{stageLabel(stage)}</p>

        <div className="analyzing-progress-wrap">
          <div className="analyzing-progress-track">
            <motion.div
              className="analyzing-progress-bar"
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
          <div className="analyzing-progress-label">{percent}%</div>
        </div>

        <div className="analyzing-steps">
          <span className={percent > 0 ? 'step-active' : ''}>Upload</span>
          <span className={percent >= 90 ? 'step-active' : ''}>Analyze</span>
          <span className={percent >= 100 ? 'step-active' : ''}>Report</span>
        </div>
      </motion.div>
    </div>
  );
}

export default AnalyzingPage;