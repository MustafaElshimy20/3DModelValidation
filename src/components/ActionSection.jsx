import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Wrench, Printer, Package, ArrowRight, Sparkles } from 'lucide-react';
import OrderModal from './OrderModal';
import './ActionSection.css';

function ActionSection({ report }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [serviceMode, setServiceMode] = useState(null); // 'fix' | 'fix-print'

  const handleRequestFix = () => {
    setServiceMode('fix');
    setModalOpen(true);
  };

  const handleRequestFixAndPrint = () => {
    setServiceMode('fix-print');
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setServiceMode(null);
  };

  const handleOrderSubmit = (formData) => {
    // Simulate order creation
    const orderId = `PG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    handleCloseModal();

    toast.success(
      `Order ${orderId} submitted successfully! We'll send a confirmation to ${formData.email}.`,
      { duration: 6000 }
    );
  };

  return (
    <>
      <div className="action-section">
        <div className="action-section-inner">
          <div className="action-info">
            <div className="action-icon-wrapper">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="action-title">Ready to Fix These Issues?</h3>
              <p className="action-description">
                Our engineering team can repair your model and optionally produce a high-quality 3D print.
                {report.summary.critical > 0 && (
                  <span className="action-warning"> {report.summary.critical} critical issue(s) should be resolved before printing.</span>
                )}
              </p>
            </div>
          </div>

          <div className="action-buttons">
            <button className="action-btn action-btn-secondary" onClick={handleRequestFix}>
              <Wrench size={18} />
              <div className="action-btn-content">
                <span className="action-btn-label">Request Model Fix</span>
                <span className="action-btn-sub">Repair all detected issues</span>
              </div>
              <ArrowRight size={16} className="action-btn-arrow" />
            </button>

            <button className="action-btn action-btn-primary" onClick={handleRequestFixAndPrint}>
              <Printer size={18} />
              <div className="action-btn-content">
                <span className="action-btn-label">Request Fix + 3D Printing</span>
                <span className="action-btn-sub">Repair, then produce a physical print</span>
              </div>
              <ArrowRight size={16} className="action-btn-arrow" />
            </button>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="action-stats-bar">
          <div className="action-stat">
            <Package size={14} />
            <span>Est. Material: {report.materialEstimates.weight}</span>
          </div>
          <div className="action-stat-sep">•</div>
          <div className="action-stat">
            <Printer size={14} />
            <span>Est. Print Time: {report.materialEstimates.printTime}</span>
          </div>
          <div className="action-stat-sep">•</div>
          <div className="action-stat">
            <Wrench size={14} />
            <span>{report.issues.length} issues to resolve</span>
          </div>
        </div>
      </div>

      <OrderModal 
        isOpen={modalOpen} 
        onClose={handleCloseModal} 
        onSubmit={handleOrderSubmit}
        serviceMode={serviceMode}
      />
    </>
  );
}

export default ActionSection;
