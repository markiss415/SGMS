/**
 * Disposal Verification View - Role 3: Purok Leader
 * Verify or reject resident garbage disposal participation reports
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, Check, X, Filter, MessageSquare, AlertCircle } from 'lucide-react';
import { DisposalSubmission } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime } from '../../utils/format';

export const DisposalVerificationView: React.FC = () => {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<DisposalSubmission[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('Pending');
  const [remarksInput, setRemarksInput] = useState<{ [id: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await api.getDisposalSubmissions();
      setSubmissions(data);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load records', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleVerify = async (submissionId: string, status: 'Verified' | 'Rejected') => {
    const remarks = (remarksInput[submissionId] || '').trim();
    if (status === 'Rejected' && !remarks) {
      showToast({ type: 'error', title: 'Reason required', message: 'Type the reason for rejecting so the resident can correct it.' });
      return;
    }
    setBusyId(submissionId);
    try {
      await api.verifyDisposal({
        submission_id: submissionId,
        status,
        remarks
      });
      setMessage(`Disposal report marked as ${status}. Notification dispatched to resident.`);
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Not saved', message: err.message || 'Verification update failed' });
      loadData();
    } finally {
      setBusyId(null);
    }
  };

  const filtered = submissions.filter((s) => {
    if (filterStatus && s.verification_status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-800">
          <CheckCircle2 className="w-4 h-4 text-teal-700" />
          <span>Purok Waste Inspection Panel</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">
          Resident Garbage Disposal Verification
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Inspect reported resident disposal compliance in your assigned Purok. Prevent unsegregated or false reports.
        </p>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-neutral-200/60 rounded-xl w-fit">
        <button
          onClick={() => setFilterStatus('Pending')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === 'Pending' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Pending Review ({submissions.filter((s) => s.verification_status === 'Pending').length})
        </button>
        <button
          onClick={() => setFilterStatus('Verified')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === 'Verified' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Verified ({submissions.filter((s) => s.verification_status === 'Verified').length})
        </button>
        <button
          onClick={() => setFilterStatus('Rejected')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === 'Rejected' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Rejected ({submissions.filter((s) => s.verification_status === 'Rejected').length})
        </button>
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === '' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          All Records
        </button>
      </div>

      {/* Submissions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-10 text-center text-xs text-neutral-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-xs text-neutral-500">
            No disposal reports currently matching this status in your assigned Purok.
          </div>
        ) : (
          filtered.map((sub) => {
            const isPending = sub.verification_status === 'Pending';
            return (
              <div
                key={sub.id}
                className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-neutral-900">{sub.resident_name}</span>
                      <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {sub.household_number}
                      </span>
                      <span className="text-xs text-neutral-500">
                        Collection {formatDate(sub.scheduled_date)} · logged {formatDateTime(sub.submission_timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-700">
                      Disposal Payload: <strong className="text-neutral-900">{sub.bag_count} bag(s)</strong> of{' '}
                      <span className="font-semibold text-emerald-800">{sub.waste_type}</span> waste.
                    </p>

                    {sub.notes && (
                      <p className="text-xs text-neutral-600 italic bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                        "{sub.notes}"
                      </p>
                    )}

                    {sub.proof_url && (
                      <a href={sub.proof_url} target="_blank" rel="noreferrer" className="inline-block">
                        <img src={sub.proof_url} alt={`Disposal photo from ${sub.resident_name}`} className="w-24 h-24 object-cover rounded-lg border border-neutral-200" />
                      </a>
                    )}

                    {!isPending && (
                      <p className="text-xs text-neutral-500">
                        <span className="font-semibold text-neutral-700">Decision: </span>
                        {sub.verification_status} by {sub.leader_name || 'Purok Leader'} on {formatDateTime(sub.verified_at)}
                        {sub.verification_remarks ? ` — ${sub.verification_remarks}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Actions / Status */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded border ${
                        sub.verification_status === 'Verified'
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                          : sub.verification_status === 'Rejected'
                          ? 'text-rose-800 bg-rose-50 border-rose-200'
                          : 'text-amber-800 bg-amber-50 border-amber-200'
                      }`}
                    >
                      {sub.verification_status}
                    </span>

                    {isPending && (
                      <div className="w-full sm:w-auto mt-2 space-y-2">
                        <input
                          type="text"
                          placeholder="Remarks (required when rejecting)"
                          aria-label={`Remarks for ${sub.resident_name}`}
                          value={remarksInput[sub.id] || ''}
                          onChange={(e) =>
                            setRemarksInput({ ...remarksInput, [sub.id]: e.target.value })
                          }
                          className="w-full text-xs p-1.5 border border-neutral-300 rounded bg-neutral-50 text-neutral-900"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVerify(sub.id, 'Rejected')}
                            disabled={busyId === sub.id}
                            className="disabled:opacity-60 flex-1 sm:flex-initial px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 flex items-center justify-center gap-1 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => handleVerify(sub.id, 'Verified')}
                            disabled={busyId === sub.id}
                            className="disabled:opacity-60 flex-1 sm:flex-initial px-4 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Verify Participation
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
