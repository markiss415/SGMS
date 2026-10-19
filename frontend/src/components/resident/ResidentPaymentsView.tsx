/**
 * Resident Weekly Contributions
 * The fee comes from Barangay Settings (default ₱5.00) and is applied by the server.
 * Payments stay "Pending" until the resident's Purok Leader verifies them — never auto-verified.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Plus, CheckCircle2, Clock, XCircle, Copy, Check, ImagePlus, Trash2, QrCode as QrIcon, Smartphone, Wallet, Building2, Truck, ArrowLeft, Download, X } from 'lucide-react';
import { Household, PaymentChannels, PaymentSubmission } from '../../types';
import { QrCode, downloadDataUrl } from '../qr/QrCode';
import { HouseholdQrCard } from '../qr/HouseholdQrCard';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { addDaysStr, formatDate, formatDateTime, peso, readImageFile, weekStartStr } from '../../utils/format';

type Method = 'GCash' | 'Maya' | 'Cash to Collector' | 'Cash to Leader' | 'Barangay Hall';

const METHODS: { id: Method; title: string; sub: string; icon: React.ElementType; tone: string }[] = [
  { id: 'GCash', title: 'GCash', sub: 'Scan the barangay QR', icon: Smartphone, tone: 'text-sky-700 bg-sky-50 ring-sky-200' },
  { id: 'Maya', title: 'Maya', sub: 'Scan the barangay QR', icon: Wallet, tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  { id: 'Cash to Collector', title: 'Cash to Collector', sub: 'Collector scans your QR', icon: Truck, tone: 'text-orange-700 bg-orange-50 ring-orange-200' },
  { id: 'Cash to Leader', title: 'Cash to Purok Leader', sub: 'Leader verifies', icon: Receipt, tone: 'text-violet-700 bg-violet-50 ring-violet-200' },
  { id: 'Barangay Hall', title: 'Barangay Hall', sub: 'Pay at the office', icon: Building2, tone: 'text-neutral-700 bg-neutral-50 ring-neutral-200' }
];

const statusStyles: Record<string, { cls: string; icon: React.ElementType }> = {
  Verified: { cls: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  Pending: { cls: 'text-amber-800 bg-amber-50 border-amber-200', icon: Clock },
  Rejected: { cls: 'text-rose-800 bg-rose-50 border-rose-200', icon: XCircle }
};

export const ResidentPaymentsView: React.FC = () => {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<PaymentChannels | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [receipt, setReceipt] = useState<PaymentSubmission | null>(null);
  const [qrPng, setQrPng] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [week, setWeek] = useState(weekStartStr());
  const [paymentMethod, setPaymentMethod] = useState<Method>('GCash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proof, setProof] = useState('');

  const fee = Number(channels?.fee ?? settings.weekly_contribution_fee ?? 5);

  const loadData = async () => {
    try {
      const [pData, sData, cData, hData] = await Promise.all([
        api.getPayments(),
        api.getSettings(),
        api.getPaymentChannels().catch(() => null),
        api.getHouseholds().catch(() => [] as Household[])
      ]);
      setPayments(pData);
      setSettings(sData);
      setChannels(cData);
      setHousehold(hData[0] ?? null);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load payments', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  /** Weeks a resident can pay for: 8 weeks back to 4 weeks ahead, with the status of any existing payment. */
  const weeks = useMemo(() => {
    const current = weekStartStr();
    const live = new Map(payments.filter((p) => p.status !== 'Rejected').map((p) => [p.period_start, p.status]));
    return Array.from({ length: 13 }, (_, i) => addDaysStr(current, (i - 8) * 7))
      .reverse()
      .map((start) => ({ start, end: addDaysStr(start, 6), status: live.get(start) as string | undefined, isCurrent: start === current }));
  }, [payments]);

  const unpaidRecent = weeks.filter((w) => !w.status && w.start <= weekStartStr()).length;

  const openModal = () => {
    const firstUnpaid = weeks.find((w) => !w.status && w.start <= weekStartStr());
    setWeek(firstUnpaid?.start || weekStartStr());
    setReferenceNumber('');
    setProof('');
    setPaymentMethod('GCash');
    setStep(1);
    setIsModalOpen(true);
  };

  const handleCopyGcash = async () => {
    try {
      await navigator.clipboard.writeText((settings.gcash_treasury_number || '').split(' ')[0]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({ type: 'info', title: 'Copy not available', message: settings.gcash_treasury_number || '' });
    }
  };

  const handleProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setProof(await readImageFile(file));
    } catch (err: any) {
      showToast({ type: 'error', title: 'Image not accepted', message: err.message });
    }
  };

  const needsReference = paymentMethod === 'GCash' || paymentMethod === 'Maya';
  const wallet = paymentMethod === 'GCash' ? channels?.gcash : paymentMethod === 'Maya' ? channels?.maya : undefined;
  const walletNumber = (wallet?.number || '').split(' ')[0];
  /** Fallback QR when the Admin has not uploaded the official one yet (contains the number and exact amount). */
  const fallbackQrText = `${paymentMethod} PAYMENT\nTo: ${wallet?.number || ''}\nAmount: PHP ${fee.toFixed(2)}\nFor: ${household?.household_number || ''} week of ${week}`;
  const refHelp = paymentMethod === 'GCash' ? '13-digit Ref. No. on your GCash receipt' : 'Reference number on your Maya receipt';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const saved = await api.submitPayment({
        period_start: week,
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim(),
        proof_url: proof || undefined
      });
      setIsModalOpen(false);
      setReceipt(saved);
      showToast({ type: 'success', title: 'Payment submitted', message: `Payment code ${saved.payment_code}. Your Purok Leader will verify it.` });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Payment not submitted', message: err.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const verifiedTotal = payments.filter((p) => p.status === 'Verified').reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <Receipt className="w-4 h-4 text-emerald-700" />
            <span>Barangay Waste Fund</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">Weekly Solid Waste Contributions</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Contribution: <strong className="text-emerald-950">{peso(fee)} per week</strong> per household, for truck fuel and purok sweepers.
          </p>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Submit {peso(fee)} Payment
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">Verified contributions</span>
          <div className="text-2xl font-bold font-mono text-emerald-900 mt-1">{peso(verifiedTotal)}</div>
        </div>
        <div className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">Waiting for leader</span>
          <div className="text-2xl font-bold font-mono text-amber-700 mt-1">{payments.filter((p) => p.status === 'Pending').length}</div>
        </div>
        <div className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">Unpaid weeks (last 9)</span>
          <div className={`text-2xl font-bold font-mono mt-1 ${unpaidRecent > 0 ? 'text-rose-700' : 'text-emerald-900'}`}>{unpaidRecent}</div>
        </div>
      </div>

      {/* Official channel */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono font-bold text-emerald-800 uppercase tracking-wider bg-emerald-100 px-2 py-0.5 rounded">Official payment channels</span>
          <h3 className="text-base font-bold text-neutral-900 mt-1">{settings.barangay_name || 'Barangay Bang-Bang'} Waste Fund</h3>
          <p className="text-xs text-neutral-600 mt-0.5 font-mono">GCash: {settings.gcash_treasury_number || '—'}</p>
          {settings.maya_number && <p className="text-xs text-neutral-600 font-mono">Maya: {settings.maya_number}</p>}
          <p className="text-[11px] text-neutral-500 mt-1">Scan the barangay QR in GCash/Maya, or pay cash — the collector or your Purok Leader scans your household QR.</p>
        </div>
        <button
          onClick={handleCopyGcash}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors border border-emerald-300 self-start sm:self-center"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy GCash Number'}
        </button>
      </div>

      {/* History */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/70">
          <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">My Contribution Receipts ({payments.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500 uppercase font-semibold text-[10px]">
                <th className="py-3 px-4">Week Covered</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Payment Code / Ref.</th>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-neutral-400">Loading…</td></tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-neutral-400">
                    No payments yet. Click "Submit {peso(fee)} Payment" after paying.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const st = statusStyles[p.status];
                  const Icon = st.icon;
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50 align-top">
                      <td className="py-3.5 px-4 text-neutral-800 whitespace-nowrap">
                        {formatDate(p.period_start)} – {formatDate(p.period_end)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-900 tabular-nums whitespace-nowrap">{peso(p.amount)}</td>
                      <td className="py-3.5 px-4 text-neutral-700 whitespace-nowrap">{p.payment_method}</td>
                      <td className="py-3.5 px-4 font-mono text-neutral-800 whitespace-nowrap">
                        {p.payment_code && (
                          <button type="button" onClick={() => setReceipt(p)} className="flex items-center gap-1 font-bold text-emerald-800 hover:underline" title="Show QR receipt">
                            <QrIcon className="h-3 w-3" />
                            {p.payment_code}
                          </button>
                        )}
                        {p.reference_number !== p.payment_code && <span className="block text-[11px] text-neutral-500">Ref: {p.reference_number}</span>}
                        {p.recorded_by_name && p.source !== 'resident' && (
                          <span className="block text-[10px] text-neutral-400 font-sans">Scanned by {p.recorded_by_name}</span>
                        )}
                        {p.proof_url && (
                          <a href={p.proof_url} target="_blank" rel="noreferrer" className="block text-[10px] text-emerald-700 hover:underline font-sans">
                            View proof
                          </a>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-500 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold rounded border ${st.cls}`}>
                          <Icon className="w-3 h-3" />
                          {p.status}
                        </span>
                        {p.status === 'Rejected' && p.rejection_reason && (
                          <span className="block mt-1 text-[11px] text-rose-700 max-w-xs">Reason: {p.rejection_reason}. You may submit again for this week.</span>
                        )}
                        {p.status === 'Verified' && p.reviewer_name && (
                          <span className="block mt-1 text-[10px] text-neutral-400">by {p.reviewer_name}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay modal: step 1 = week + method, step 2 = QR / instructions / reference */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Pay Weekly Contribution</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {peso(fee)} for the week of {formatDate(week)} · Step {step} of 2
                </p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close" className="p-1 text-neutral-400 hover:text-neutral-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            {step === 1 && (
              <div className="mt-4 space-y-4 text-xs">
                <div>
                  <label htmlFor="pay-week" className="block text-neutral-700 font-semibold mb-1">Week (Monday – Sunday)</label>
                  <select id="pay-week" value={week} onChange={(e) => setWeek(e.target.value)} className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900">
                    {weeks.map((w) => (
                      <option key={w.start} value={w.start} disabled={!!w.status}>
                        {formatDate(w.start)} – {formatDate(w.end)}
                        {w.isCurrent ? ' (this week)' : ''}
                        {w.status ? ` — ${w.status}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="block text-neutral-700 font-semibold mb-1.5">How will you pay?</span>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
                    {METHODS.map((m) => {
                      const Icon = m.icon;
                      const active = paymentMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setPaymentMethod(m.id)}
                          className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${active ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-200' : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'}`}
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${m.tone}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block font-bold text-neutral-900">{m.title}</span>
                            <span className="block text-[10px] text-neutral-500">{m.sub}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                    Cancel
                  </button>
                  <button type="button" onClick={() => setStep(2)} className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 shadow-xs">
                    Next
                  </button>
                </div>
              </div>
            )}

            {step === 2 && paymentMethod === 'Cash to Collector' && (
              <div className="mt-4 space-y-3 text-xs">
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900 leading-relaxed">
                  Hand <strong>{peso(fee)}</strong> to the garbage collector and let them <strong>scan your household QR</strong> below.
                  The payment is recorded automatically and your Purok Leader verifies it. No form to fill in.
                </div>
                {household?.qr_payload ? (
                  <HouseholdQrCard
                    payload={household.qr_payload}
                    householdNumber={household.household_number}
                    headName={household.head_name}
                    purokName={household.purok_name}
                    address={household.address_details}
                  />
                ) : (
                  <p className="text-neutral-500">Your household QR is not available yet. Please contact your Purok Leader.</p>
                )}
                <div className="flex justify-between gap-2 pt-3 border-t border-neutral-200">
                  <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900">
                    Done
                  </button>
                </div>
              </div>
            )}

            {step === 2 && paymentMethod !== 'Cash to Collector' && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
                {needsReference && (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="shrink-0 text-center">
                        {wallet?.qr_image ? (
                          <img src={wallet.qr_image} alt={`Official ${paymentMethod} QR`} className="h-48 w-48 rounded-lg border border-neutral-200 bg-white object-contain" />
                        ) : (
                          <QrCode value={fallbackQrText} size={180} label={`${paymentMethod} payment details`} onReady={setQrPng} className="border border-neutral-200" />
                        )}
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(wallet?.qr_image || qrPng, `bangbang-${paymentMethod.toLowerCase()}-qr.png`)}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline"
                        >
                          <Download className="h-3 w-3" /> Save QR to phone
                        </button>
                      </div>
                      <ol className="space-y-1.5 text-neutral-700 list-decimal pl-4 leading-relaxed">
                        <li>Open <strong>{paymentMethod}</strong> → <strong>Scan QR</strong> (or <em>Upload QR</em> from your gallery).</li>
                        <li>
                          Pay exactly <strong className="font-mono">{peso(fee)}</strong>. Or send to{' '}
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(walletNumber).then(() => showToast({ type: 'success', title: 'Number copied', message: walletNumber }))}
                            className="font-mono font-bold text-emerald-800 underline decoration-dotted"
                          >
                            {walletNumber || '—'}
                          </button>
                          .
                        </li>
                        <li>Copy the <strong>Ref. No.</strong> and take a screenshot of the receipt.</li>
                        <li>Enter them below. You will get a unique payment code.</li>
                      </ol>
                    </div>
                    {!wallet?.qr_image && (
                      <p className="mt-3 text-[10px] text-amber-700">
                        The official {paymentMethod} QR has not been uploaded by the Barangay yet — this QR only shows the number and amount. Send to the number above.
                      </p>
                    )}
                  </div>
                )}

                {!needsReference && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-violet-900 leading-relaxed">
                    {paymentMethod === 'Cash to Leader'
                      ? 'Give the cash to your Purok Leader. Tip: the leader can also scan your household QR to record it instantly.'
                      : 'Pay at the Barangay Hall cashier and enter the official receipt number if you have one.'}
                  </div>
                )}

                <div>
                  <label htmlFor="pay-ref" className="block text-neutral-700 font-semibold mb-1">
                    {needsReference ? `${paymentMethod} Reference Number` : 'Receipt Number (optional)'}
                  </label>
                  <input
                    id="pay-ref"
                    type="text"
                    inputMode={paymentMethod === 'GCash' ? 'numeric' : 'text'}
                    required={needsReference}
                    maxLength={100}
                    placeholder={paymentMethod === 'GCash' ? 'e.g. 1234 567 890123' : needsReference ? 'e.g. A1B2C3D4E5F6' : 'Leave blank if none'}
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900 font-mono uppercase"
                  />
                  {needsReference && <p className="mt-1 text-[10px] text-neutral-500">{refHelp}. Each reference number can only be used once.</p>}
                </div>

                <div>
                  <span className="block text-neutral-700 font-semibold mb-1">
                    Receipt Screenshot {needsReference ? <span className="text-rose-600">(required)</span> : '(optional)'}
                  </span>
                  {proof ? (
                    <div className="flex items-center gap-3">
                      <img src={proof} alt="Payment proof preview" className="w-16 h-16 object-cover rounded-lg border border-neutral-200" />
                      <button type="button" onClick={() => setProof('')} className="inline-flex items-center gap-1 text-rose-700 hover:underline">
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-neutral-300 rounded-lg text-neutral-500 cursor-pointer hover:bg-neutral-50">
                      <ImagePlus className="w-4 h-4" />
                      <span>Attach image (PNG, JPG, WEBP · max 2 MB)</span>
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleProof} className="sr-only" />
                    </label>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-200">
                  <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || (needsReference && !proof)}
                    className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 disabled:opacity-60 shadow-xs"
                  >
                    {submitting ? 'Submitting…' : 'Submit Payment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* QR receipt */}
      {receipt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4" onClick={() => setReceipt(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-neutral-900">Payment Receipt</h2>
            <p className="text-xs text-neutral-500">{formatDate(receipt.period_start)} – {formatDate(receipt.period_end)} · {receipt.payment_method}</p>
            <div className="my-4 flex justify-center">
              <QrCode value={receipt.payment_code || receipt.id} size={180} label="Payment code QR" />
            </div>
            <p className="font-mono text-lg font-bold tracking-wider text-emerald-900">{receipt.payment_code}</p>
            <p className="font-mono text-2xl font-bold mt-1">{peso(receipt.amount)}</p>
            <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold rounded border ${statusStyles[receipt.status].cls}`}>
              {receipt.status}
            </span>
            <p className="mt-3 text-[11px] text-neutral-500">Show this to your Purok Leader if they ask about your payment.</p>
            <button type="button" onClick={() => setReceipt(null)} className="mt-4 w-full py-2 rounded-lg bg-emerald-800 text-white text-xs font-semibold hover:bg-emerald-900">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
