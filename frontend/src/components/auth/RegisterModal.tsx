/**
 * Resident Self-Registration Modal
 * Registers resident and creates mapped household record in Barangay Bang-Bang
 */

import React, { useState, useEffect } from 'react';
import { X, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Purok } from '../../types';
import { api } from '../../services/api';
import { EmailOtpVerification, type PendingVerification } from './EmailOtpVerification';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

export const RegisterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSwitchToLogin
}) => {
  const { register } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [puroks, setPuroks] = useState<Purok[]>([]);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [purokId, setPurokId] = useState('');
  const [addressDetails, setAddressDetails] = useState('');
  const [familyMembers, setFamilyMembers] = useState('3');
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<PendingVerification | null>(null);

  useEffect(() => {
    async function fetchPuroks() {
      try {
        const list = await api.getPuroks();
        setPuroks(list);
        if (list.length > 0 && !purokId) setPurokId(list[0].id);
      } catch (err) {
        console.error(err);
      }
    }
    fetchPuroks();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await register({
        full_name: fullName,
        username,
        email,
        password,
        contact_number: contactNumber,
        purok_id: purokId,
        address_details: addressDetails,
        family_member_count: Number(familyMembers) || 1
      });

      setVerification(res);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeAndReset = () => {
    setSuccessMessage(null);
    setVerification(null);
    setError(null);
    onClose();
  };

  if (successMessage) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-700" />
          </div>
          <h2 className="text-base font-bold text-neutral-900">Email Verified — Registration Submitted</h2>
          <p className="text-xs text-neutral-600 leading-relaxed">{successMessage}</p>
          <button
            type="button"
            onClick={() => {
              setSuccessMessage(null);
              onSwitchToLogin();
            }}
            className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg font-semibold text-xs transition-colors"
          >
            Go to Sign In
          </button>
          <button type="button" onClick={closeAndReset} className="text-xs text-neutral-500 hover:underline">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (verification) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 overflow-y-auto max-h-[90vh]">
          <EmailOtpVerification
            pending={verification}
            onBack={() => setVerification(null)}
            onVerified={(message) => {
              setVerification(null);
              setPassword('');
              setSuccessMessage(message);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <h2 className="text-base font-bold text-neutral-900 font-['Plus_Jakarta_Sans',sans-serif]">
              Resident Household Registration
            </h2>
            <p className="text-xs text-neutral-500">Barangay Bang-Bang, Cordova, Cebu</p>
          </div>
          <button onClick={closeAndReset} aria-label="Close" className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-[11px] leading-relaxed">
          We will email you a 6-digit code to verify your address. After that, your Purok Leader reviews your registration and you can sign in once it is approved.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block text-neutral-700 font-semibold mb-1">Full Name (Head of Household)</label>
            <input
              type="text"
              required
              placeholder="e.g. Maria Clara Deatras"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Username</label>
              <input
                type="text"
                required
                placeholder="maria.clara"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Contact Number</label>
              <input
                type="text"
                placeholder="0917-000-0000"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-700 font-semibold mb-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="maria@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Purok in Bang-Bang</label>
              <select
                value={purokId}
                onChange={(e) => setPurokId(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
                required
              >
                {puroks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Family Members</label>
              <input
                type="number"
                min="1"
                max="50"
                value={familyMembers}
                onChange={(e) => setFamilyMembers(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-700 font-semibold mb-1">Sitio / Street / House Landmark</label>
            <input
              type="text"
              placeholder="e.g. Sitio Seaside, near Mangga Chapel"
              value={addressDetails}
              onChange={(e) => setAddressDetails(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
            />
          </div>

          <div>
            <label className="block text-neutral-700 font-semibold mb-1">Account Password</label>
            <input
              type="password"
              required
              placeholder="At least 8 characters, letters and numbers"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs"
          >
            {submitting ? 'Sending code…' : 'Continue — Verify Email'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-neutral-500 pt-3 border-t border-neutral-100">
          <span>Already registered? </span>
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-emerald-800 font-bold hover:underline"
          >
            Sign In Here
          </button>
        </div>
      </div>
    </div>
  );
};
