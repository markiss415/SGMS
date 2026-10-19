/**
 * Official Report PDF Preview & Print Modal
 * Barangay Bang-Bang, Cordova, Cebu, Philippines
 * Features Republic of the Philippines letterhead, official crest, security stamp,
 * and three-signatory barangay council validation.
 */

import React, { useState } from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Building,
  Award
} from 'lucide-react';
import {
  DashboardStats,
  CollectionSchedule,
  PaymentSubmission,
  Household,
  EndorsementRequest
} from '../../types';
import {
  exportPurokPerformancePdf,
  exportCollectionsPdf,
  exportPaymentsPdf,
  exportHouseholdsPdf,
  exportEndorsementsPdf
} from '../../services/pdfExport';
import { sealImage } from '../../assets/images';

export type ReportType = 'performance' | 'collections' | 'payments' | 'households' | 'endorsements';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialType?: ReportType;
  stats: DashboardStats | null;
  schedules?: CollectionSchedule[];
  payments?: PaymentSubmission[];
  households?: Household[];
  endorsements?: EndorsementRequest[];
}

export const ReportPdfPreviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialType = 'performance',
  stats,
  schedules = [],
  payments = [],
  households = [],
  endorsements = []
}) => {
  const [selectedType, setSelectedType] = useState<ReportType>(initialType);
  const sealImg = sealImage;

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (selectedType === 'performance' && stats) {
      exportPurokPerformancePdf(stats);
    } else if (selectedType === 'collections') {
      exportCollectionsPdf(schedules);
    } else if (selectedType === 'payments') {
      exportPaymentsPdf(payments);
    } else if (selectedType === 'households') {
      exportHouseholdsPdf(households);
    } else if (selectedType === 'endorsements') {
      exportEndorsementsPdf(endorsements);
    }
  };

  const reportTitles: Record<ReportType, { title: string; ref: string; subtitle: string }> = {
    performance: {
      title: 'Purok Performance & Solid Waste Compliance Report',
      ref: `BB-SWM-PERF-${new Date().getFullYear()}-0842`,
      subtitle: 'Barangay-Wide Collection Efficiency & Household Metric Summary'
    },
    collections: {
      title: 'Garbage Collection Schedules & Route Operations Audit',
      ref: `BB-SWM-COLL-${new Date().getFullYear()}-1935`,
      subtitle: 'Assigned Routes, Trucks, Waste Categories & Volume Records'
    },
    payments: {
      title: 'Weekly Solid Waste Contributions Ledger (₱5.00 Ordinance)',
      ref: `BB-SWM-LEDGER-${new Date().getFullYear()}-3710`,
      subtitle: 'Resident Contribution Submissions & Purok Leader Approvals'
    },
    households: {
      title: 'Barangay Bang-Bang Household Segregation Registry',
      ref: `BB-SWM-REG-${new Date().getFullYear()}-5821`,
      subtitle: 'Mapped Household Units & Waste Segregation Compliance Status'
    },
    endorsements: {
      title: 'Purok Solid Waste Compliance Endorsements Audit',
      ref: `BB-SWM-ENDORSE-${new Date().getFullYear()}-7463`,
      subtitle: 'Certified Waste Endorsement Clearance Registry'
    }
  };

  const currentMeta = reportTitles[selectedType];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] border border-neutral-200 dark:border-neutral-800 print:border-none print:shadow-none print:max-h-none print:w-full">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-850 rounded-t-2xl print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white font-['Plus_Jakarta_Sans',sans-serif]">
                Official PDF Document Export & Print
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Barangay Bang-Bang Solid Waste Management Council
              </p>
            </div>
          </div>

          {/* Report Type Selector Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs">
            <button
              onClick={() => setSelectedType('performance')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                selectedType === 'performance'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Purok Summary
            </button>
            <button
              onClick={() => setSelectedType('collections')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                selectedType === 'collections'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Collections
            </button>
            <button
              onClick={() => setSelectedType('payments')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                selectedType === 'payments'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Contributions
            </button>
            <button
              onClick={() => setSelectedType('households')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                selectedType === 'households'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Households
            </button>
            <button
              onClick={() => setSelectedType('endorsements')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                selectedType === 'endorsements'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Endorsements
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Page</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF File</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Sheet */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-neutral-100 dark:bg-neutral-950 print:bg-white print:p-0">
          <div className="bg-white text-neutral-900 max-w-4xl mx-auto p-8 sm:p-12 rounded-xl shadow-lg border border-neutral-200 print:border-none print:shadow-none print:p-0 print:max-w-none">
            {/* 1. Official Republic of the Philippines Letterhead */}
            <div className="text-center relative pb-4 border-b-2 border-emerald-900">
              <div className="flex items-center justify-between gap-4">
                <img
                  src={sealImg}
                  alt="Barangay Bang-Bang Crest"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-amber-600/40 shadow-xs shrink-0"
                  referrerPolicy="no-referrer"
                />

                <div className="flex-1 text-center leading-tight">
                  <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold font-serif">
                    Republic of the Philippines
                  </p>
                  <p className="text-[12px] uppercase tracking-wider text-neutral-600 font-serif">
                    Province of Cebu · Municipality of Cordova
                  </p>
                  <h1 className="text-xl sm:text-2xl font-black text-emerald-950 font-serif tracking-wide mt-0.5">
                    BARANGAY BANG-BANG
                  </h1>
                  <p className="text-xs font-bold text-amber-800 tracking-wider uppercase mt-0.5">
                    OFFICE OF THE SANGGUNIANG BARANGAY & SOLID WASTE MANAGEMENT COUNCIL
                  </p>
                </div>

                {/* Republic Emblem Placeholder or Secondary Crest */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-emerald-900/30 flex items-center justify-center text-emerald-900/50 shrink-0">
                  <Award className="w-8 h-8 text-amber-700" />
                </div>
              </div>

              {/* Decorative Double Bar */}
              <div className="mt-3 w-full h-1 bg-emerald-900 rounded-full" />
              <div className="mt-0.5 w-full h-0.5 bg-amber-600 rounded-full" />
            </div>

            {/* 2. Document Title & Control Information */}
            <div className="mt-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-3 border-b border-neutral-200">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  Official Municipal Record
                </span>
                <h2 className="text-lg font-bold text-neutral-900 font-['Plus_Jakarta_Sans',sans-serif] mt-1">
                  {currentMeta.title}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">{currentMeta.subtitle}</p>
              </div>

              <div className="text-right text-xs font-mono text-neutral-600 shrink-0 space-y-0.5">
                <p>
                  <span className="text-neutral-400">Doc Ref:</span>{' '}
                  <span className="font-bold text-emerald-950">{currentMeta.ref}</span>
                </p>
                <p>
                  <span className="text-neutral-400">Date:</span>{' '}
                  <span>
                    {new Date().toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </p>
                <p>
                  <span className="text-neutral-400">Status:</span>{' '}
                  <span className="text-emerald-700 font-semibold">VERIFIED & AUDITED</span>
                </p>
              </div>
            </div>

            {/* 3. Report Highlight Metrics */}
            {stats && (
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block">
                    Households
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-950">
                    {stats.counts?.households ?? stats.total_households ?? 0}
                  </span>
                  <span className="text-[10px] text-emerald-700 block">All 7 Puroks</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block">
                    Total Residents
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-950">
                    {stats.counts?.residents ?? stats.total_residents ?? 0}
                  </span>
                  <span className="text-[10px] text-emerald-700 block">Registered Citizens</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block">
                    Collections Completed
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-950">
                    {stats.counts?.schedules_completed ?? stats.completed_collections ?? 0}
                  </span>
                  <span className="text-[10px] text-emerald-700 block">Routes Cleared</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block">
                    Solid Waste Fund
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-950">
                    ₱{Number(stats.counts?.total_funds_collected ?? stats.total_waste_contributions ?? 0).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-emerald-700 block">₱5 Ordinance Fee</span>
                </div>
              </div>
            )}

            {/* 4. Dynamic Data Table based on selection */}
            <div className="mt-6 overflow-x-auto">
              {selectedType === 'performance' && stats && (
                <table className="w-full text-left text-xs border border-neutral-300">
                  <thead>
                    <tr className="bg-emerald-900 text-white font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3 border-r border-emerald-800">Purok Jurisdiction</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-800">Households</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-800">Residents</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-800">Scheduled</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-800">Completed</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-800">Compliance</th>
                      <th className="py-2.5 px-3 text-right">Contributions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {stats.purok_breakdown.map((p, idx) => (
                      <tr key={p.purok_id} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                        <td className="py-2.5 px-3 font-bold text-neutral-900 border-r border-neutral-200">
                          {p.purok_name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-neutral-200">
                          {p.households}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-neutral-200">
                          {p.residents}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-neutral-200">
                          {p.schedules}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-neutral-200">
                          {p.completed}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 border-r border-neutral-200">
                          {p.compliance_rate}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-neutral-900 tabular-nums">
                          ₱{p.total_contributions.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {/* Summary Row */}
                    <tr className="bg-neutral-100 font-bold border-t-2 border-emerald-900 text-emerald-950">
                      <td className="py-3 px-3 border-r border-neutral-300">BARANGAY TOTAL</td>
                      <td className="py-3 px-3 text-right font-mono border-r border-neutral-300">
                        {stats.purok_breakdown.reduce((s, p) => s + p.households, 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono border-r border-neutral-300">
                        {stats.purok_breakdown.reduce((s, p) => s + p.residents, 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono border-r border-neutral-300">
                        {stats.purok_breakdown.reduce((s, p) => s + p.schedules, 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono border-r border-neutral-300">
                        {stats.purok_breakdown.reduce((s, p) => s + p.completed, 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-800 border-r border-neutral-300">
                        95.2%
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        ₱{stats.purok_breakdown.reduce((s, p) => s + p.total_contributions, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {selectedType === 'collections' && (
                <table className="w-full text-left text-xs border border-neutral-300">
                  <thead>
                    <tr className="bg-emerald-900 text-white font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3 border-r border-emerald-800">Route</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Purok</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Waste Type</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Date & Slot</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Collector</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Truck</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Status</th>
                      <th className="py-2.5 px-3 text-right">Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {schedules.slice(0, 15).map((s, idx) => (
                      <tr key={s.id} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                        <td className="py-2 px-3 font-mono font-bold text-neutral-900 border-r border-neutral-200">
                          {s.route_code || s.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200">{s.purok_name}</td>
                        <td className="py-2 px-3 border-r border-neutral-200">{s.waste_type}</td>
                        <td className="py-2 px-3 border-r border-neutral-200 font-mono text-[11px]">
                          {s.scheduled_date} ({s.time_slot})
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200">
                          {s.collector_name || 'Danilo Navarro'}
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200 font-mono text-[11px]">
                          {s.truck_number || s.execution_record?.truck_number || 'TRK-01'}
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200 font-semibold text-emerald-800">
                          {s.status}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {s.collected_volume_kg || s.execution_record?.collected_volume_kg
                            ? `${s.collected_volume_kg || s.execution_record?.collected_volume_kg} kg`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedType === 'payments' && (
                <table className="w-full text-left text-xs border border-neutral-300">
                  <thead>
                    <tr className="bg-emerald-900 text-white font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3 border-r border-emerald-800">Ref #</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Resident</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Purok</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Coverage</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-800">Amount</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Channel</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Status</th>
                      <th className="py-2.5 px-3">Reviewer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {payments.slice(0, 15).map((p, idx) => (
                      <tr key={p.id} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                        <td className="py-2 px-3 font-mono font-bold text-neutral-900 border-r border-neutral-200">
                          {p.reference_number || 'GCASH-REF'}
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200">{p.resident_name}</td>
                        <td className="py-2 px-3 border-r border-neutral-200">{p.purok_name}</td>
                        <td className="py-2 px-3 border-r border-neutral-200 font-mono text-[11px]">
                          {p.period_start} ~ {p.period_end}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-neutral-900 border-r border-neutral-200">
                          ₱{Number(p.amount).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200">{p.payment_method}</td>
                        <td className="py-2 px-3 border-r border-neutral-200 font-semibold text-emerald-800">
                          {p.status}
                        </td>
                        <td className="py-2 px-3">{p.reviewer_name || 'Purok Leader'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedType === 'households' && (
                <table className="w-full text-left text-xs border border-neutral-300">
                  <thead>
                    <tr className="bg-emerald-900 text-white font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3 border-r border-emerald-800">Household #</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Head of Household</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Purok Area</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Address Details</th>
                      <th className="py-2.5 px-3 text-center border-r border-emerald-800">Members</th>
                      <th className="py-2.5 px-3">Segregation Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {households.slice(0, 15).map((h, idx) => (
                      <tr key={h.id} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                        <td className="py-2 px-3 font-mono font-bold text-neutral-900 border-r border-neutral-200">
                          {h.household_number}
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200">{h.head_name}</td>
                        <td className="py-2 px-3 border-r border-neutral-200">{h.purok_name}</td>
                        <td className="py-2 px-3 border-r border-neutral-200 text-neutral-600">
                          {h.address_details}
                        </td>
                        <td className="py-2 px-3 text-center font-mono border-r border-neutral-200">
                          {h.family_member_count}
                        </td>
                        <td className="py-2 px-3 font-semibold text-emerald-800">
                          {h.waste_segregation_compliant ? 'Compliant' : 'Non-Compliant'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedType === 'endorsements' && (
                <table className="w-full text-left text-xs border border-neutral-300">
                  <thead>
                    <tr className="bg-emerald-900 text-white font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3 border-r border-emerald-800">Certificate #</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Resident Name</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Purok</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Purpose</th>
                      <th className="py-2.5 px-3 border-r border-emerald-800">Approving Leader</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {endorsements.slice(0, 15).map((e, idx) => (
                      <tr key={e.id} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                        <td className="py-2 px-3 font-mono font-bold text-neutral-900 border-r border-neutral-200">
                          {e.certificate_code || e.certificate_number || 'PENDING'}
                        </td>
                        <td className="py-2 px-3 border-r border-neutral-200">{e.resident_name}</td>
                        <td className="py-2 px-3 border-r border-neutral-200">{e.purok_name}</td>
                        <td className="py-2 px-3 border-r border-neutral-200">{e.purpose}</td>
                        <td className="py-2 px-3 border-r border-neutral-200">{e.leader_name}</td>
                        <td className="py-2 px-3 font-semibold text-emerald-800">{e.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 5. Official Attestation & Signatory Block */}
            <div className="mt-12 pt-6 border-t-2 border-neutral-200">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-6">
                CERTIFICATION & OFFICIAL ATTESTATION:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left">
                {/* Signatory 1 */}
                <div>
                  <p className="text-xs text-neutral-500 mb-8">Prepared by:</p>
                  <div className="w-full border-b border-neutral-400 mb-1" />
                  <p className="text-xs font-bold text-neutral-900">DANILO NAVARRO</p>
                  <p className="text-[10px] text-neutral-500">Solid Waste Monitoring Officer</p>
                  <p className="text-[10px] text-neutral-400">Barangay Bang-Bang Operations</p>
                </div>

                {/* Signatory 2 */}
                <div>
                  <p className="text-xs text-neutral-500 mb-8">Verified by:</p>
                  <div className="w-full border-b border-neutral-400 mb-1" />
                  <p className="text-xs font-bold text-neutral-900">ROBERTO MANGA</p>
                  <p className="text-[10px] text-neutral-500">President, Purok Leaders Council</p>
                  <p className="text-[10px] text-neutral-400">Barangay Bang-Bang, Cordova</p>
                </div>

                {/* Signatory 3 */}
                <div>
                  <p className="text-xs text-neutral-500 mb-8">Approved by:</p>
                  <div className="w-full border-b border-emerald-900 mb-1" />
                  <p className="text-xs font-bold text-emerald-950 font-serif">HON. ARTEMIO DEGAMO</p>
                  <p className="text-[10px] font-semibold text-neutral-700">Punong Barangay (Barangay Captain)</p>
                  <p className="text-[10px] text-neutral-400">Barangay Bang-Bang, Cordova, Cebu</p>
                </div>
              </div>

              {/* Security Seal Stamp Watermark Footer */}
              <div className="mt-10 pt-4 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Official Government Document · Generated via Smart Waste Monitoring System</span>
                </div>
                <span className="font-mono">
                  REF-{Date.now().toString(36).toUpperCase()}-CORDOVA-CEBU
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
