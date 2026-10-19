/**
 * "My Profile" for every role: view account + household details, update contact info, change password.
 */
import React, { useEffect, useState } from 'react';
import { User as UserIcon, Home, Phone, Mail, ShieldCheck, KeyRound, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { formatDate } from '../../utils/format';

const roleLabels = { admin: 'Barangay Admin', collector: 'Garbage Collector', leader: 'Purok Leader', resident: 'Resident' } as const;
const inputCls = 'w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900';

export const ProfileView: React.FC = () => {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [contact, setContact] = useState(user?.contact_number || '');
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name || '');
    setEmail(user?.email || '');
    setContact(user?.contact_number || '');
  }, [user?.id]);

  if (!user) return null;

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateProfile({ full_name: fullName, email, contact_number: contact });
      setUser(updated);
      showToast({ type: 'success', title: 'Profile updated', message: 'Your details were saved.' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Not saved', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) return showToast({ type: 'error', title: 'Passwords do not match', message: 'Please type the same new password twice.' });
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      return showToast({ type: 'error', title: 'Weak password', message: 'Use at least 8 characters with letters and numbers.' });
    }
    setChangingPw(true);
    try {
      const res = await api.changePassword({ current_password: currentPw, new_password: newPw });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      showToast({ type: 'success', title: 'Password changed', message: res.message });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Password not changed', message: err.message });
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
          <UserIcon className="w-4 h-4 text-emerald-700" />
          <span>Account Record</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">{user.role === 'resident' ? 'Profile & Household Information' : 'My Profile'}</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Keep your contact details up to date so the barangay can reach you.</p>
      </div>

      {/* Summary */}
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-700 mt-0.5" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block">Role</span>
            <span className="font-bold text-neutral-900">{roleLabels[user.role]}</span>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <UserIcon className="w-4 h-4 text-emerald-700 mt-0.5" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block">Username</span>
            <span className="font-mono font-bold text-neutral-900">{user.username}</span>
          </div>
        </div>
        {user.purok_name && (
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-emerald-700 mt-0.5" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block">Purok</span>
              <span className="font-bold text-neutral-900">{user.purok_name}</span>
            </div>
          </div>
        )}
        {user.household_number && (
          <div className="flex items-start gap-2.5">
            <Home className="w-4 h-4 text-emerald-700 mt-0.5" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block">Household</span>
              <span className="font-mono font-bold text-neutral-900">{user.household_number}</span>
              {user.address_details && <span className="block text-neutral-500">{user.address_details}</span>}
            </div>
          </div>
        )}
        <div className="flex items-start gap-2.5">
          <Mail className="w-4 h-4 text-emerald-700 mt-0.5" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block">Member since</span>
            <span className="font-bold text-neutral-900">{formatDate(user.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form onSubmit={saveDetails} className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs space-y-3 text-xs">
          <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-700" /> Contact Details
          </h2>
          <div>
            <label htmlFor="pf-name" className="block text-neutral-700 font-semibold mb-1">Full Name</label>
            <input id="pf-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="pf-email" className="block text-neutral-700 font-semibold mb-1">Email Address</label>
            <input id="pf-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="pf-contact" className="block text-neutral-700 font-semibold mb-1">Contact Number</label>
            <input id="pf-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="0917-000-0000" className={inputCls} />
          </div>
          <button type="submit" disabled={saving} className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-lg font-semibold">
            {saving ? 'Saving…' : 'Save Details'}
          </button>
        </form>

        <form onSubmit={changePassword} className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs space-y-3 text-xs">
          <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-700" /> Change Password
          </h2>
          <div>
            <label htmlFor="pf-cur" className="block text-neutral-700 font-semibold mb-1">Current Password</label>
            <input id="pf-cur" type="password" autoComplete="current-password" required value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="pf-new" className="block text-neutral-700 font-semibold mb-1">New Password</label>
            <input id="pf-new" type="password" autoComplete="new-password" required value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters, letters and numbers" className={inputCls} />
          </div>
          <div>
            <label htmlFor="pf-confirm" className="block text-neutral-700 font-semibold mb-1">Confirm New Password</label>
            <input id="pf-confirm" type="password" autoComplete="new-password" required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} />
          </div>
          <button type="submit" disabled={changingPw} className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-700 dark:hover:bg-neutral-600 disabled:opacity-60 text-white rounded-lg font-semibold">
            {changingPw ? 'Updating…' : 'Update Password'}
          </button>
          <p className="text-[11px] text-neutral-400">Other devices signed in to your account will be signed out.</p>
        </form>
      </div>
    </div>
  );
};
