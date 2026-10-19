/**
 * Resident Dashboard - Role 4: Registered Barangay Resident
 * Barangay Bang-Bang, Cordova, Cebu
 */

import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Receipt,
  FileCheck2,
  Megaphone,
  ArrowRight,
  Plus,
  Home,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { StatCard } from '../common/StatCard';
import {
  CollectionSchedule,
  DisposalSubmission,
  PaymentSubmission,
  EndorsementRequest,
  Announcement
} from '../../types';
import { api } from '../../services/api';
import { addDaysStr, localDateStr, peso, weekStartStr } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { EndorsementCertificateModal } from '../common/EndorsementCertificateModal';

interface Props {
  onNavigate: (tab: string) => void;
}

export const ResidentDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [disposals, setDisposals] = useState<DisposalSubmission[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [endorsements, setEndorsements] = useState<EndorsementRequest[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedEndorsement, setSelectedEndorsement] = useState<EndorsementRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [fee, setFee] = useState(5);

  useEffect(() => {
    async function loadData() {
      try {
        const [sData, dData, pData, eData, aData, settings] = await Promise.all([
          api.getSchedules(),
          api.getDisposalSubmissions(),
          api.getPayments(),
          api.getEndorsements(),
          api.getAnnouncements(),
          api.getSettings().catch(() => ({} as Record<string, string>))
        ]);
        if (settings.weekly_contribution_fee) setFee(Number(settings.weekly_contribution_fee));
        setSchedules(sData);
        setDisposals(dData);
        setPayments(pData);
        setEndorsements(eData);
        setAnnouncements(aData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter for resident's assigned purok
  const myPurokSchedules = schedules.filter(
    (s) => s.purok_id === user?.purok_id || !user?.purok_id
  );
  const today = localDateStr();
  const nextSchedule = myPurokSchedules
    .filter((s) => s.status === 'In Progress' || (s.status === 'Scheduled' && s.scheduled_date >= today))
    .sort((a, b) => (a.status === 'In Progress' ? -1 : b.status === 'In Progress' ? 1 : a.scheduled_date.localeCompare(b.scheduled_date)))[0];

  // Unpaid weeks among the last 4 weeks (including this week); pending payments count as paid until reviewed.
  const coveredWeeks = new Set(payments.filter((p) => p.status !== 'Rejected').map((p) => p.period_start));
  const recentWeeks = [0, 1, 2, 3].map((i) => addDaysStr(weekStartStr(), -7 * i));
  const unpaidWeeks = recentWeeks.filter((w) => !coveredWeeks.has(w)).length;

  const verifiedDisposalsCount = disposals.filter((d) => d.verification_status === 'Verified').length;
  const verifiedPaymentsCount = payments.filter((p) => p.status === 'Verified').length;
  const approvedEndorsementsCount = endorsements.filter((e) => e.status === 'Approved').length;

  return (
    <div className="space-y-6">
      {/* Welcome Hero */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 uppercase tracking-widest mb-2">
          <span>Barangay Bang-Bang · Resident Portal</span>
          <span aria-hidden="true">·</span>
          <span>{user?.purok_name}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">
          Welcome, {user?.full_name}
        </h1>
        <p className="mt-2 text-sm text-emerald-100/90 max-w-xl leading-relaxed">
          Household <span className="font-mono font-semibold text-white">{user?.household_number || '—'}</span>. Monitor upcoming collection trucks, log your segregated waste disposal, pay your weekly {peso(fee)} garbage fee, and request purok clearances.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate('my-disposal')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white text-emerald-950 rounded-lg hover:bg-emerald-50 transition-colors shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-800" />
            Submit Disposal Participation
          </button>
          <button
            onClick={() => onNavigate('contributions')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-800/80 hover:bg-emerald-700 text-white rounded-lg transition-colors border border-emerald-600/40"
          >
            <Receipt className="w-4 h-4" />
            Pay {peso(fee)} Weekly Fee
          </button>
          <button
            onClick={() => onNavigate('endorsements')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-800/80 hover:bg-emerald-700 text-white rounded-lg transition-colors border border-emerald-600/40"
          >
            <FileCheck2 className="w-4 h-4" />
            Request Endorsement
          </button>
        </div>
      </div>

      {/* Next Collection Alert Card */}
      {nextSchedule ? (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg bg-emerald-700 text-white shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold text-emerald-800 uppercase tracking-wider bg-emerald-100 px-2 py-0.5 rounded">
                NEXT COLLECTION IN {nextSchedule.purok_name}
              </span>
              <h3 className="text-base font-bold text-neutral-900 mt-1">
                {nextSchedule.waste_type} Waste Collection
              </h3>
              <p className="text-xs text-neutral-600 mt-0.5 font-mono">
                {nextSchedule.scheduled_date} · {nextSchedule.time_slot} · Assigned: {nextSchedule.collector_name}
              </p>
              {nextSchedule.notes && (
                <p className="text-xs text-emerald-950 mt-1 italic">
                  Note: "{nextSchedule.notes}"
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigate('my-disposal')}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors whitespace-nowrap self-start sm:self-center"
          >
            Log Participation
          </button>
        </div>
      ) : (
        <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-5 text-xs text-neutral-600">
          No immediate collection scheduled in your purok today. Check the full schedule below.
        </div>
      )}

      {/* Status Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Verified Disposals"
          value={verifiedDisposalsCount}
          subtext="Segregation confirmed"
          icon={CheckCircle2}
          variant="emerald"
        />
        <StatCard
          label="Settled Contributions"
          value={verifiedPaymentsCount}
          subtext={`${peso(fee)} weekly fees approved`}
          icon={Receipt}
          variant="amber"
        />
        <StatCard
          label="Purok Endorsements"
          value={approvedEndorsementsCount}
          subtext="Clearance certificates"
          icon={FileCheck2}
          variant="sky"
        />
        <StatCard
          label="Household Dues"
          value={peso(unpaidWeeks * fee)}
          subtext={unpaidWeeks === 0 ? 'Up to date (last 4 weeks)' : `${unpaidWeeks} unpaid week${unpaidWeeks > 1 ? 's' : ''} in the last 4`}
          icon={ShieldCheck}
          variant="slate"
        />
      </div>

      {/* Grid: Recent Disposal Logs & Official Advisories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Disposal History */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                My Disposal Participation
              </h2>
              <p className="text-xs text-neutral-500">Verified by Purok Leader {user?.purok_name}</p>
            </div>
            <button
              onClick={() => onNavigate('my-disposal')}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold inline-flex items-center gap-1"
            >
              View history
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {disposals.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">
                You haven't logged any garbage disposal records yet. Click "Submit Disposal Participation" when your waste is set out.
              </div>
            ) : (
              disposals.slice(0, 4).map((d) => (
                <div
                  key={d.id}
                  className="p-3 border border-neutral-100 rounded-lg flex items-center justify-between text-xs hover:border-neutral-200 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-neutral-900">
                      {d.bag_count} bag(s) · {d.waste_type}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                      {new Date(d.submission_timestamp).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                      d.verification_status === 'Verified'
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                        : d.verification_status === 'Rejected'
                        ? 'text-rose-800 bg-rose-50 border-rose-200'
                        : 'text-amber-800 bg-amber-50 border-amber-200'
                    }`}
                  >
                    {d.verification_status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Barangay Announcements */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                Barangay Bang-Bang Advisories
              </h2>
              <p className="text-xs text-neutral-500">Official notices from the Barangay</p>
            </div>
            <button
              onClick={() => onNavigate('announcements')}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold inline-flex items-center gap-1"
            >
              All notices
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {announcements.slice(0, 3).map((ann) => (
              <div
                key={ann.id}
                className="p-3 bg-neutral-50/70 rounded-lg border border-neutral-100 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900">{ann.title}</span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {new Date(ann.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-neutral-600 line-clamp-2 leading-relaxed">{ann.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <EndorsementCertificateModal
        endorsement={selectedEndorsement}
        onClose={() => setSelectedEndorsement(null)}
      />
    </div>
  );
};
