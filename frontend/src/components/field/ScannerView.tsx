/**
 * Field QR scanner.
 *  - Collector: scan a household card → "Garbage collected" (during an In Progress run) and/or "Cash received".
 *  - Purok Leader: scan a household card in their purok → record cash received (verified right away).
 * The Admin and the Purok Leader are notified by the server on every scan.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, Home, KeyRound, Loader2, MapPin, ScanLine, Search, Trash2, X } from 'lucide-react';
import { QrScanner } from '../qr/QrScanner';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { ScanLookup, ScanRecord } from '../../types';
import { formatDate, formatDateTime, localDateStr, peso } from '../../utils/format';
import { currentPosition } from '../../utils/geo';

export const ScannerView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isCollector = user?.role === 'collector';
  const [code, setCode] = useState('');
  const [manual, setManual] = useState('');
  const [lookup, setLookup] = useState<ScanLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'lookup' | 'disposal' | 'payment' | null>(null);
  const [bags, setBags] = useState('1');
  const [scheduleId, setScheduleId] = useState('');
  const [recent, setRecent] = useState<ScanRecord[]>([]);
  const [lastDone, setLastDone] = useState<string | null>(null);

  const loadRecent = useCallback(() => {
    api.getRecentScans({ date: localDateStr() }).then(setRecent).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const doLookup = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value || busy) return;
      setBusy('lookup');
      setLookupError(null);
      setLastDone(null);
      try {
        const res = await api.scanLookup(value);
        setCode(value);
        setLookup(res);
        const run = res.schedules.find((s) => s.status === 'In Progress' && !s.already_scanned) || res.schedules.find((s) => s.status === 'In Progress');
        setScheduleId(run?.id || '');
        setBags(String(res.resident_disposal_log?.bag_count || 1));
      } catch (err: any) {
        setLookup(null);
        setLookupError(err.message || 'Unknown QR code.');
        navigator.vibrate?.([60, 60, 60]);
      } finally {
        setBusy(null);
      }
    },
    [busy]
  );

  const reset = () => {
    setLookup(null);
    setCode('');
    setLookupError(null);
  };

  const recordDisposal = async () => {
    if (!lookup || !scheduleId) return;
    setBusy('disposal');
    try {
      const pos = await currentPosition();
      const res = await api.scanDisposal({ code, schedule_id: scheduleId, bag_count: Number(bags) || 1, ...pos });
      showToast({ type: 'success', title: 'Garbage collected ✔', message: `${lookup.household.household_number} recorded. Admin and leader notified.` });
      setLastDone(res.message);
      reset();
      loadRecent();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Not recorded', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const recordPayment = async () => {
    if (!lookup) return;
    if (!confirm(`Confirm you received ${peso(lookup.fee)} cash from ${lookup.household.head_name} (${lookup.household.household_number}) for the week of ${formatDate(lookup.week_start)}?`)) return;
    setBusy('payment');
    try {
      const pos = await currentPosition();
      const res = await api.scanPayment({ code, ...pos });
      showToast({
        type: 'success',
        title: res.status === 'Verified' ? 'Cash payment verified ✔' : 'Cash payment recorded ✔',
        message: `${res.payment_code}${res.status === 'Pending' ? ' — waiting for the Purok Leader to verify.' : ''}`
      });
      setLastDone(res.message);
      reset();
      loadRecent();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Payment not recorded', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const inProgress = lookup?.schedules.filter((s) => s.status === 'In Progress') || [];
  const paid = lookup?.this_week_payment;

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
          <ScanLine className="w-4 h-4 text-emerald-700" />
          <span>{isCollector ? 'Field Collection Scanner' : 'Purok Cash Collection Scanner'}</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">Scan Household QR</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {isCollector
            ? 'Scan each household card while the route is In Progress to mark that their garbage was picked up, or to record a cash contribution.'
            : 'Scan a household card in your purok when a resident hands you their weekly contribution in cash. It is verified right away.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs space-y-3">
          <QrScanner onResult={doLookup} paused={!!busy || !!lookup} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doLookup(manual);
            }}
            className="flex gap-2 text-xs"
          >
            <div className="relative flex-1">
              <KeyRound className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value.toUpperCase())}
                placeholder="No camera? Type household no. e.g. HH-MAN-001"
                aria-label="Household number"
                className="w-full rounded-lg border border-neutral-300 bg-neutral-50 py-2 pl-8 pr-2 font-mono text-neutral-900 focus:bg-white"
              />
            </div>
            <button type="submit" disabled={!manual.trim() || !!busy} className="inline-flex items-center gap-1 rounded-lg bg-neutral-800 px-3 font-semibold text-white disabled:opacity-60">
              <Search className="h-3.5 w-3.5" /> Find
            </button>
          </form>
        </div>

        <div className="space-y-4">
          {busy === 'lookup' && (
            <div className="bg-white p-6 border border-neutral-200 rounded-xl text-center text-xs text-neutral-500">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" /> Checking household…
            </div>
          )}

          {lookupError && (
            <div role="alert" className="bg-rose-50 p-4 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-bold">Cannot use this QR</p>
                <p>{lookupError}</p>
              </div>
              <button type="button" onClick={() => setLookupError(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          )}

          {lastDone && !lookup && (
            <div className="bg-emerald-50 p-4 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p>{lastDone} <span className="font-semibold">Ready for the next household.</span></p>
            </div>
          )}

          {lookup && (
            <div className="bg-white border-2 border-emerald-600 rounded-xl shadow-xs overflow-hidden">
              <div className="flex items-start justify-between gap-3 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white"><Home className="h-5 w-5" /></span>
                  <div>
                    <p className="font-mono text-sm font-bold text-emerald-900">{lookup.household.household_number}</p>
                    <p className="text-sm font-bold text-neutral-900">{lookup.household.head_name}</p>
                    <p className="text-[11px] text-neutral-600">{lookup.household.purok_name} · {lookup.household.address_details}</p>
                    <p className="text-[11px] text-neutral-500">{lookup.household.family_member_count} member(s) · {lookup.household.contact_number || 'no contact'}</p>
                  </div>
                </div>
                <button type="button" onClick={reset} className="rounded-lg p-1 text-neutral-500 hover:bg-white" aria-label="Scan another">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-px bg-neutral-200 text-xs">
                <div className="bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase text-neutral-400">This week's fee</p>
                  {paid ? (
                    <p className={`font-bold ${paid.status === 'Verified' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {paid.status} · {paid.payment_method}
                    </p>
                  ) : (
                    <p className="font-bold text-rose-700">Unpaid ({peso(lookup.fee)})</p>
                  )}
                </div>
                <div className="bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase text-neutral-400">Unpaid (last 4 weeks)</p>
                  <p className={`font-bold ${lookup.unpaid_weeks_last_4 ? 'text-rose-700' : 'text-emerald-700'}`}>{lookup.unpaid_weeks_last_4} week(s)</p>
                </div>
              </div>

              <div className="p-4 space-y-4 text-xs">
                {isCollector && (
                  <div className="space-y-2">
                    <p className="font-bold text-neutral-900">Garbage pick-up</p>
                    {inProgress.length === 0 ? (
                      <p className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-800">
                        Start today's {lookup.household.purok_name} route first (Today's Route &amp; Tasks), then scan again.
                      </p>
                    ) : (
                      <>
                        {inProgress.length > 1 && (
                          <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} aria-label="Collection run" className="w-full rounded-lg border border-neutral-300 p-2">
                            {inProgress.map((s) => (
                              <option key={s.id} value={s.id}>{s.time_slot} · {s.waste_type}{s.already_scanned ? ' (already scanned)' : ''}</option>
                            ))}
                          </select>
                        )}
                        {inProgress.find((s) => s.id === scheduleId)?.already_scanned ? (
                          <p className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 p-2 font-semibold text-emerald-800">
                            <CheckCircle2 className="h-4 w-4" /> Already collected on this run.
                          </p>
                        ) : (
                          <div className="flex items-end gap-2">
                            <label className="flex-1">
                              <span className="block font-semibold text-neutral-700 mb-1">Bags collected</span>
                              <input type="number" min={1} max={50} value={bags} onChange={(e) => setBags(e.target.value)} className="w-full rounded-lg border border-neutral-300 p-2 font-mono" />
                            </label>
                            <button
                              type="button"
                              onClick={recordDisposal}
                              disabled={!!busy}
                              className="inline-flex flex-[2] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2.5 font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" /> {busy === 'disposal' ? 'Saving…' : 'Mark garbage collected'}
                            </button>
                          </div>
                        )}
                        {lookup.resident_disposal_log && (
                          <p className="text-[11px] text-neutral-500">Resident also logged {lookup.resident_disposal_log.bag_count} bag(s) ({lookup.resident_disposal_log.verification_status}).</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-2 border-t border-neutral-100 pt-3">
                  <p className="font-bold text-neutral-900">Cash contribution</p>
                  {paid ? (
                    <p className="rounded-lg bg-neutral-50 border border-neutral-200 p-2 text-neutral-600">
                      This week ({formatDate(lookup.week_start)}) is already {paid.status.toLowerCase()} — {paid.payment_code}.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={recordPayment}
                      disabled={!!busy}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2.5 font-bold text-white hover:bg-amber-700 disabled:opacity-60"
                    >
                      <Banknote className="h-4 w-4" />
                      {busy === 'payment' ? 'Saving…' : `Received ${peso(lookup.fee)} cash for this week`}
                    </button>
                  )}
                  <p className="text-[10px] text-neutral-400">
                    {isCollector ? 'Cash given to a collector stays Pending until the Purok Leader confirms it was turned over.' : 'Recorded as verified by you.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
            <div className="p-3 border-b border-neutral-200 bg-neutral-50 text-xs font-bold uppercase text-neutral-800">
              Today's scans ({recent.length})
            </div>
            <ul className="divide-y divide-neutral-100 max-h-80 overflow-y-auto text-xs">
              {recent.length === 0 && <li className="p-4 text-center text-neutral-400">No scans yet today.</li>}
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                  <div>
                    <p className="font-semibold text-neutral-900">
                      <span className="font-mono">{r.household_number}</span> · {r.head_name}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {r.scan_type === 'Disposal' ? `🗑 ${r.bag_count} bag(s) collected` : `💵 ${peso(r.amount || 0)} cash · ${r.payment_code} (${r.payment_status})`} · {formatDateTime(r.created_at)}
                      {!isCollector && ` · ${r.scanned_by_name}`}
                    </p>
                  </div>
                  {r.latitude != null && <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Has GPS location" />}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
