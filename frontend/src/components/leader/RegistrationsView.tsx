/**
 * Purok Leader: approve or reject residents who registered in their purok.
 * The server only returns registrations from the leader's own purok.
 */
import React, { useEffect, useState } from 'react';
import { UserPlus, CheckCircle2, XCircle, Clock, Home, Phone, Mail } from 'lucide-react';
import { User } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';

export const RegistrationsView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [pending, setPending] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setPending(await api.getUsers('resident', undefined, 'pending'));
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load registrations', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (u: User, approve: boolean) => {
    let reason = '';
    if (!approve) {
      const r = window.prompt(`Reject ${u.full_name}'s registration? Their pending account will be removed.\n\nReason (optional):`, '');
      if (r === null) return;
      reason = r.trim();
    }
    setBusyId(u.id);
    try {
      if (approve) await api.approveRegistration(u.id);
      else await api.rejectRegistration(u.id, reason);
      showToast({
        type: 'success',
        title: approve ? 'Registration approved' : 'Registration rejected',
        message: approve ? `${u.full_name} can now sign in.` : `${u.full_name}'s registration was removed.`
      });
      setPending((prev) => prev.filter((p) => p.id !== u.id));
    } catch (err: any) {
      showToast({ type: 'error', title: 'Action failed', message: err.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-800">
          <UserPlus className="w-4 h-4 text-teal-700" />
          <span>{user?.purok_name} · Resident Onboarding</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">New Resident Registrations</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Confirm that each person really lives in your purok before approving. Approved residents can submit disposal logs, payments and endorsement requests.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-neutral-400">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-xs text-neutral-500">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
          No registrations are waiting for your approval.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pending.map((u) => (
            <div key={u.id} className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">{u.full_name}</h3>
                  <span className="text-[11px] font-mono text-neutral-500">@{u.username}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  <Clock className="w-3 h-3" /> Pending
                </span>
              </div>
              <ul className="text-xs text-neutral-700 space-y-1.5">
                <li className="flex items-center gap-2"><Home className="w-3.5 h-3.5 text-neutral-400" /> {u.household_number} · {u.address_details || 'No address given'}</li>
                <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-neutral-400" /> {u.contact_number || '—'}</li>
                <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-neutral-400" /> {u.email}</li>
              </ul>
              <p className="text-[11px] text-neutral-400">Registered {formatDateTime(u.created_at)}</p>
              <div className="flex gap-2 pt-1">
                <button
                  disabled={busyId === u.id}
                  onClick={() => decide(u, true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  disabled={busyId === u.id}
                  onClick={() => decide(u, false)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-rose-700 border border-rose-300 hover:bg-rose-50 rounded-lg disabled:opacity-60"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
