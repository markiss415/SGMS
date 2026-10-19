/**
 * Endorsement Processing View - Role 3: Purok Leader
 * CRITICAL RULE: The Purok Leader is the FINAL approving authority.
 * Approving generates official certificate code BB-END-2026-XXXXX.
 */

import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  Check,
  X,
  Printer,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';
import { EndorsementRequest } from '../../types';
import { api } from '../../services/api';
import { EndorsementCertificateModal } from '../common/EndorsementCertificateModal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const EndorsementProcessingView: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  // Only the Purok Leader decides (final approver). The Admin sees a read-only record.
  const canReview = user?.role === 'leader';
  const [busyId, setBusyId] = useState<string | null>(null);
  const [endorsements, setEndorsements] = useState<EndorsementRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('Pending');
  const [remarksMap, setRemarksMap] = useState<{ [id: string]: string }>({});
  const [activeCertificate, setActiveCertificate] = useState<EndorsementRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await api.getEndorsements();
      setEndorsements(data);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load requests', message: err.message });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReview = async (id: string, status: 'Approved' | 'Rejected') => {
    const remarks = (remarksMap[id] || '').trim();
    if (status === 'Rejected' && !remarks) {
      showToast({ type: 'error', title: 'Reason required', message: 'Type the reason for rejecting so the resident knows what to fix.' });
      return;
    }
    if (!confirm(`${status === 'Approved' ? 'Approve' : 'Reject'} this endorsement? Your decision is final and cannot be changed.`)) return;
    setBusyId(id);
    try {
      const updated = await api.reviewEndorsement({
        endorsement_id: id,
        status,
        remarks
      });
      showToast({
        type: status === 'Approved' ? 'success' : 'warning',
        title: `Endorsement ${status}`,
        message: status === 'Approved'
          ? `Endorsement approved. Certificate code ${updated.certificate_code} generated.`
          : `Endorsement request was rejected.`,
        duration: 7000
      });
      setMessage(status === 'Approved' ? `Endorsement approved. Certificate ${updated.certificate_code} issued.` : 'Endorsement request rejected. The resident was notified.');
      loadData();
      if (status === 'Approved') {
        setActiveCertificate(updated);
      }
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Review Error',
        message: err.message || 'Endorsement review failed'
      });
      loadData();
    } finally {
      setBusyId(null);
    }
  };

  const filtered = endorsements.filter((e) => {
    if (filterStatus && e.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-800">
          <ShieldCheck className="w-4 h-4 text-teal-700" />
          <span>Final Approving Authority · Purok Ecological Jurisdiction</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">
          Resident Endorsement & Certificate Requests
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {canReview ? (
            <>As Purok Leader, your endorsement decision is <strong>final</strong>. There is no further admin approval step.</>
          ) : (
            <>Read-only record of endorsement requests. Purok Leaders are the final approvers; the admin does not approve or reject.</>
          )}
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
          Pending Review ({endorsements.filter((e) => e.status === 'Pending').length})
        </button>
        <button
          onClick={() => setFilterStatus('Approved')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === 'Approved' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Approved ({endorsements.filter((e) => e.status === 'Approved').length})
        </button>
        <button
          onClick={() => setFilterStatus('Rejected')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === 'Rejected' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Rejected ({endorsements.filter((e) => e.status === 'Rejected').length})
        </button>
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === '' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          All Requests
        </button>
      </div>

      {/* Endorsements List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-xs text-neutral-500">
            No resident endorsement requests under this filter in your assigned Purok.
          </div>
        ) : (
          filtered.map((end) => {
            const isPending = end.status === 'Pending';
            return (
              <div
                key={end.id}
                className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-neutral-900">{end.resident_name}</span>
                      <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {end.household_number}
                      </span>
                      <span className="text-xs text-neutral-500 font-mono">
                        Requested: {new Date(end.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-neutral-900">
                      Purpose: <span className="text-emerald-900">{end.purpose}</span>
                    </p>

                    {end.details && (
                      <p className="text-xs text-neutral-700 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                        "{end.details}"
                      </p>
                    )}

                    {end.certificate_code && (
                      <div className="flex items-center gap-2 text-xs pt-1">
                        <span className="text-neutral-500">Official Certificate Code:</span>
                        <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {end.certificate_code}
                        </span>
                      </div>
                    )}

                    {end.remarks && (
                      <p className="text-xs text-neutral-500">
                        <span className="font-semibold text-neutral-700">Purok Leader Remarks: </span>
                        {end.remarks}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded border ${
                        end.status === 'Approved'
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                          : end.status === 'Rejected'
                          ? 'text-rose-800 bg-rose-50 border-rose-200'
                          : 'text-sky-800 bg-sky-50 border-sky-200'
                      }`}
                    >
                      {end.status}
                    </span>

                    {end.status === 'Approved' && (
                      <button
                        onClick={() => setActiveCertificate(end)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print Certificate Slip
                      </button>
                    )}

                    {isPending && canReview && (
                      <div className="w-full sm:w-auto mt-2 space-y-2">
                        <input
                          type="text"
                          aria-label={`Remarks for ${end.resident_name}`}
                          placeholder="Remarks (required when rejecting)"
                          value={remarksMap[end.id] || ''}
                          onChange={(e) =>
                            setRemarksMap({ ...remarksMap, [end.id]: e.target.value })
                          }
                          className="w-full text-xs p-1.5 border border-neutral-300 rounded bg-neutral-50 text-neutral-900"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReview(end.id, 'Rejected')}
                            disabled={busyId === end.id}
                            className="flex-1 sm:flex-initial px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 flex items-center justify-center gap-1 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => handleReview(end.id, 'Approved')}
                            disabled={busyId === end.id}
                            className="flex-1 sm:flex-initial px-4 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Grant Final Approval
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

      {/* Printable Certificate Modal */}
      <EndorsementCertificateModal
        endorsement={activeCertificate}
        onClose={() => setActiveCertificate(null)}
      />
    </div>
  );
};
