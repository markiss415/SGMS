/**
 * Purok Leader Dashboard - Barangay Bang-Bang
 * Role 3: Purok Leader (e.g. Rolando Cabigas - Purok Mangga)
 */

import React, { useState, useEffect } from 'react';
import { Home, Users, CheckCircle2, Receipt, FileCheck2, CalendarDays, ArrowRight, ShieldCheck } from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { Household, DisposalSubmission, PaymentSubmission, EndorsementRequest, CollectionSchedule } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onNavigate: (tab: string) => void;
}

export const LeaderDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [disposals, setDisposals] = useState<DisposalSubmission[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [endorsements, setEndorsements] = useState<EndorsementRequest[]>([]);
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [hData, dData, pData, eData, sData, regData] = await Promise.all([
          api.getHouseholds(),
          api.getDisposalSubmissions(),
          api.getPayments(),
          api.getEndorsements(),
          api.getSchedules(),
          api.getUsers('resident', undefined, 'pending')
        ]);
        setPendingRegistrations(regData.length);
        setHouseholds(hData);
        setDisposals(dData);
        setPayments(pData);
        setEndorsements(eData);
        setSchedules(sData);
      } catch (err) {
        console.error('Failed to load purok dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const pendingDisposals = disposals.filter((d) => d.verification_status === 'Pending');
  const pendingPayments = payments.filter((p) => p.status === 'Pending');
  const pendingEndorsements = endorsements.filter((e) => e.status === 'Pending');

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-teal-950 via-teal-900 to-teal-800 text-white rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-200 uppercase tracking-widest mb-2">
          <span>Barangay Bang-Bang · Purok Ecological Leadership</span>
          <span aria-hidden="true">·</span>
          <span>{user?.purok_name || 'No purok assigned'}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">
          Welcome, {user?.full_name}
        </h1>
        <p className="mt-2 text-sm text-teal-100/90 max-w-2xl leading-relaxed">
          Oversee solid waste segregation compliance, verify resident disposal participation, confirm weekly garbage fund contributions, and grant final endorsements for your purok.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          {pendingRegistrations > 0 && (
            <button
              onClick={() => onNavigate('registrations')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-300 text-amber-950 dark:text-amber-950 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-200 transition-colors shadow-xs"
            >
              New Registrations ({pendingRegistrations})
            </button>
          )}
          <button
            onClick={() => onNavigate('disposal-verification')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white text-teal-950 rounded-lg hover:bg-teal-50 transition-colors shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-teal-800" />
            Verify Disposals ({pendingDisposals.length})
          </button>
          <button
            onClick={() => onNavigate('payment-verification')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-teal-800/80 hover:bg-teal-700 text-white rounded-lg transition-colors border border-teal-600/40"
          >
            <Receipt className="w-4 h-4" />
            Verify Payments ({pendingPayments.length})
          </button>
          <button
            onClick={() => onNavigate('endorsement-processing')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-teal-800/80 hover:bg-teal-700 text-white rounded-lg transition-colors border border-teal-600/40"
          >
            <FileCheck2 className="w-4 h-4" />
            Endorsements ({pendingEndorsements.length})
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Purok Households"
          value={households.length}
          subtext={`In ${user?.purok_name || 'No purok assigned'}`}
          icon={Home}
          variant="slate"
        />
        <StatCard
          label="Pending Disposals"
          value={pendingDisposals.length}
          subtext="Awaiting your verification"
          icon={CheckCircle2}
          variant="emerald"
        />
        <StatCard
          label="Pending ₱5 Fees"
          value={pendingPayments.length}
          subtext="Weekly payments to review"
          icon={Receipt}
          variant="amber"
        />
        <StatCard
          label="Pending Endorsements"
          value={pendingEndorsements.length}
          subtext="You are final approver"
          icon={ShieldCheck}
          variant="sky"
        />
      </div>

      {/* Urgent Action Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Disposals Card */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                Recent Disposal Submissions
              </h2>
              <p className="text-xs text-neutral-500">Reported waste participation by purok residents</p>
            </div>
            <button
              onClick={() => onNavigate('disposal-verification')}
              className="text-xs text-teal-800 hover:text-teal-950 font-semibold inline-flex items-center gap-1"
            >
              Process all
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {disposals.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">
                No resident disposal submissions found.
              </div>
            ) : (
              disposals.slice(0, 4).map((d) => (
                <div
                  key={d.id}
                  className="p-3 border border-neutral-100 rounded-lg flex items-center justify-between text-xs hover:border-neutral-200 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-neutral-900">{d.resident_name}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {d.household_number} · {d.bag_count} bags ({d.waste_type})
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

        {/* Pending Endorsements Card */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                Resident Endorsement Requests
              </h2>
              <p className="text-xs text-neutral-500">Purok Leader has FINAL approval authority</p>
            </div>
            <button
              onClick={() => onNavigate('endorsement-processing')}
              className="text-xs text-teal-800 hover:text-teal-950 font-semibold inline-flex items-center gap-1"
            >
              Review all
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {endorsements.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">
                No endorsement requests found for your purok.
              </div>
            ) : (
              endorsements.slice(0, 4).map((e) => (
                <div
                  key={e.id}
                  className="p-3 border border-neutral-100 rounded-lg flex items-center justify-between text-xs hover:border-neutral-200 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-neutral-900">{e.resident_name}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5 font-medium">{e.purpose}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                      e.status === 'Approved'
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                        : e.status === 'Rejected'
                        ? 'text-rose-800 bg-rose-50 border-rose-200'
                        : 'text-sky-800 bg-sky-50 border-sky-200'
                    }`}
                  >
                    {e.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
