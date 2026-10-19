/**
 * Printable household QR card. Collectors scan it to record garbage pick-up and cash payments.
 * The QR holds a random token (not personal data), so it cannot be guessed or forged.
 */
import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { QrCode, downloadDataUrl } from './QrCode';
import { sealImage } from '../../assets/images';

interface Props {
  payload: string;
  householdNumber: string;
  headName: string;
  purokName?: string | null;
  address?: string | null;
  compact?: boolean;
}

export const HouseholdQrCard: React.FC<Props> = ({ payload, householdNumber, headName, purokName, address, compact }) => {
  const [png, setPng] = useState('');

  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=720');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    w.document.write(`<!doctype html><html><head><title>${esc(householdNumber)} QR Card</title>
      <style>body{font-family:Arial,sans-serif;margin:0;padding:24px;display:flex;justify-content:center}
      .card{width:320px;border:2px solid #065f46;border-radius:16px;padding:18px;text-align:center}
      .top{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:10px}
      .top img{width:44px;height:44px;border-radius:50%} h1{font-size:14px;margin:0;color:#065f46} p{margin:2px 0;font-size:12px;color:#374151}
      .no{font-family:monospace;font-size:20px;font-weight:bold;margin-top:8px;letter-spacing:1px}
      .hint{font-size:10px;color:#6b7280;margin-top:10px}</style></head><body>
      <div class="card"><div class="top"><img src="${sealImage}" alt=""><div><h1>BARANGAY BANG-BANG</h1><p>Smart Garbage Monitoring · Cordova, Cebu</p></div></div>
      <img src="${png}" width="240" height="240" alt="QR">
      <div class="no">${esc(householdNumber)}</div><p><strong>${esc(headName)}</strong></p><p>${esc(purokName || '')}</p><p>${esc(address || '')}</p>
      <p class="hint">Ipakita kini sa collector inig kuha sa basura o inig bayad og cash.<br>Show this card to the collector during pick-up or cash payment.</p></div>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className={`rounded-2xl border-2 border-emerald-700 bg-white p-4 text-center text-neutral-900 ${compact ? '' : 'max-w-xs mx-auto'}`}>
      <div className="mb-3 flex items-center justify-center gap-2">
        <img src={sealImage} alt="" className="h-9 w-9 rounded-full" />
        <div className="text-left">
          <p className="text-[11px] font-extrabold tracking-wide text-emerald-800">BARANGAY BANG-BANG</p>
          <p className="text-[10px] text-neutral-500">Household QR Card</p>
        </div>
      </div>
      <QrCode value={payload} size={compact ? 160 : 210} className="mx-auto" label={`QR code for ${householdNumber}`} onReady={setPng} />
      <p className="mt-2 font-mono text-lg font-bold tracking-wide">{householdNumber}</p>
      <p className="text-xs font-semibold">{headName}</p>
      {purokName && <p className="text-[11px] text-neutral-500">{purokName}</p>}
      <div className="mt-3 flex justify-center gap-2 print:hidden">
        <button
          type="button"
          onClick={print}
          disabled={!png}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
        >
          <Printer className="h-3.5 w-3.5" /> Print card
        </button>
        <button
          type="button"
          onClick={() => png && downloadDataUrl(png, `${householdNumber}-qr.png`)}
          disabled={!png}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" /> Save image
        </button>
      </div>
    </div>
  );
};
