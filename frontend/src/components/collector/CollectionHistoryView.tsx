/**
 * Collector: history of the collector's own completed collections with totals.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { History, Scale, CheckCircle2, Truck } from 'lucide-react';
import { CollectionSchedule } from '../../types';
import { api } from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/format';

export const CollectionHistoryView: React.FC = () => {
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [purokFilter, setPurokFilter] = useState('');

  useEffect(() => {
    api
      .getSchedules({ status: 'Completed' })
      .then(setSchedules)
      .finally(() => setLoading(false));
  }, []);

  const puroks = useMemo(() => Array.from(new Set(schedules.map((s) => s.purok_name))).sort(), [schedules]);
  const visible = schedules.filter((s) => !purokFilter || s.purok_name === purokFilter);
  const totalKg = visible.reduce((sum, s) => sum + Number(s.execution_record?.collected_volume_kg || 0), 0);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
          <History className="w-4 h-4 text-amber-700" />
          <span>Field Operations Log</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">My Collection History</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Every route you completed, with the recorded truck, times and collected volume.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">Completed routes</span>
          <div className="text-2xl font-bold text-neutral-900 font-mono mt-1 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" />{visible.length}</div>
        </div>
        <div className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">Total collected</span>
          <div className="text-2xl font-bold text-neutral-900 font-mono mt-1 flex items-center gap-2"><Scale className="w-5 h-5 text-amber-600" />{totalKg.toLocaleString('en-PH', { maximumFractionDigits: 1 })} kg</div>
        </div>
        <div className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">Average per route</span>
          <div className="text-2xl font-bold text-neutral-900 font-mono mt-1 flex items-center gap-2"><Truck className="w-5 h-5 text-sky-600" />{visible.length ? (totalKg / visible.length).toFixed(1) : '0'} kg</div>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 bg-white border border-neutral-200 rounded-xl">
        <label htmlFor="hist-purok" className="text-xs text-neutral-500 font-medium">Purok:</label>
        <select id="hist-purok" value={purokFilter} onChange={(e) => setPurokFilter(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-neutral-50 text-neutral-800">
          <option value="">All</option>
          {puroks.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-500 uppercase font-semibold text-[10px]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Purok</th>
                <th className="py-3 px-4">Waste Type</th>
                <th className="py-3 px-4">Truck</th>
                <th className="py-3 px-4">Started / Completed</th>
                <th className="py-3 px-4 text-right">Volume</th>
                <th className="py-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-neutral-400">Loading…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-neutral-400">No completed collections yet.</td></tr>
              ) : (
                visible.map((s) => (
                  <tr key={s.id} className="hover:bg-neutral-50/70">
                    <td className="py-3 px-4 font-semibold text-neutral-900 whitespace-nowrap">{formatDate(s.scheduled_date)}<span className="block text-[10px] text-neutral-400 font-mono">{s.time_slot}</span></td>
                    <td className="py-3 px-4 text-neutral-800 whitespace-nowrap">{s.purok_name}</td>
                    <td className="py-3 px-4 text-neutral-700">{s.waste_type}</td>
                    <td className="py-3 px-4 font-mono text-neutral-600">{s.execution_record?.truck_number || '—'}</td>
                    <td className="py-3 px-4 text-neutral-600 whitespace-nowrap">
                      {formatDateTime(s.execution_record?.started_at)}
                      <span className="block">{formatDateTime(s.execution_record?.completed_at)}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-neutral-900 whitespace-nowrap">{Number(s.execution_record?.collected_volume_kg || 0)} kg</td>
                    <td className="py-3 px-4 text-neutral-500 max-w-xs">{s.execution_record?.collector_notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
