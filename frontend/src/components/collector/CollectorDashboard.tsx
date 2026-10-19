/**
 * Collector Dashboard - Barangay Bang-Bang
 * Role 2: Garbage Collector
 */

import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle2, Clock, CalendarDays, ArrowRight, Play, Check } from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { CollectionSchedule } from '../../types';
import { api } from '../../services/api';
import { localDateStr } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onNavigate: (tab: string) => void;
}

export const CollectorDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const data = await api.getSchedules();
      setSchedules(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const todayStr = localDateStr();
  const myAssigned = schedules.filter((s) => s.collector_id === user?.id || !user?.id);
  const todayTasks = myAssigned.filter((s) => s.scheduled_date === todayStr);
  const inProgress = myAssigned.filter((s) => s.status === 'In Progress');
  const completed = myAssigned.filter((s) => s.status === 'Completed');
  const pending = myAssigned.filter((s) => s.status === 'Scheduled');

  return (
    <div className="space-y-6">
      {/* Welcome Hero */}
      <div className="bg-gradient-to-r from-amber-950 via-amber-900 to-amber-800 text-white rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-200 uppercase tracking-widest mb-2">
          <span>Barangay Bang-Bang Waste Management Unit</span>
          <span aria-hidden="true">·</span>
          <span>Field Collector Console</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">
          Welcome, {user?.full_name || 'Danilo Enoc'}
        </h1>
        <p className="mt-2 text-sm text-amber-100/90 max-w-xl leading-relaxed">
          Monitor your assigned compactor collection routes across Bang-Bang puroks. Update route start times, log collected tonnage (kg), and submit completed disposal runs.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => onNavigate('assigned-tasks')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white text-amber-950 rounded-lg hover:bg-amber-50 transition-colors shadow-xs"
          >
            <Truck className="w-4 h-4 text-amber-900" />
            Manage Active Collections ({inProgress.length + pending.length})
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Today's Collections"
          value={todayTasks.length}
          subtext="Scheduled for today"
          icon={CalendarDays}
          variant="amber"
        />
        <StatCard
          label="In Progress Now"
          value={inProgress.length}
          subtext="Active collection route"
          icon={Truck}
          variant="sky"
        />
        <StatCard
          label="Completed Runs"
          value={completed.length}
          subtext="Logged in historical database"
          icon={CheckCircle2}
          variant="emerald"
        />
        <StatCard
          label="Pending Next"
          value={pending.length}
          subtext="Upcoming assigned routes"
          icon={Clock}
          variant="slate"
        />
      </div>

      {/* Today's Tasks Priority Card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
              Assigned Collection Routes
            </h2>
            <p className="text-xs text-neutral-500">Assigned to you by the Barangay Admin</p>
          </div>
          <button
            onClick={() => onNavigate('assigned-tasks')}
            className="text-xs text-amber-900 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
          >
            View interactive panel
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {myAssigned.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No collection routes currently assigned to you.
            </div>
          ) : (
            myAssigned.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="p-4 border border-neutral-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-neutral-300 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-neutral-900">{s.purok_name}</span>
                    <span className="text-xs text-neutral-400 font-mono">·</span>
                    <span className="text-xs font-mono font-medium text-neutral-600">{s.scheduled_date}</span>
                    <span className="text-xs text-neutral-400 font-mono">·</span>
                    <span className="text-xs font-mono text-neutral-500">{s.time_slot}</span>
                  </div>
                  <p className="text-xs text-neutral-600">
                    <span className="font-semibold text-neutral-800">{s.waste_type} Waste</span>
                    {s.notes && ` — ${s.notes}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                      s.status === 'In Progress'
                        ? 'text-sky-800 bg-sky-50 border-sky-200 animate-pulse'
                        : s.status === 'Completed'
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                        : 'text-amber-800 bg-amber-50 border-amber-200'
                    }`}
                  >
                    {s.status}
                  </span>

                  <button
                    onClick={() => onNavigate('assigned-tasks')}
                    className="px-3 py-1.5 text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-colors whitespace-nowrap"
                  >
                    Action
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
