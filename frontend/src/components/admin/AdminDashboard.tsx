/**
 * Admin Dashboard - Barangay Bang-Bang Smart Garbage Monitoring System
 * For: Punong Barangay (Barangay Captain)
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  Home,
  Truck,
  Calendar,
  CheckCircle2,
  Clock,
  Receipt,
  FileCheck2,
  Plus,
  ArrowRight,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { DashboardStats, CollectionSchedule, ActivityLog } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { heroImage } from '../../assets/images';

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const heroImg = heroImage;

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, schedData, actData] = await Promise.all([
          api.getDashboardStats(),
          api.getSchedules(),
          api.getActivityLogs()
        ]);
        setStats(statsData);
        setSchedules(schedData.slice(0, 5));
        setActivities(actData.slice(0, 6));
      } catch (err) {
        console.error('Failed to load admin stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white p-6 sm:p-8 shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 uppercase tracking-widest mb-2">
            <span>Barangay Bang-Bang · Cordova, Cebu</span>
            <span aria-hidden="true">·</span>
            <span>Executive Command Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">
            Solid Waste Operations & Monitoring
          </h1>
          <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed">
            Welcome, {user?.full_name}. Real-time municipal collection tracking, household segregation compliance, weekly contribution auditing, and purok leadership coordination.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('schedules')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white text-emerald-950 rounded-lg hover:bg-emerald-50 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Create Collection Schedule
            </button>
            <button
              onClick={() => onNavigate('monitoring')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-700/80 hover:bg-emerald-700 text-white rounded-lg transition-colors border border-emerald-600/50"
            >
              <Truck className="w-4 h-4" />
              Live Collector Monitoring
            </button>
          </div>
        </div>

        {/* Backdrop Graphic Scrim */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-20 pointer-events-none hidden md:block">
          <img
            src={heroImg}
            alt="Waste truck"
            className="w-full h-full object-cover mix-blend-luminosity"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Registered Residents"
          value={stats?.counts.residents ?? '—'}
          subtext="Active household citizens"
          icon={Users}
          variant="slate"
        />
        <StatCard
          label="Bang-Bang Households"
          value={stats?.counts.households ?? '—'}
          subtext="Mapped across 7 Puroks"
          icon={Home}
          variant="emerald"
        />
        <StatCard
          label="Active Collections"
          value={stats?.counts.schedules_in_progress ?? 0}
          subtext={`${stats?.counts.schedules_completed ?? 0} routes completed`}
          icon={Truck}
          variant="sky"
        />
        <StatCard
          label="Weekly Waste Fund"
          value={`₱${(stats?.counts.total_funds_collected ?? 0).toFixed(2)}`}
          subtext="Verified weekly contributions"
          icon={Receipt}
          variant="amber"
        />
      </div>

      {/* Secondary Operational Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 border border-neutral-200 rounded-xl">
        <div className="p-3 bg-neutral-50 rounded-lg">
          <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Garbage Collectors</span>
          <p className="mt-1 text-lg font-bold font-mono text-neutral-900">{stats?.counts.collectors ?? 0}</p>
          <span className="text-[10px] text-neutral-400">Assigned municipal crew</span>
        </div>
        <div className="p-3 bg-neutral-50 rounded-lg">
          <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Purok Leaders</span>
          <p className="mt-1 text-lg font-bold font-mono text-neutral-900">{stats?.counts.leaders ?? 0}</p>
          <span className="text-[10px] text-neutral-400">Assigned field inspectors</span>
        </div>
        <div className="p-3 bg-neutral-50 rounded-lg">
          <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Disposal Reports</span>
          <p className="mt-1 text-lg font-bold font-mono text-neutral-900">{stats?.counts.disposals_submitted ?? 0}</p>
          <span className="text-[10px] text-neutral-400">{stats?.counts.disposals_verified ?? 0} verified by leaders</span>
        </div>
        <div className="p-3 bg-neutral-50 rounded-lg">
          <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Purok Endorsements</span>
          <p className="mt-1 text-lg font-bold font-mono text-neutral-900">{stats?.counts.endorsements_total ?? 0}</p>
          <span className="text-[10px] text-neutral-400">{stats?.counts.endorsements_approved ?? 0} final approvals</span>
        </div>
      </div>

      {/* Main Grids: Schedules & Purok Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Collection Schedules */}
        <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                Recent Collection Schedules
              </h2>
              <p className="text-xs text-neutral-500">Official schedule created by Barangay Captain</p>
            </div>
            <button
              onClick={() => onNavigate('schedules')}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold inline-flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 uppercase font-semibold text-[10px]">
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Purok</th>
                  <th className="py-2.5 px-3">Waste Category</th>
                  <th className="py-2.5 px-3">Assigned Collector</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {schedules.map((s) => {
                  const statusColors: Record<string, string> = {
                    'Scheduled': 'text-amber-800 bg-amber-50 border-amber-200',
                    'In Progress': 'text-sky-800 bg-sky-50 border-sky-200',
                    'Completed': 'text-emerald-800 bg-emerald-50 border-emerald-200',
                    'Cancelled': 'text-neutral-600 bg-neutral-100 border-neutral-200'
                  };
                  return (
                    <tr key={s.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-semibold text-neutral-900 block">{s.scheduled_date}</span>
                        <span className="text-[11px] text-neutral-500 font-mono">{s.time_slot}</span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-neutral-800">{s.purok_name}</td>
                      <td className="py-3 px-3">
                        <span className="text-neutral-700">{s.waste_type}</span>
                      </td>
                      <td className="py-3 px-3 text-neutral-600">{s.collector_name}</td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${
                            statusColors[s.status] || 'text-neutral-700'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Purok Household Breakdown */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="pb-3 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
              Purok Distribution
            </h2>
            <span className="text-[11px] text-neutral-400 font-mono">Barangay Bang-Bang</span>
          </div>

          <div className="mt-4 space-y-3">
            {stats?.purok_breakdown.map((p) => (
              <div key={p.purok_id} className="p-3 border border-neutral-100 rounded-lg hover:border-neutral-200 transition-colors">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neutral-900">{p.purok_name}</span>
                  <span className="text-neutral-500 font-mono tabular-nums">
                    {p.households} households
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
                  <span>{p.residents} registered citizens</span>
                  <span className="font-mono text-emerald-800 font-semibold">
                    ₱{p.total_contributions.toFixed(2)} collected
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Logs & Quick Audits */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
              Recent System Activity & Audit Trail
            </h2>
            <p className="text-xs text-neutral-500">Logged actions from collectors, purok leaders, and residents</p>
          </div>
          <button
            onClick={() => onNavigate('activity-logs')}
            className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold inline-flex items-center gap-1"
          >
            Full audit log
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-4 divide-y divide-neutral-100">
          {activities.map((act) => (
            <div key={act.id} className="py-2.5 flex items-start justify-between text-xs gap-4">
              <div className="flex items-start gap-2.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-100 text-neutral-700 uppercase shrink-0">
                  {act.module}
                </span>
                <span className="text-neutral-800">{act.details}</span>
              </div>
              <span className="text-[11px] text-neutral-400 font-mono whitespace-nowrap">
                {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
