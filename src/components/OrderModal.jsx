import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Mail, MapPin, FileText, Settings, Send, Loader2 } from 'lucide-react';
import { serviceTypes } from '../data/mockData';
import './OrderModal.css';

function OrderModal({ isOpen, onClose, onSubmit, serviceMode }) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    address: '',
    notes: '',
    serviceType: serviceMode === 'fix' ? 'fix-only' : 'fix-print-fdm',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const overlayRef = useRef();

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        serviceType: serviceMode === 'fix' ? 'fix-only' : 'fix-print-fdm',
      }));
      setErrors({});
      setSubmitting(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, serviceMode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.address.trim()) newErrors.address = 'Address is required';
    if (!formData.serviceType) newErrors.serviceType = 'Select a service type';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    setSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    onSubmit(formData);
  };

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const filteredServices = serviceMode === 'fix' 
    ? serviceTypes.filter(s => s.id === 'fix-only')
    : serviceTypes;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          ref={overlayRef}
          onClick={handleOverlayClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h2 className="modal-title">
                  {serviceMode === 'fix' ? 'Request Model Repair' : 'Request Repair & Print'}
                </h2>
                <p className="modal-subtitle">
                  Fill in your details and we'll process your order within 24 hours.
                </p>
              </div>
              <button className="modal-close" onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                {/* Full Name */}
                <div className={`form-group ${errors.fullName ? 'form-group-error' : ''}`}>
                  <label className="form-label">
                    <User size={14} />
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    className="form-input"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={handleChange}
                  />
                  {errors.fullName && <span className="form-error">{errors.fullName}</span>}
                </div>

                {/* Email */}
                <div className={`form-group ${errors.email ? 'form-group-error' : ''}`}>
                  <label className="form-label">
                    <Mail size={14} />
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    className="form-input"
                    placeholder="john@company.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                  {errors.email && <span className="form-error">{errors.email}</span>}
                </div>
              </div>

              {/* Address */}
              <div className={`form-group ${errors.address ? 'form-group-error' : ''}`}>
                <label className="form-label">
                  <MapPin size={14} />
                  Shipping Address
                </label>
                <input
                  type="text"
                  name="address"
                  className="form-input"
                  placeholder="123 Main St, City, State, ZIP"
                  value={formData.address}
                  onChange={handleChange}
                />
                {errors.address && <span className="form-error">{errors.address}</span>}
              </div>

              {/* Service Type */}
              <div className={`form-group ${errors.serviceType ? 'form-group-error' : ''}`}>
                <label className="form-label">
                  <Settings size={14} />
                  Service Type
                </label>
                <div className="service-options">
                  {filteredServices.map(service => (
                    <label 
                      key={service.id} 
                      className={`service-option ${formData.serviceType === service.id ? 'service-option-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="serviceType"
                        value={service.id}
                        checked={formData.serviceType === service.id}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <div className="service-option-content">
                        <div className="service-option-header">
                          <span className="service-option-label">{service.label}</span>
                          <span className="service-option-price">{service.price}</span>
                        </div>
                        <span className="service-option-desc">{service.description}</span>
                      </div>
                      <div className="service-option-radio"></div>
                    </label>
                  ))}
                </div>
                {errors.serviceType && <span className="form-error">{errors.serviceType}</span>}
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">
                  <FileText size={14} />
                  Additional Notes
                  <span className="form-label-optional">(optional)</span>
                </label>
                <textarea
                  name="notes"
                  className="form-input form-textarea"
                  placeholder="Any special requirements, material preferences, or deadlines..."
                  rows={3}
                  value={formData.notes}
                  onChange={handleChange}
                />
              </div>

              {/* Actions */}
              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="modal-btn-submit"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="spin-icon" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Submit Order
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OrderModal;
