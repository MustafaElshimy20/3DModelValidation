import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, Box } from 'lucide-react';
import './AuthPage.css';

function AuthPage() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'

  return (
    <div className="auth-page">
      {/* Background */}
      <div className="auth-bg">
        <div className="auth-bg-grid"></div>
        <div className="auth-bg-orb auth-bg-orb-1"></div>
        <div className="auth-bg-orb auth-bg-orb-2"></div>
      </div>

      <div className="auth-container">
        {/* Back to Home */}
        <Link to="/" className="auth-back-link">
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        {/* Logo */}
        <div className="auth-logo">
          <img src="/logo.jpg" alt="Printopia" className="auth-logo-img" />
          <span className="auth-logo-text">Printopia</span>
        </div>

        {/* Card */}
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Tabs */}
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'signin' ? 'auth-tab-active' : ''}`}
              onClick={() => setMode('signin')}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === 'signup' ? 'auth-tab-active' : ''}`}
              onClick={() => setMode('signup')}
            >
              Sign Up
            </button>
            <div
              className="auth-tab-indicator"
              style={{ transform: mode === 'signin' ? 'translateX(0)' : 'translateX(100%)' }}
            />
          </div>

          {/* Forms */}
          <AnimatePresence mode="wait">
            {mode === 'signin' ? (
              <motion.div
                key="signin"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
              >
                <SignInForm onSwitchToSignUp={() => setMode('signup')} />
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <SignUpForm onSwitchToSignIn={() => setMode('signin')} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="auth-footer-text">
          &copy; 2026 Printopia &mdash; 3D Model Validation Platform
        </p>
      </div>
    </div>
  );
}

function SignInForm({ onSwitchToSignUp }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errs = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email format';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    toast.success('Signed in successfully! Welcome back.');
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-form-header">
        <h2>Welcome back</h2>
        <p>Sign in to your account to continue</p>
      </div>

      <div className={`auth-field ${errors.email ? 'auth-field-error' : ''}`}>
        <label>Email</label>
        <div className="auth-input-wrapper">
          <Mail size={16} className="auth-input-icon" />
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: '' })); }}
          />
        </div>
        {errors.email && <span className="auth-error">{errors.email}</span>}
      </div>

      <div className={`auth-field ${errors.password ? 'auth-field-error' : ''}`}>
        <label>Password</label>
        <div className="auth-input-wrapper">
          <Lock size={16} className="auth-input-icon" />
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors(prev => ({ ...prev, password: '' })); }}
          />
          <button
            type="button"
            className="auth-password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <span className="auth-error">{errors.password}</span>}
      </div>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? <span className="auth-spinner" /> : null}
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <p className="auth-switch-text">
        Don't have an account?{' '}
        <button type="button" className="auth-switch-link" onClick={onSwitchToSignUp}>
          Sign Up
        </button>
      </p>
    </form>
  );
}

function SignUpForm({ onSwitchToSignIn }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const clearError = (field) => {
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email format';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!confirmPassword) errs.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setLoading(false);
    toast.success('Account created successfully! Welcome to Printopia.');
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-form-header">
        <h2>Create your account</h2>
        <p>Get started with Printopia for free</p>
      </div>

      <div className={`auth-field ${errors.fullName ? 'auth-field-error' : ''}`}>
        <label>Full Name</label>
        <div className="auth-input-wrapper">
          <User size={16} className="auth-input-icon" />
          <input
            type="text"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); clearError('fullName'); }}
          />
        </div>
        {errors.fullName && <span className="auth-error">{errors.fullName}</span>}
      </div>

      <div className={`auth-field ${errors.email ? 'auth-field-error' : ''}`}>
        <label>Email</label>
        <div className="auth-input-wrapper">
          <Mail size={16} className="auth-input-icon" />
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
          />
        </div>
        {errors.email && <span className="auth-error">{errors.email}</span>}
      </div>

      <div className={`auth-field ${errors.password ? 'auth-field-error' : ''}`}>
        <label>Password</label>
        <div className="auth-input-wrapper">
          <Lock size={16} className="auth-input-icon" />
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
          />
          <button
            type="button"
            className="auth-password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <span className="auth-error">{errors.password}</span>}
      </div>

      <div className={`auth-field ${errors.confirmPassword ? 'auth-field-error' : ''}`}>
        <label>Confirm Password</label>
        <div className="auth-input-wrapper">
          <Lock size={16} className="auth-input-icon" />
          <input
            type={showConfirm ? 'text' : 'password'}
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); clearError('confirmPassword'); }}
          />
          <button
            type="button"
            className="auth-password-toggle"
            onClick={() => setShowConfirm(!showConfirm)}
            tabIndex={-1}
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.confirmPassword && <span className="auth-error">{errors.confirmPassword}</span>}
      </div>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? <span className="auth-spinner" /> : null}
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      <p className="auth-switch-text">
        Already have an account?{' '}
        <button type="button" className="auth-switch-link" onClick={onSwitchToSignIn}>
          Sign In
        </button>
      </p>
    </form>
  );
}

export default AuthPage;
