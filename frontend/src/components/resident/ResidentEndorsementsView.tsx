/**
 * Resident Endorsement Requests View - Role 4: Resident
 * Request endorsement from Purok Leader and print official certificate
 */

import React, { useState, useEffect } from 'react';
import { FileCheck2, Plus, Printer, ShieldCheck, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { EndorsementRequest } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { EndorsementCertificateModal } from '../common/EndorsementCertificateModal';
import { useToast } from '../../context/ToastContext';

export const ResidentEndorsementsView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [endorsements, setEndorsements] = useState<EndorsementRequest[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeCertificate, setActiveCertificate] = useState<EndorsementRequest | null>(null);

  // Form State
  const [purpose, setPurpose] = useState('Barangay Clearance Endorsement');
  const [details, setDetails] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await api.getEndorsements();
      setEndorsements(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.requestEndorsement({
        purpose,
        details
      });
      setIsModalOpen(false);
      setDetails('');
      showToast({
        type: 'info',
        title: 'Endorsement Requested',
        message: `Your request for "${purpose}" was sent to your Purok Leader for review.`,
        duration: 6000
      });
      setSuccessMsg('Endorsement request submitted to your Purok Leader. Decision is final.');
      loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Request Failed',
        message: err.message || 'Failed to submit endorsement request'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <FileCheck2 className="w-4 h-4 text-emerald-700" />
            <span>Purok Ecological Council Clearance</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">
            Endorsement Requests & Certificates
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Request official solid waste compliance certificates from your Purok Leader for municipal clearance, scholarships, or loans.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Request New Endorsement
        </button>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Endorsements List */}
      <div className="space-y-4">
        {endorsements.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-xs text-neutral-500">
            You haven't requested any endorsements yet. Click "Request New Endorsement" when you need a purok clearance certificate.
          </div>
        ) : (
          endorsements.map((end) => (
            <div
              key={end.id}
              className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900">{end.purpose}</span>
                    <span className="text-xs text-neutral-500 font-mono">
                      {new Date(end.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 font-medium">
                    Assigned Approver: <strong className="text-emerald-950">{end.leader_name}</strong> (Purok Leader, {end.purok_name})
                  </p>

                  {end.details && (
                    <p className="text-xs text-neutral-700 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                      "{end.details}"
                    </p>
                  )}

                  {end.certificate_code && (
                    <div className="flex items-center gap-2 text-xs pt-1">
                      <span className="text-neutral-500">Official Certificate Reference:</span>
                      <span className="font-mono font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {end.certificate_code}
                      </span>
                    </div>
                  )}

                  {end.remarks && (
                    <p className="text-xs text-neutral-500">
                      <span className="font-semibold text-neutral-700">Leader Endorsement Note: </span>
                      {end.remarks}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 text-xs font-semibold rounded border ${
                      end.status === 'Approved'
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                        : end.status === 'Rejected'
                        ? 'text-rose-800 bg-rose-50 border-rose-200'
                        : 'text-sky-800 bg-sky-50 border-sky-200'
                    }`}
                  >
                    {end.status}
                  </span>

                  {end.status === 'Approved' && (
                    <button
                      onClick={() => setActiveCertificate(end)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      View & Print Certificate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <h2 className="text-base font-bold text-neutral-900">Request Purok Endorsement</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Assigned directly to your Purok Leader ({user?.purok_name}) for final approval.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Purpose of Certificate</label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900 font-medium"
                >
                  <option value="Barangay Clearance Endorsement">Barangay Clearance Endorsement</option>
                  <option value="Waste Compliance Certificate">Solid Waste Compliance Certificate</option>
                  <option value="Good Standing Verification">Good Standing Verification (Livelihood/Loan)</option>
                  <option value="Municipal Scholarship Requirement">Municipal Scholarship Requirement</option>
                  <option value="Business Permit Ecological Clearance">Business Permit Ecological Clearance</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">
                  Specific Request Details or Reason
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State the requirement or transaction (e.g. Applying for scholarship at Cordova Public College)..."
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 shadow-xs"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certificate Slip Modal */}
      <EndorsementCertificateModal
        endorsement={activeCertificate}
        onClose={() => setActiveCertificate(null)}
      />
    </div>
  );
};
