/**
 * Collector field panel: start a route, record collected volume, and mark it completed.
 * The server only returns schedules assigned to the signed-in collector and enforces the
 * Scheduled → In Progress → Completed order.
 */

import React, { useState, useEffect } from 'react';
import { Truck, Play, CheckCircle2, CalendarClock, RefreshCw, ScanLine } from 'lucide-react';
import { CollectionSchedule } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime, localDateStr } from '../../utils/format';

interface Draft {
  truck: string;
  volume: string;
  notes: string;
}

export const CollectorTasks: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const loadSchedules = async () => {
    try {
      const data = await api.getSchedules();
      setSchedules(data);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const s of data) {
          if (!next[s.id]) {
            next[s.id] = {
              truck: s.execution_record?.truck_number || 'LGU-BangBang-01',
              volume: s.execution_record?.collected_volume_kg ? String(s.execution_record.collected_volume_kg) : '',
              notes: ''
            };
          }
        }
        return next;
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load routes', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const draft = (id: string): Draft => drafts[id] || { truck: 'LGU-BangBang-01', volume: '', notes: '' };
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...draft(id), ...patch } }));

  const act = async (s: CollectionSchedule, fn: () => Promise<unknown>, title: string, message: string) => {
    setBusyId(s.id);
    try {
      await fn();
      window.dispatchEvent(new Event('bb:routes-changed')); // start/stop live GPS sharing
      showToast({ type: 'success', title, message });
      await loadSchedules();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Action failed', message: err.message || 'Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleStart = (s: CollectionSchedule) =>
    act(
      s,
      () => api.startCollection({ schedule_id: s.id, truck_number: draft(s.id).truck.trim(), notes: draft(s.id).notes.trim() || undefined }),
      'Route started',
      `Residents of ${s.purok_name} were notified that the truck is on the way.`
    );

  const handleUpdate = (s: CollectionSchedule) => {
    const d = draft(s.id);
    if (d.volume === '' || Number(d.volume) < 0) {
      showToast({ type: 'error', title: 'Enter the volume', message: 'Type the collected volume in kilograms.' });
      return;
    }
    act(
      s,
      () => api.updateCollectionProgress({ schedule_id: s.id, collected_volume_kg: Number(d.volume), collector_notes: d.notes.trim() || undefined }),
      'Progress saved',
      `${d.volume} kg recorded so far.`
    );
  };

  const handleComplete = (s: CollectionSchedule) => {
    const d = draft(s.id);
    if (d.volume === '' || Number.isNaN(Number(d.volume)) || Number(d.volume) < 0) {
      showToast({ type: 'error', title: 'Enter the final volume', message: 'Type the total collected volume (kg) before completing.' });
      return;
    }
    if (!confirm(`Mark the ${s.purok_name} collection as COMPLETED with ${d.volume} kg? This cannot be undone.`)) return;
    act(
      s,
      () => api.completeCollection({ schedule_id: s.id, collected_volume_kg: Number(d.volume), collector_notes: d.notes.trim() || undefined }),
      'Collection completed',
      `${s.purok_name} marked completed. The admin and purok leader were notified.`
    );
  };

  const today = localDateStr();
  const active = schedules.filter((s) => s.status === 'In Progress' || (s.status === 'Scheduled' && s.scheduled_date <= today));
  const upcoming = schedules
    .filter((s) => s.status === 'Scheduled' && s.scheduled_date > today)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
            <Truck className="w-4 h-4 text-amber-700" />
            <span>Garbage Collector Action Panel</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">Today's Route & Tasks</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Start your assigned routes, record the truck and collected volume, then mark them completed.</p>
        </div>
        <button onClick={loadSchedules} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-100 self-start sm:self-auto">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-900">Due Now ({active.length})</h2>

        {loading ? (
          <div className="py-10 text-center text-xs text-neutral-400">Loading routes…</div>
        ) : active.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-xs text-neutral-500">
            No collection is due right now. Upcoming routes are listed below.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {active.map((s) => {
              const isInProgress = s.status === 'In Progress';
              const d = draft(s.id);
              const busy = busyId === s.id;
              const overdue = !isInProgress && s.scheduled_date < today;
              return (
                <div
                  key={s.id}
                  className={`bg-white rounded-xl p-5 border shadow-xs flex flex-col justify-between ${isInProgress ? 'border-sky-300 ring-2 ring-sky-100' : 'border-neutral-200'}`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${isInProgress ? 'bg-sky-100 text-sky-800' : overdue ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                        {overdue ? 'Overdue' : s.status}
                      </span>
                      <span className="text-xs font-mono text-neutral-500">{formatDate(s.scheduled_date)}</span>
                    </div>
                    <h3 className="text-base font-bold text-neutral-900 mt-2">{s.purok_name}</h3>
                    <p className="text-xs text-neutral-600 mt-0.5 font-mono">{s.time_slot}</p>

                    <div className="mt-3 p-3 bg-neutral-50 rounded-lg text-xs space-y-1.5 border border-neutral-100">
                      <div className="flex justify-between gap-3">
                        <span className="text-neutral-500">Waste Type:</span>
                        <span className="font-semibold text-neutral-900">{s.waste_type}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-neutral-500 shrink-0">Admin Notes:</span>
                        <span className="text-neutral-700 text-right">{s.notes || 'Routine route'}</span>
                      </div>
                      {isInProgress && s.execution_record && (
                        <>
                          <div className="flex justify-between text-sky-800">
                            <span>Started:</span>
                            <span className="font-mono">{formatDateTime(s.execution_record.started_at)}</span>
                          </div>
                          <div className="flex justify-between text-sky-800">
                            <span>Recorded so far:</span>
                            <span className="font-mono font-bold">{s.execution_record.collected_volume_kg} kg</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
                    {!isInProgress ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label htmlFor={`truck-${s.id}`} className="block text-[11px] text-neutral-500 mb-0.5">Truck No.</label>
                            <input id={`truck-${s.id}`} type="text" value={d.truck} onChange={(e) => setDraft(s.id, { truck: e.target.value })} className="w-full p-1.5 border border-neutral-300 rounded text-xs bg-neutral-50 font-mono text-neutral-900" />
                          </div>
                          <div>
                            <label htmlFor={`rem-${s.id}`} className="block text-[11px] text-neutral-500 mb-0.5">Route Remarks</label>
                            <input id={`rem-${s.id}`} type="text" placeholder="e.g. Seaside entry clear" value={d.notes} onChange={(e) => setDraft(s.id, { notes: e.target.value })} className="w-full p-1.5 border border-neutral-300 rounded text-xs bg-neutral-50 text-neutral-900" />
                          </div>
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => handleStart(s)}
                          className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          {busy ? 'Starting…' : 'Start Collection Route'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label htmlFor={`vol-${s.id}`} className="block text-[11px] text-neutral-600 font-semibold mb-0.5">Collected (kg)</label>
                            <input id={`vol-${s.id}`} type="number" min="0" step="0.5" inputMode="decimal" value={d.volume} onChange={(e) => setDraft(s.id, { volume: e.target.value })} className="w-full p-1.5 border border-neutral-300 rounded text-xs bg-neutral-50 font-mono font-bold text-neutral-900" />
                          </div>
                          <div>
                            <label htmlFor={`notes-${s.id}`} className="block text-[11px] text-neutral-600 font-semibold mb-0.5">Collector Notes</label>
                            <input id={`notes-${s.id}`} type="text" placeholder="e.g. All bins collected" value={d.notes} onChange={(e) => setDraft(s.id, { notes: e.target.value })} className="w-full p-1.5 border border-neutral-300 rounded text-xs bg-neutral-50 text-neutral-900" />
                          </div>
                        </div>
                        {onNavigate && (
                          <button
                            type="button"
                            onClick={() => onNavigate('scanner')}
                            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <ScanLine className="w-4 h-4" />
                            Scan household QR cards
                          </button>
                        )}
                        <div className="flex gap-2">
                          <button disabled={busy} onClick={() => handleUpdate(s)} className="flex-1 py-1.5 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-60 text-neutral-800 rounded-lg text-xs font-medium border border-neutral-300 transition-colors">
                            Save Progress
                          </button>
                          <button disabled={busy} onClick={() => handleComplete(s)} className="flex-1 py-1.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark Completed
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-900">Upcoming ({upcoming.length})</h2>
        <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100 shadow-xs">
          {upcoming.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-400">No upcoming routes assigned.</div>
          ) : (
            upcoming.map((s) => (
              <div key={s.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-neutral-900">{s.purok_name}</span>
                    <span className="block text-neutral-500">{s.waste_type} · {s.time_slot}</span>
                  </div>
                </div>
                <span className="font-mono text-neutral-700 whitespace-nowrap">{formatDate(s.scheduled_date)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
