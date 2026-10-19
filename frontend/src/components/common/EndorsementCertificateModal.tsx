/**
 * Official Printable Endorsement Certificate Modal
 * Barangay Bang-Bang, Cordova, Cebu, Philippines
 */

import React, { useEffect, useState } from 'react';
import { X, Printer, ShieldCheck } from 'lucide-react';
import { EndorsementRequest } from '../../types';
import { sealImage } from '../../assets/images';
import { api } from '../../services/api';

interface Props {
  endorsement: EndorsementRequest | null;
  onClose: () => void;
}

export const EndorsementCertificateModal: React.FC<Props> = ({ endorsement, onClose }) => {
  const [captain, setCaptain] = useState('');

  useEffect(() => {
    if (!endorsement) return;
    api.getSettings().then((s) => setCaptain(s.barangay_captain || '')).catch(() => undefined);
  }, [endorsement?.id]);

  useEffect(() => {
    if (!endorsement) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [endorsement, onClose]);

  if (!endorsement) return null;

  const handlePrint = () => {
    window.print();
  };

  const sealImg = sealImage;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 print:static print:block print:bg-white print:p-0 print:overflow-visible"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="endorsement-certificate-title"
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[calc(100dvh-2rem)] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 print:max-h-none print:max-w-none print:shadow-none print:border-0 print:rounded-none print:overflow-visible"
      >
        {/* Modal Top Actions */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-neutral-200 bg-neutral-50 print:hidden">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <span>Official Barangay Endorsement Slip</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Certificate
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close certificate preview"
              title="Close certificate preview"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg transition-colors shadow-xs"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Printable Certificate Document */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-12 text-neutral-900 bg-white print:overflow-visible print:p-8" id="printable-certificate">
          {/* Header Seal & Republic Info */}
          <div className="flex items-center justify-between border-b-2 border-emerald-900/80 pb-6 mb-6">
            <img
              src={sealImg}
              alt="Barangay Bang-Bang Official Seal"
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-full border border-emerald-100"
              referrerPolicy="no-referrer"
            />
            <div className="text-center flex-1 px-4">
              <p className="text-xs uppercase tracking-widest text-neutral-500 font-medium">Republic of the Philippines</p>
              <p className="text-xs font-semibold text-neutral-700">Province of Cebu · Municipality of Cordova</p>
              <h2 id="endorsement-certificate-title" className="text-xl font-bold text-emerald-950 font-['Plus_Jakarta_Sans',sans-serif] tracking-tight mt-0.5">
                BARANGAY BANG-BANG
              </h2>
              <p className="text-[11px] text-neutral-500 italic mt-0.5">Office of the Purok Ecological Council & Barangay Captain</p>
            </div>
            <div className="w-20 text-right">
              <span className="text-[10px] font-mono text-neutral-400 block">Doc Ref:</span>
              <span className="text-xs font-mono font-bold text-emerald-900 tabular-nums">
                {endorsement.certificate_code || 'BB-PENDING'}
              </span>
            </div>
          </div>

          {/* Certificate Title */}
          <div className="text-center my-6">
            <h1 className="text-2xl font-extrabold uppercase tracking-wide text-neutral-900 font-['Plus_Jakarta_Sans',sans-serif]">
              CERTIFICATE OF ENDORSEMENT
            </h1>
            <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider font-medium">
              SOLID WASTE COMPLIANCE & PUROK CLEARANCE
            </p>
          </div>

          {/* Body Content */}
          <div className="space-y-4 text-sm text-neutral-800 leading-relaxed">
            <p className="font-semibold text-neutral-900">TO WHOM IT MAY CONCERN:</p>
            <p className="text-justify indent-8">
              THIS IS TO CERTIFY that <strong className="text-neutral-950 uppercase">{endorsement.resident_name || 'Resident'}</strong>, of legal age, Filipino, residing at Household <span className="font-mono font-semibold">{endorsement.household_number || 'Registered Household'}</span> in <strong className="text-emerald-950">{endorsement.purok_name || 'Purok Mangga'}</strong>, Barangay Bang-Bang, Cordova, Cebu, is a duly registered and verified household participant in the Barangay Smart Garbage Monitoring and Ecological Solid Waste Management Program.
            </p>
            <p className="text-justify indent-8">
              Based on the field inspection and official records of the assigned Purok Leader, the subject household is <strong>COMPLIANT</strong> with waste segregation mandates (Biodegradable, Recyclables, Residuals) pursuant to R.A. 9003 and Barangay Ordinance No. 2026-04, and has settled all mandatory weekly collection contributions.
            </p>
            <p className="text-justify indent-8">
              This certification is issued upon the request of the aforementioned resident for the specific purpose of: <strong className="text-neutral-950">{endorsement.purpose}</strong>.
            </p>
            {endorsement.remarks && (
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs italic text-neutral-700">
                <span className="font-semibold not-italic text-neutral-900">Purok Leader Endorsement Remarks: </span>
                {endorsement.remarks}
              </div>
            )}
          </div>

          {/* Date & Location */}
          <div className="mt-8 text-xs text-neutral-600">
            Issued this <span className="font-semibold">{new Date(endorsement.issued_at || endorsement.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span> at Barangay Bang-Bang, Cordova, Cebu, Philippines.
          </div>

          {/* Signatures */}
          <div className="mt-12 grid grid-cols-2 gap-8 pt-6 border-t border-neutral-200">
            <div>
              <div className="h-10 flex items-end">
                <span className="text-xs font-mono text-emerald-800 font-semibold italic">Digitally Verified & Approved</span>
              </div>
              <p className="font-bold text-neutral-900 text-sm border-t border-neutral-400 pt-1">
                {endorsement.leader_name || 'Purok Leader'}
              </p>
              <p className="text-xs text-neutral-500">Purok Leader ({endorsement.purok_name})</p>
              <p className="text-[10px] text-neutral-400">Final Endorsement Authority</p>
            </div>

            <div className="text-right">
              <div className="h-10 flex items-end justify-end">
                <span className="text-xs font-mono text-neutral-400 italic">Attested by Barangay Hall</span>
              </div>
              <p className="font-bold text-neutral-900 text-sm border-t border-neutral-400 pt-1">
                {(captain || 'Punong Barangay').toUpperCase()}
              </p>
              <p className="text-xs text-neutral-500">Punong Barangay (Admin)</p>
              <p className="text-[10px] text-neutral-400">Barangay Bang-Bang, Cordova, Cebu</p>
            </div>
          </div>

          {/* Verification Watermark Footer */}
          <div className="mt-8 pt-4 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
            <span>Verified through Bang-Bang Smart Garbage Monitoring System</span>
            <span>Security Code: {endorsement.certificate_code || 'BB-OFFICIAL'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
