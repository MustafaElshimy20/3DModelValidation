import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, Zap, ChevronRight, FileBox, Layers, AlertTriangle } from 'lucide-react';
import './LandingPage.css';

const SUPPORTED_FORMATS = ['.STL', '.OBJ', '.3MF'];

function LandingPage({ onFileUpload }) {
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0]);
    }
    setIsDragging(false);
  }, [onFileUpload]);

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    accept: {
      'model/stl': ['.stl'],
      'model/obj': ['.obj'],
      'application/vnd.ms-package.3dmanufacturing-3dmodel+xml': ['.3mf'],
    },
    multiple: false,
    noClick: true,
  });

  return (
    <div className="landing">
      {/* Background Effects */}
      <div className="landing-bg">
        <div className="landing-bg-grid"></div>
        <div className="landing-bg-orb landing-bg-orb-1"></div>
        <div className="landing-bg-orb landing-bg-orb-2"></div>
        <div className="landing-bg-orb landing-bg-orb-3"></div>
      </div>

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <img src="/logo.jpg" alt="Printopia" className="landing-logo-img" />
            <span className="landing-logo-text">Printopia</span>
          </div>
          <div className="landing-nav-links">
            <a href="#features" className="nav-link">Features</a>
            <button className="nav-btn" onClick={() => navigate('/auth')}>Sign In</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="landing-main">
        <motion.div 
          className="landing-hero"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h1 className="hero-title">
            Validate Your 3D Models <span className="hero-title-accent">Before You Print</span>
          </h1>
          
          <p className="hero-description">
            <span className="hero-keyword">Instant mesh analysis</span>, <span className="hero-keyword">printability checks</span>, and <span className="hero-keyword">automated repair</span> suggestions. Catch <span className="hero-highlight">critical issues</span> before they become costly print failures.
          </p>

          {/* Upload Area */}
          <motion.div 
            className={`upload-zone ${isDragging ? 'upload-zone-active' : ''}`}
            {...getRootProps()}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <input {...getInputProps()} />
            
            <div className="upload-zone-inner">
              <div className={`upload-icon-wrapper ${isDragging ? 'upload-icon-active' : ''}`}>
                <Upload size={32} strokeWidth={1.5} />
              </div>
              
              <div className="upload-text">
                <h3>Drag & drop your 3D model here</h3>
                <p>or click the button below to browse files</p>
              </div>

              <button className="upload-btn" onClick={open} type="button">
                <Upload size={18} />
                Upload 3D Model
                <ChevronRight size={16} />
              </button>

              <div className="upload-formats">
                <span className="upload-formats-label">Supported formats:</span>
                <div className="upload-formats-list">
                  {SUPPORTED_FORMATS.map((fmt) => (
                    <span key={fmt} className="format-tag">{fmt}</span>
                  ))}
                </div>
              </div>
            </div>

            {isDragging && (
              <div className="upload-overlay">
                <div className="upload-overlay-content">
                  <Upload size={48} strokeWidth={1.5} />
                  <span>Release to upload</span>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* Features */}
        <motion.div 
          id="features"
          className="features-section"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
        >
          <div className="features-grid">
            <FeatureCard
              icon={<AlertTriangle size={24} />}
              title="Issue Detection"
              description="Identify non-manifold edges, inverted normals, thin walls, and 15+ other mesh problems instantly."
            />
            <FeatureCard
              icon={<Layers size={24} />}
              title="3D Visualization"
              description="Interactive Three.js viewer with highlighted problem areas for intuitive understanding of detected issues."
            />
            <FeatureCard
              icon={<Zap size={24} />}
              title="Instant Analysis"
              description="Get a comprehensive printability report in seconds, with severity ratings and actionable fix suggestions."
            />
            <FeatureCard
              icon={<FileBox size={24} />}
              title="Multi-Format Support"
              description="Upload STL, OBJ, and 3MF files. Our parser handles binary & ASCII formats with full fidelity."
            />
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <span>© 2026 Printopia — 3D Model Validation Platform</span>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-description">{description}</p>
    </div>
  );
}

export default LandingPage;
