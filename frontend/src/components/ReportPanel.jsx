import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp,
  Maximize2, Layers, BarChart3, ScanSearch,
  ShieldAlert, ShieldCheck, ShieldX
} from 'lucide-react';
import './ReportPanel.css';

const severityConfig = {
  critical: { label: 'Critical', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: ShieldX },
  high: { label: 'High', color: '#f97316', bg: '#fff7ed', border: '#fdba74', icon: AlertTriangle },
  medium: { label: 'Medium', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: ShieldAlert },
  low: { label: 'Low', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: Info },
};

const groupLabels = {
  holes: 'Holes',
  non_manifold_edges: 'Non-manifold edges',
  non_manifold_vertices: 'Non-manifold vertices',
  open_meshes: 'Open meshes',
  duplicate_faces: 'Duplicate faces',
  duplicate_vertices: 'Duplicate vertices',
  self_intersections: 'Self intersections',
  degenerate_faces: 'Degenerate faces',
  zero_area_faces: 'Zero-area faces',
  inverted_normals: 'Inverted normals',
  internal_faces: 'Internal faces',
  disconnected_components: 'Disconnected components',
};

function formatBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return 'Unavailable';
  const [minBounds, maxBounds] = bounds;
  const size = maxBounds.map((value, index) => (value - minBounds[index]).toFixed(2));
  return `${size[0]} x ${size[1]} x ${size[2]}`;
}

function formatValue(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '0';
}

function flattenIssues(report) {
  return Object.entries(report.errors || {}).flatMap(([group, items]) =>
    (items || []).map((issue, index) => ({
      ...issue,
      id: `${group}-${index}`,
      group,
      label: groupLabels[group] || group.replace(/_/g, ' '),
    })),
  );
}

function severityCounts(issues) {
  return issues.reduce(
    (accumulator, issue) => {
      accumulator[issue.severity] = (accumulator[issue.severity] || 0) + 1;
      return accumulator;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function ReportPanel({ report, onSelectIssue, selectedIssueId }) {
  const [expandedIssue, setExpandedIssue] = useState(null);
  const issues = flattenIssues(report);
  const counts = severityCounts(issues);
  const modelInfo = report.model_info || {};
  const severityPercent = Math.round((report.severity_score || 0) * 100);
  const integrityPercent = Math.max(0, 100 - severityPercent);

  const toggleIssue = (id) => {
    setExpandedIssue(expandedIssue === id ? null : id);
    onSelectIssue?.(id);
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
            {report.error_summary?.total || 0} issues found
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="report-summary">
        <div className="summary-scores">
          <ScoreRing score={integrityPercent} label="Integrity" />
          <ScoreRing score={severityPercent} label="Severity" invert />
        </div>
        
        <div className="summary-counts">
          <SummaryChip 
            icon={<ShieldX size={14} />} 
            count={counts.critical} 
            label="Critical" 
            type="critical" 
          />
          <SummaryChip 
            icon={<AlertTriangle size={14} />} 
            count={counts.high} 
            label="High" 
            type="high" 
          />
          <SummaryChip 
            icon={<ShieldAlert size={14} />} 
            count={counts.medium} 
            label="Medium" 
            type="medium" 
          />
          <SummaryChip 
            icon={<Info size={14} />} 
            count={counts.low} 
            label="Low" 
            type="low" 
          />
        </div>
      </div>

      {/* Model Info */}
      <div className="report-model-info">
        <div className="model-info-grid">
          <InfoItem icon={<Maximize2 size={14} />} label="Bounding Box" value={formatBounds(modelInfo.bounding_box)} />
          <InfoItem icon={<Layers size={14} />} label="Faces" value={formatValue(modelInfo.faces)} />
          <InfoItem icon={<ScanSearch size={14} />} label="Vertices" value={formatValue(modelInfo.vertices)} />
          <InfoItem icon={<ShieldCheck size={14} />} label="Watertight" value={modelInfo.watertight ? 'Yes' : 'No'} />
          <InfoItem icon={<AlertCircle size={14} />} label="Volume" value={Number(modelInfo.volume || 0).toFixed(2)} />
          <InfoItem icon={<AlertCircle size={14} />} label="Surface" value={Number(modelInfo.surface_area || 0).toFixed(2)} />
        </div>
      </div>

      {/* Issues List */}
      <div className="report-issues">
        <h3 className="issues-section-title">Detected Issues</h3>
        <div className="issues-list">
          {issues.map((issue, index) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              index={index}
              isExpanded={expandedIssue === issue.id}
              isSelected={selectedIssueId === issue.id}
              onToggle={() => toggleIssue(issue.id)}
            />
          ))}
          {issues.length === 0 && <EmptyState />}
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score, label, invert = false }) {
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;
  const color = invert
    ? score >= 70
      ? '#ef4444'
      : score >= 40
        ? '#f59e0b'
        : '#10b981'
    : score >= 80
      ? '#10b981'
      : score >= 60
        ? '#f59e0b'
        : '#ef4444';

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

function IssueCard({ issue, index, isExpanded, isSelected, onToggle }) {
  const severity = severityConfig[issue.severity] || severityConfig.low;
  const SeverityIcon = severity.icon;
  const position = Array.isArray(issue.position)
    ? issue.position.map((value) => Number(value).toFixed(2)).join(', ')
    : 'Unavailable';
  const affectedFaces = issue.face_indices?.length || 0;

  return (
    <motion.div 
      className={`issue-card ${isSelected ? 'issue-card-selected' : ''}`}
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
          <span className="issue-type">{issue.label}</span>
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
              <p className="issue-description">{issue.message}</p>
              
              <div className="issue-detail-row">
                <span className="issue-detail-label">Coordinates:</span>
                <span className="issue-detail-value">{position}</span>
              </div>
              
              <div className="issue-detail-row">
                <span className="issue-detail-label">Affected faces:</span>
                <span className="issue-detail-value">{affectedFaces}</span>
              </div>

              <div className="issue-fix">
                <div className="issue-fix-label">
                  <AlertCircle size={14} />
                  Viewer focus
                </div>
                <p className="issue-fix-text">Selecting this issue centers the camera on its detected location in the model.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="report-empty-state">
      <ShieldCheck size={18} />
      <span>No structural issues were detected in the current analysis.</span>
    </div>
  );
}

export default ReportPanel;
