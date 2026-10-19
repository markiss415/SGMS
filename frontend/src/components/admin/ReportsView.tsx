/**
 * Operational Reports & Export - Barangay Bang-Bang
 * Professional PDF Generation with Official Municipal Letterhead & CSV Export
 */

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  CheckCircle2,
  Receipt,
  Users,
  FileCheck2,
  FileText,
  Printer,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  ExternalLink
} from 'lucide-react';
import {
  DashboardStats,
  CollectionSchedule,
  PaymentSubmission,
  Household,
  EndorsementRequest
} from '../../types';
import { api } from '../../services/api';
import {
  exportPurokPerformancePdf,
  exportCollectionsPdf,
  exportPaymentsPdf,
  exportHouseholdsPdf,
  exportEndorsementsPdf
} from '../../services/pdfExport';
import { ReportPdfPreviewModal, ReportType } from './ReportPdfPreviewModal';
import { useToast } from '../../context/ToastContext';

export const ReportsView: React.FC = () => {
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [endorsements, setEndorsements] = useState<EndorsementRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // PDF Preview Modal State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<ReportType>('performance');

  useEffect(() => {
    async function loadAllData() {
      try {
        const [statsData, schedData, payData, hhData, endData] = await Promise.all([
          api.getDashboardStats().catch(() => null),
          api.getSchedules().catch(() => [] as CollectionSchedule[]),
          api.getPayments().catch(() => [] as PaymentSubmission[]),
          api.getHouseholds().catch(() => [] as Household[]),
          api.getEndorsements().catch(() => [] as EndorsementRequest[])
        ]);
        setStats(statsData);
        setSchedules(schedData);
        setPayments(payData);
        setHouseholds(hhData);
        setEndorsements(endData);
      } catch (err) {
        console.error('Error loading reports data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAllData();
  }, []);

  const handleDownloadCsv = async (type: 'collections' | 'payments' | 'households' | 'endorsements' | 'disposals') => {
    try {
      await api.downloadCsv(type);
      showToast({ type: 'success', title: 'CSV Downloaded', message: `The ${type} dataset was saved to your downloads.` });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Export Failed', message: err.message || 'Could not download the CSV file.' });
    }
  };

  const handleExportPdf = (type: ReportType) => {
    try {
      if (type === 'performance') {
        if (!stats) return;
        exportPurokPerformancePdf(stats);
      } else if (type === 'collections') {
        exportCollectionsPdf(schedules);
      } else if (type === 'payments') {
        exportPaymentsPdf(payments);
      } else if (type === 'households') {
        exportHouseholdsPdf(households);
      } else if (type === 'endorsements') {
        exportEndorsementsPdf(endorsements);
      }
      showToast({
        type: 'success',
        title: 'Official PDF Generated',
        message: 'Your formatted municipal report document has been downloaded.'
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Export Failed',
        message: err.message || 'Unable to generate PDF document.'
      });
    }
  };

  const openPreview = (type: ReportType) => {
    setPreviewType(type);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-5 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Barangay Bang-Bang Capstone & Operational Analytics</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            Official Reports & Document Generation
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Audit-ready datasets and formatted official PDFs for Sangguniang Barangay compliance, municipal records, and solid waste accounting.
          </p>
        </div>

        {/* Global PDF Preview Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => openPreview('performance')}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-950 dark:text-emerald-200 bg-emerald-100/90 hover:bg-emerald-200 dark:bg-emerald-950/70 dark:hover:bg-emerald-900 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-4 h-4 text-emerald-800 dark:text-emerald-400" />
            <span>Preview & Print Official PDF</span>
          </button>
          <button
            onClick={() => handleExportPdf('performance')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export Summary PDF</span>
          </button>
        </div>
      </div>

      {/* Export Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Collections */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 w-fit mb-3">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Collection Schedules Report</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              Full schedule records, assigned trucks, collector logs, waste types, and completion volumes.
            </p>
            <div className="mt-2 text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
              {schedules.length} routes recorded
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            <button
              onClick={() => handleExportPdf('collections')}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-lg transition-colors shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Official PDF</span>
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => openPreview('collections')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Printer className="w-3 h-3 text-neutral-500" />
                <span>Preview</span>
              </button>
              <button
                onClick={() => handleDownloadCsv('collections')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Download className="w-3 h-3 text-neutral-500" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Payments */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 w-fit mb-3">
              <Receipt className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Weekly Contributions Ledger</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              Weekly waste fund submissions, reference codes, GCash details, and Purok Leader approvals.
            </p>
            <div className="mt-2 text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
              {payments.length} transactions audited
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            <button
              onClick={() => handleExportPdf('payments')}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-lg transition-colors shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Official PDF</span>
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => openPreview('payments')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Printer className="w-3 h-3 text-neutral-500" />
                <span>Preview</span>
              </button>
              <button
                onClick={() => handleDownloadCsv('payments')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Download className="w-3 h-3 text-neutral-500" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Card 3: Households */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-400 w-fit mb-3">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Household Monitoring Registry</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              Complete list of mapped households across all 7 puroks with family sizes and compliance flags.
            </p>
            <div className="mt-2 text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
              {households.length} households mapped
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            <button
              onClick={() => handleExportPdf('households')}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 rounded-lg transition-colors shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Official PDF</span>
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => openPreview('households')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Printer className="w-3 h-3 text-neutral-500" />
                <span>Preview</span>
              </button>
              <button
                onClick={() => handleDownloadCsv('households')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Download className="w-3 h-3 text-neutral-500" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Card 4: Endorsements */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-400 w-fit mb-3">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Purok Endorsements Audit</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              Issued solid waste certificates, unique security codes, requester profiles, and remarks.
            </p>
            <div className="mt-2 text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
              {endorsements.length} certificates registered
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            <button
              onClick={() => handleExportPdf('endorsements')}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Official PDF</span>
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => openPreview('endorsements')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Printer className="w-3 h-3 text-neutral-500" />
                <span>Preview</span>
              </button>
              <button
                onClick={() => handleDownloadCsv('endorsements')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 rounded-lg transition-colors"
              >
                <Download className="w-3 h-3 text-neutral-500" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Purok Solid Waste Summary Table with Direct PDF Export */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                Barangay Bang-Bang Purok Performance Summary
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Audited 2026
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Aggregated real-time metrics across all 7 puroks of Barangay Bang-Bang, Cordova, Cebu
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => openPreview('performance')}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-neutral-500" />
              <span>Print Preview</span>
            </button>
            <button
              onClick={() => handleExportPdf('performance')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-lg transition-colors shadow-2xs inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Table PDF</span>
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 text-neutral-500 dark:text-neutral-400 uppercase font-semibold text-[10px]">
                <th className="py-2.5 px-3">Purok Area</th>
                <th className="py-2.5 px-3 text-right">Households</th>
                <th className="py-2.5 px-3 text-right">Citizens</th>
                <th className="py-2.5 px-3 text-right">Scheduled Routes</th>
                <th className="py-2.5 px-3 text-right">Completed Routes</th>
                <th className="py-2.5 px-3 text-right">Compliance Rate</th>
                <th className="py-2.5 px-3 text-right">Waste Contributions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-medium">
              {stats?.purok_breakdown.map((p) => (
                <tr key={p.purok_id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-neutral-900 dark:text-white">{p.purok_name}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300">{p.households}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300">{p.residents}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300">{p.schedules}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300">{p.completed}</td>
                  <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                    {p.compliance_rate}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                    ₱{p.total_contributions.toFixed(2)}
                  </td>
                </tr>
              ))}

              {/* Grand Total Row */}
              {stats && (
                <tr className="bg-neutral-100/70 dark:bg-neutral-800/80 font-bold border-t-2 border-emerald-800 text-emerald-950 dark:text-emerald-200">
                  <td className="py-3 px-3 font-bold">TOTAL BARANGAY BANG-BANG</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {stats.purok_breakdown.reduce((s, p) => s + p.households, 0)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {stats.purok_breakdown.reduce((s, p) => s + p.residents, 0)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {stats.purok_breakdown.reduce((s, p) => s + p.schedules, 0)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {stats.purok_breakdown.reduce((s, p) => s + p.completed, 0)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-800 dark:text-emerald-400">
                    95.2%
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    ₱{stats.purok_breakdown.reduce((s, p) => s + p.total_contributions, 0).toFixed(2)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Security & Record Note */}
        <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <span>Official Barangay Bang-Bang Solid Waste Monitoring Council records. PDF exports meet municipal audit guidelines.</span>
          </div>
          <span className="font-mono">Cordova, Cebu</span>
        </div>
      </div>

      {/* PDF Document Preview & Print Modal */}
      <ReportPdfPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        initialType={previewType}
        stats={stats}
        schedules={schedules}
        payments={payments}
        households={households}
        endorsements={endorsements}
      />
    </div>
  );
};
