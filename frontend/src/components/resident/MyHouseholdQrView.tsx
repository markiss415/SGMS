/** Resident: the household QR card the collector / Purok Leader scans. */
import React, { useEffect, useState } from 'react';
import { QrCode as QrIcon, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import type { Household } from '../../types';
import { HouseholdQrCard } from '../qr/HouseholdQrCard';

export const MyHouseholdQrView: React.FC = () => {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getHouseholds()
      .then((list) => setHousehold(list[0] ?? null))
      .catch(() => setHousehold(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
          <QrIcon className="w-4 h-4 text-emerald-700" />
          <span>Household QR Card</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">My Household QR</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Print this card and keep it near your gate, or show it on your phone.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {loading ? (
          <div className="h-80 animate-pulse rounded-2xl bg-neutral-100" />
        ) : household?.qr_payload ? (
          <HouseholdQrCard
            payload={household.qr_payload}
            householdNumber={household.household_number}
            headName={household.head_name}
            purokName={household.purok_name}
            address={household.address_details}
          />
        ) : (
          <p className="text-sm text-neutral-500">Your household QR is not available yet. Please contact your Purok Leader.</p>
        )}

        <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs text-xs text-neutral-700 space-y-3 leading-relaxed">
          <p className="font-bold text-neutral-900 text-sm">Unsaon paggamit / How it works</p>
          <ol className="list-decimal pl-4 space-y-1.5">
            <li><strong>Garbage pick-up:</strong> the collector scans your card when they take your segregated garbage. You get a notification right away.</li>
            <li><strong>Cash payment:</strong> hand the weekly fee to the collector or your Purok Leader and let them scan the card — no form to fill in.</li>
            <li>Your Purok Leader and the Barangay can see the pick-up on the live map.</li>
          </ol>
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-emerald-900">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            The QR contains only a random code, not your personal details. If you lose the card, ask your Purok Leader for a new one — the old card stops working.
          </p>
        </div>
      </div>
    </div>
  );
};
