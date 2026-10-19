/**
 * Real-Time Waste Collection Monitoring - Barangay Bang-Bang
 * Monitor truck routes, volume in kg collected, and completion timestamps
 */

import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle2, Clock, Scale, MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import { CollectionSchedule, DisposalSubmission } from '../../types';
import { api } from '../../services/api';
import { formatDate } from '../../utils/format';

export const MonitoringView: React.FC = () => {
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [submissions, setSubmissions] = useState<DisposalSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [sData, subData] = await Promise.all([
        api.getSchedules(),
        api.getDisposalSubmissions()
      ]);
      setSchedules(sData);
      setSubmissions(subData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const inProgress = schedules.filter((s) => s.status === 'In Progress');
  const completedToday = schedules.filter((s) => s.status === 'Completed');
  const upcoming = schedules.filter((s) => s.status === 'Scheduled');

  const totalKgToday = completedToday.reduce((sum, s) => {
    return sum + (s.execution_record?.collected_volume_kg || 0);
  }, 0) + inProgress.reduce((sum, s) => sum + (s.execution_record?.collected_volume_kg || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <Truck className="w-4 h-4 text-emerald-700" />
            <span>Operational Dispatch & Fleet Activity</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">
            Collection Fleet & Route Monitoring
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Active garbage compactor trucks and waste tonnages recorded for Barangay Bang-Bang.
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {/* Fleet Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wider font-medium">
            <span>Active Routes Right Now</span>
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
          </div>
          <div className="mt-2 text-2xl font-bold text-neutral-900 font-mono tabular-nums">
            {inProgress.length}
          </div>
          <p className="text-xs text-neutral-500 mt-1">Trucks rolling in Bang-Bang puroks</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wider font-medium">
            <span>Total Volume Collected</span>
            <Scale className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-neutral-900 font-mono tabular-nums">
            {totalKgToday.toFixed(1)} kg
          </div>
          <p className="text-xs text-neutral-500 mt-1">Dispatched to Cordova MRF Facility</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wider font-medium">
            <span>Resident Disposals Logged</span>
            <CheckCircle2 className="w-4 h-4 text-teal-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-neutral-900 font-mono tabular-nums">
            {submissions.length}
          </div>
          <p className="text-xs text-neutral-500 mt-1">Verified against truck routes</p>
        </div>
      </div>

      {/* Active Trucks Section */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-900">
          Live Route Statuses
        </h2>

        {inProgress.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-8 text-center text-xs text-neutral-500">
            No collection truck routes currently in progress. Check upcoming scheduled routes below.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inProgress.map((s) => (
              <div
                key={s.id}
                className="bg-white border-2 border-sky-300 rounded-xl p-5 shadow-xs relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-sky-800 uppercase tracking-wider bg-sky-100 px-2 py-0.5 rounded">
                      IN ROUTE · {s.time_slot}
                    </span>
                    <h3 className="text-base font-bold text-neutral-900 mt-2">{s.purok_name}</h3>
                    <p className="text-xs text-neutral-500">{s.waste_type} Waste Stream</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-sky-50 text-sky-700">
                    <Truck className="w-6 h-6 animate-bounce" />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-100 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Collector Crew:</span>
                    <span className="font-semibold text-neutral-900">{s.collector_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Compactor Truck:</span>
                    <span className="font-mono text-neutral-800">
                      {s.execution_record?.truck_number || 'LGU-BangBang-Compactor-01'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Current Load:</span>
                    <span className="font-mono font-bold text-emerald-800 tabular-nums">
                      {s.execution_record?.collected_volume_kg || 0} kg
                    </span>
                  </div>
                  {s.execution_record?.collector_notes && (
                    <div className="p-2 bg-neutral-50 rounded text-neutral-600 italic">
                      "{s.execution_record.collector_notes}"
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed & Scheduled History Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/70">
          <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
            All Route Performance Logs
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500 uppercase font-semibold text-[10px]">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Purok Area</th>
                <th className="py-2.5 px-4">Collector</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Started</th>
                <th className="py-2.5 px-4">Completed</th>
                <th className="py-2.5 px-4 text-right">Volume (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50">
                  <td className="py-3 px-4 font-semibold text-neutral-900 whitespace-nowrap">{formatDate(s.scheduled_date)}</td>
                  <td className="py-3 px-4 text-neutral-800">{s.purok_name}</td>
                  <td className="py-3 px-4 text-neutral-600">{s.collector_name}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 text-[10px] rounded font-semibold border border-neutral-200">
                      {s.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-500">
                    {s.execution_record?.started_at
                      ? new Date(s.execution_record.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-500">
                    {s.execution_record?.completed_at
                      ? new Date(s.execution_record.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-emerald-900 font-bold tabular-nums">
                    {s.execution_record?.collected_volume_kg ? `${s.execution_record.collected_volume_kg} kg` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
