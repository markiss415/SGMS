/**
 * Password Reset Modal - Barangay Bang-Bang Smart Garbage Monitoring System
 * Allows citizens and barangay officials to recover account via email verification code
 */

import React, { useState } from 'react';
import { X, KeyRound, Mail, CheckCircle2, AlertCircle, ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onBackToLogin: () => void;
}

export const PasswordResetModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  onBackToLogin
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [identifier, setIdentifier] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      setError('Please provide your registered username or email.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.forgotPassword(identifier.trim());
      setSentMessage(res.message);
      setStep('reset');
      showToast({
        type: 'info',
        title: 'Check Your Email',
        message: 'If the account exists, a 6-digit code was sent to its email.'
      });
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword({
        identifier: identifier.trim(),
        code: code.trim(),
        new_password: newPassword
      });

      showToast({
        type: 'success',
        title: 'Password Updated',
        message: res.message || 'Your password was successfully updated. You may now sign in.'
      });

      // Reset internal states
      setStep('request');
      setIdentifier('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please verify the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(identifier.trim());
      showToast({
        type: 'info',
        title: 'Code Resent',
        message: 'A fresh recovery code was dispatched to your email.'
      });
    } catch (err: any) {
      setError(err.message || 'Could not resend recovery code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white font-['Plus_Jakarta_Sans',sans-serif]">
                {step === 'request' ? 'Account Recovery' : 'Create New Password'}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Barangay Bang-Bang Citizen Portal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequestCode} className="mt-4 space-y-3.5 text-xs">
            <p className="text-neutral-600 dark:text-neutral-300 text-xs leading-relaxed">
              Enter your registered username or email address. We will generate and send a secure 6-digit recovery code to verify your identity.
            </p>

            <div>
              <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                Username or Email Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. maria.santos or maria.santos@bangbang.ph"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full p-2.5 pl-9 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-850 focus:ring-1 focus:ring-emerald-700"
                />
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              {loading ? 'Verifying Account...' : 'Send Verification Code'}
            </button>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 text-center">
              <button
                type="button"
                onClick={onBackToLogin}
                className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 hover:text-emerald-800 dark:hover:text-emerald-400 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="mt-4 space-y-3.5 text-xs">
            <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-1">
              <p className="text-emerald-900 dark:text-emerald-300 text-[11px] leading-relaxed">{sentMessage}</p>
              <p className="text-emerald-700 dark:text-emerald-400 text-[11px] leading-relaxed">
                No email? Ask the Barangay Admin to reset your password from the Users page.
              </p>
            </div>

            <div>
              <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                6-Digit Verification Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full p-2.5 text-center font-mono text-base tracking-widest border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-850"
              />
            </div>

            <div>
              <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 8 characters, letters and numbers"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-2.5 pr-9 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-850"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-3 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                Confirm New Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-850"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-neutral-500 dark:text-neutral-400">Didn't receive code?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="text-emerald-800 dark:text-emerald-400 font-semibold hover:underline"
              >
                Resend Code
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? 'Updating Password...' : 'Save New Password & Sign In'}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setStep('request')}
                className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                Change Email / Username
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
