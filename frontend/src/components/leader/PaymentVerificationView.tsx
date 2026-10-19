/**
 * Weekly contribution review.
 *  - Purok Leader: verifies or rejects payments from their own purok (the server enforces the purok).
 *  - Admin: read-only ledger of every purok (payments are verified by leaders only, never automatically).
 */

import React, { useState, useEffect } from 'react';
import { Receipt, Check, X, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { PaymentSubmission } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime, peso } from '../../utils/format';

export const PaymentVerificationView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canReview = user?.role === 'leader';
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purokFilter, setPurokFilter] = useState('');
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('Pending');
  const [search, setSearch] = useState('');
  const [rejectionReasons, setRejectionReasons] = useState<{ [id: string]: string }>({});
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await api.getPayments();
      setPayments(data);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load payments', message: err.message });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDecision = async (paymentId: string, status: 'Verified' | 'Rejected') => {
    const reason = (rejectionReasons[paymentId] || '').trim();
    if (status === 'Rejected' && !reason) {
      showToast({ type: 'error', title: 'Reason required', message: 'Type why the payment is rejected (e.g. reference number not found).' });
      return;
    }
    setBusyId(paymentId);
    try {
      await api.verifyPayment({
        payment_id: paymentId,
        status,
        rejection_reason: status === 'Rejected' ? reason : undefined
      });
      setMessage(`Payment was ${status.toLowerCase()}. Resident notified.`);
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Not saved', message: err.message || 'Payment review failed' });
      loadData();
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toUpperCase();
  const filtered = payments.filter((p) => {
    if (q) {
      const hay = `${p.payment_code || ''} ${p.reference_number} ${p.household_number || ''} ${p.resident_name || ''}`.toUpperCase();
      return hay.includes(q) || hay.replace(/[\s-]/g, '').includes(q.replace(/[\s-]/g, ''));
    }
    if (filterStatus && p.status !== filterStatus) return false;
    if (purokFilter && p.purok_name !== purokFilter) return false;
    return true;
  });
  const purokNames = Array.from(new Set(payments.map((p) => p.purok_name || ''))).filter(Boolean).sort();
  const verifiedTotal = payments.filter((p) => p.status === 'Verified' && (!purokFilter || p.purok_name === purokFilter)).reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-800">
          <Receipt className="w-4 h-4 text-teal-700" />
          <span>{canReview ? `${user?.purok_name} · Contribution Verification` : 'Barangay Waste Fund Ledger'}</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">
          {canReview ? 'Weekly Contribution Verification' : 'Weekly Contribution Ledger'}
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {canReview
            ? 'Check each reference number or cash receipt before verifying. Payments are never verified automatically.'
            : 'All weekly contributions across puroks. Purok Leaders verify payments; this view is read-only.'}
          {' '}Verified total{purokFilter ? ` (${purokFilter})` : ''}: <strong className="text-emerald-900">{peso(verifiedTotal)}</strong>
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
          Pending Verifications ({payments.filter((p) => p.status === 'Pending').length})
        </button>
        <button
          onClick={() => setFilterStatus('Verified')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === 'Verified' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Approved ({payments.filter((p) => p.status === 'Verified').length})
        </button>
        <button
          onClick={() => setFilterStatus('Rejected')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === 'Rejected' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Rejected ({payments.filter((p) => p.status === 'Rejected').length})
        </button>
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            filterStatus === '' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          All Payments
        </button>
      </div>

      {!canReview && purokNames.length > 1 && (
        <select
          value={purokFilter}
          onChange={(e) => setPurokFilter(e.target.value)}
          aria-label="Filter by purok"
          className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white text-neutral-800"
        >
          <option value="">All Puroks</option>
          {purokNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search payment code (BB-PAY-…), GCash/Maya reference, household or name"
        aria-label="Search payments"
        className="w-full sm:max-w-md text-xs border border-neutral-200 rounded-lg px-3 py-2 bg-white text-neutral-800 font-mono"
      />

      {/* Payments List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-xs text-neutral-500">
            No payment submissions currently found under this filter.
          </div>
        ) : (
          filtered.map((pay) => {
            const isPending = pay.status === 'Pending';
            return (
              <div
                key={pay.id}
                className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-neutral-900">{pay.resident_name}</span>
                      <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {pay.household_number}
                      </span>
                      {!canReview && <span className="text-xs text-neutral-600 font-semibold">{pay.purok_name}</span>}
                      <span className="text-xs text-neutral-500">
                        Week of {formatDate(pay.period_start)} – {formatDate(pay.period_end)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono font-bold text-emerald-900 text-base">
                        {peso(pay.amount)}
                      </span>
                      <span className="text-neutral-400">·</span>
                      <span className="font-semibold text-neutral-700">{pay.payment_method}</span>
                      <span className="text-neutral-400">·</span>
                      {pay.reference_number !== pay.payment_code && (
                        <>
                          <span className="font-mono text-neutral-600">Ref: {pay.reference_number}</span>
                          <span className="text-neutral-400">·</span>
                        </>
                      )}
                      <span className="font-mono font-bold text-emerald-800">{pay.payment_code}</span>
                    </div>
                    {pay.source && pay.source !== 'resident' && (
                      <p className="text-[11px] font-semibold text-orange-700">
                        📷 Recorded by QR scan — {pay.recorded_by_name}{pay.source === 'collector_scan' ? ' (collector). Confirm the cash was turned over to you.' : ''}
                      </p>
                    )}

                    <p className="text-[11px] text-neutral-400">
                      Submitted {formatDateTime(pay.created_at)}
                      {pay.reviewed_at && ` · ${pay.status.toLowerCase()} by ${pay.reviewer_name || 'Purok Leader'} on ${formatDateTime(pay.reviewed_at)}`}
                    </p>

                    {pay.proof_url && (
                      <a href={pay.proof_url} target="_blank" rel="noreferrer" className="inline-block">
                        <img src={pay.proof_url} alt={`Payment proof from ${pay.resident_name}`} className="w-24 h-24 object-cover rounded-lg border border-neutral-200" />
                      </a>
                    )}

                    {pay.rejection_reason && (
                      <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                        <span className="font-semibold">Rejection Note: </span>
                        {pay.rejection_reason}
                      </p>
                    )}
                  </div>

                  {/* Actions / Status */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded border ${
                        pay.status === 'Verified'
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                          : pay.status === 'Rejected'
                          ? 'text-rose-800 bg-rose-50 border-rose-200'
                          : 'text-amber-800 bg-amber-50 border-amber-200'
                      }`}
                    >
                      {pay.status}
                    </span>

                    {isPending && canReview && (
                      <div className="w-full sm:w-auto mt-2 space-y-2">
                        <input
                          type="text"
                          aria-label={`Rejection reason for ${pay.resident_name}`}
                          placeholder="Reason (required when rejecting)"
                          value={rejectionReasons[pay.id] || ''}
                          onChange={(e) =>
                            setRejectionReasons({ ...rejectionReasons, [pay.id]: e.target.value })
                          }
                          className="w-full text-xs p-1.5 border border-neutral-300 rounded bg-neutral-50 text-neutral-900"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDecision(pay.id, 'Rejected')}
                            disabled={busyId === pay.id}
                            className="disabled:opacity-60 flex-1 sm:flex-initial px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 flex items-center justify-center gap-1 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject Reference
                          </button>
                          <button
                            onClick={() => handleDecision(pay.id, 'Verified')}
                            disabled={busyId === pay.id}
                            className="disabled:opacity-60 flex-1 sm:flex-initial px-4 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Verify {peso(pay.amount)} Paid
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
