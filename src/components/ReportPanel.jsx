import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, AlertCircle, Info, CheckCircle, ChevronDown, ChevronUp,
  Ruler, Weight, Timer, DollarSign, Maximize2, Layers, BarChart3,
  ShieldAlert, ShieldCheck, ShieldX
} from 'lucide-react';
import './ReportPanel.css';

const severityConfig = {
  critical: { label: 'Critical', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: ShieldX },
  medium: { label: 'Medium', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: ShieldAlert },
  low: { label: 'Low', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: Info },
};

function ReportPanel({ report }) {
  const [expandedIssue, setExpandedIssue] = useState(null);

  const toggleIssue = (id) => {
    setExpandedIssue(expandedIssue === id ? null : id);
  };

  return (
    <div className="report-panel">
      {/* Header */}
      <div className="report-header">
        <div className="report-header-top">
          <h2 className="report-title">
            <BarChart3 size={20} />
            Validation Report
          </h2>
          <span className="report-badge">
            {report.issues.length} issues found
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="report-summary">
        <div className="summary-scores">
          <ScoreRing score={report.overallScore} label="Overall" />
          <ScoreRing score={report.printabilityScore} label="Printability" />
        </div>
        
        <div className="summary-counts">
          <SummaryChip 
            icon={<ShieldX size={14} />} 
            count={report.summary.critical} 
            label="Critical" 
            type="critical" 
          />
          <SummaryChip 
            icon={<ShieldAlert size={14} />} 
            count={report.summary.medium} 
            label="Medium" 
            type="medium" 
          />
          <SummaryChip 
            icon={<Info size={14} />} 
            count={report.summary.low} 
            label="Low" 
            type="low" 
          />
          <SummaryChip 
            icon={<ShieldCheck size={14} />} 
            count={report.summary.passed} 
            label="Passed" 
            type="passed" 
          />
        </div>
      </div>

      {/* Model Info */}
      <div className="report-model-info">
        <div className="model-info-grid">
          <InfoItem icon={<Maximize2 size={14} />} label="Dimensions" value={report.dimensions.boundingBox} />
          <InfoItem icon={<Layers size={14} />} label="Triangles" value={report.triangleCount.toLocaleString()} />
          <InfoItem icon={<Weight size={14} />} label="Est. Weight" value={report.materialEstimates.weight} />
          <InfoItem icon={<Timer size={14} />} label="Print Time" value={report.materialEstimates.printTime} />
          <InfoItem icon={<Ruler size={14} />} label="Volume" value={report.materialEstimates.volume} />
          <InfoItem icon={<DollarSign size={14} />} label="Material Cost" value={report.materialEstimates.materialCost} />
        </div>
      </div>

      {/* Issues List */}
      <div className="report-issues">
        <h3 className="issues-section-title">Detected Issues</h3>
        <div className="issues-list">
          {report.issues.map((issue, index) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              index={index}
              isExpanded={expandedIssue === issue.id}
              onToggle={() => toggleIssue(issue.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score, label }) {
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="score-ring-container">
      <svg className="score-ring" viewBox="0 0 80 80">
        <circle
          cx="40" cy="40" r="36"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="5"
        />
        <circle
          cx="40" cy="40" r="36"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="score-ring-value">
        <span className="score-number">{score}</span>
      </div>
      <span className="score-label">{label}</span>
    </div>
  );
}

function SummaryChip({ icon, count, label, type }) {
  return (
    <div className={`summary-chip summary-chip-${type}`}>
      {icon}
      <span className="chip-count">{count}</span>
      <span className="chip-label">{label}</span>
    </div>
  );
}

function InfoItem({ icon, label, value }) {
  return (
    <div className="info-item">
      <div className="info-item-icon">{icon}</div>
      <div className="info-item-content">
        <span className="info-item-label">{label}</span>
        <span className="info-item-value">{value}</span>
      </div>
    </div>
  );
}

function IssueCard({ issue, index, isExpanded, onToggle }) {
  const severity = severityConfig[issue.severity];
  const SeverityIcon = severity.icon;

  return (
    <motion.div 
      className="issue-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <button className="issue-card-header" onClick={onToggle}>
        <div className="issue-card-left">
          <div 
            className="issue-severity-badge"
            style={{ background: severity.bg, color: severity.color, borderColor: severity.border }}
          >
            <SeverityIcon size={12} />
            {severity.label}
          </div>
          <span className="issue-type">{issue.type}</span>
        </div>
        <div className="issue-card-toggle">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="issue-card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="issue-card-body-inner">
              <p className="issue-description">{issue.description}</p>
              
              <div className="issue-detail-row">
                <span className="issue-detail-label">Location:</span>
                <span className="issue-detail-value">{issue.location}</span>
              </div>
              
              <div className="issue-detail-row">
                <span className="issue-detail-label">Affected:</span>
                <span className="issue-detail-value">{issue.affectedTriangles} triangles</span>
              </div>

              <div className="issue-fix">
                <div className="issue-fix-label">
                  <CheckCircle size={14} />
                  Suggested Fix
                </div>
                <p className="issue-fix-text">{issue.suggestedFix}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default ReportPanel;
