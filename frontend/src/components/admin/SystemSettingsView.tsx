/**
 * System Settings View - Admin (Barangay Captain)
 * Configures the weekly contribution fee (₱5.00 default), hotlines, and municipal credentials
 */

import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle, Database, QrCode, ImagePlus, Trash2 } from 'lucide-react';
import { readImageFile } from '../../utils/format';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const SystemSettingsView: React.FC = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dbHealth, setDbHealth] = useState<{ status: string; database_mode: string } | null>(null);
  const [weeklyFee, setWeeklyFee] = useState('5.00');
  const [barangayName, setBarangayName] = useState('Barangay Bang-Bang');
  const [captainName, setCaptainName] = useState('');
  const [hotline, setHotline] = useState('(032) 496-8120 / +63 917 849 2031');
  const [gcashNumber, setGcashNumber] = useState('0917-849-2031 (Barangay Bang-Bang Waste Fund)');
  const [mayaNumber, setMayaNumber] = useState('');
  const [qrImages, setQrImages] = useState<{ gcash: string; maya: string }>({ gcash: '', maya: '' });
  const [savingQr, setSavingQr] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [settData, healthData, channels] = await Promise.all([
          api.getSettings(),
          api.checkHealth(),
          api.getPaymentChannels().catch(() => null)
        ]);
        if (channels) setQrImages({ gcash: channels.gcash.qr_image, maya: channels.maya.qr_image });
        if (settData.maya_number !== undefined) setMayaNumber(settData.maya_number);
        setSettings(settData);
        setDbHealth(healthData);
        if (settData.weekly_contribution_fee) setWeeklyFee(settData.weekly_contribution_fee);
        if (settData.barangay_name) setBarangayName(settData.barangay_name);
        if (settData.barangay_captain) setCaptainName(settData.barangay_captain);
        if (settData.contact_hotline) setHotline(settData.contact_hotline);
        if (settData.gcash_treasury_number) setGcashNumber(settData.gcash_treasury_number);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateSettings({
        weekly_contribution_fee: weeklyFee,
        barangay_name: barangayName,
        barangay_captain: captainName,
        contact_hotline: hotline,
        gcash_treasury_number: gcashNumber,
        maya_number: mayaNumber
      });
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Settings not saved', message: err.message || 'Failed to update settings' });
    }
  };

  const uploadQr = async (kind: 'gcash' | 'maya', file: File | null) => {
    setSavingQr(kind);
    try {
      const dataUrl = file ? await readImageFile(file) : '';
      await api.updateSettings({ [`${kind}_qr_image`]: dataUrl });
      setQrImages((q) => ({ ...q, [kind]: dataUrl }));
      showToast({ type: 'success', title: file ? 'QR code uploaded' : 'QR code removed', message: file ? 'Residents now see this QR when they pay.' : 'Residents will see the number only.' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'QR not saved', message: err.message });
    } finally {
      setSavingQr(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
          <Settings className="w-4 h-4 text-emerald-700" />
          <span>Barangay Administration</span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mt-1">
          System Parameters & Configuration
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Manage configurable weekly contribution dues, official contact channels, and view database architecture mode.
        </p>
      </div>

      {savedMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>System configuration updated successfully. All resident payment forms now reflect the new parameters.</span>
        </div>
      )}

      {/* Database Status Card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Database Engine Status</h3>
              <p className="text-xs text-neutral-500 font-mono">
                Active Mode: <strong className="text-emerald-900">{dbHealth?.database_mode || 'Checking…'}</strong>
              </p>
            </div>
          </div>
          {dbHealth?.status === 'ok' ? (
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
              Connected
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded">
              Unreachable
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-neutral-600 leading-relaxed border-t border-neutral-100 pt-3">
          All records are stored in MySQL 8 (local MySQL during development, Aiven MySQL over SSL in production).
          Schema changes are applied with versioned migrations in <code className="font-mono text-emerald-800">database/migrations</code>.
        </p>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4 text-xs">
        <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide border-b border-neutral-100 pb-2">
          Solid Waste Management Policy Settings
        </h2>

        <div>
          <label className="block text-neutral-800 font-semibold mb-1">
            Weekly Contribution Fee per Household (₱ PHP)
          </label>
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 font-mono font-bold">₱</span>
            <input
              type="number"
              step="0.50"
              min="0.50"
              max="1000"
              value={weeklyFee}
              onChange={(e) => setWeeklyFee(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900 font-mono font-bold text-sm"
              required
            />
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            Official weekly contribution amount required from each household (initially set to ₱5.00/week).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-neutral-800 font-semibold mb-1">Barangay Name</label>
            <input
              type="text"
              value={barangayName}
              onChange={(e) => setBarangayName(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
              required
            />
          </div>
          <div>
            <label className="block text-neutral-800 font-semibold mb-1">Incumbent Barangay Captain (Admin)</label>
            <input
              type="text"
              value={captainName}
              onChange={(e) => setCaptainName(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-neutral-800 font-semibold mb-1">Barangay Hall Contact Hotline</label>
            <input
              type="text"
              value={hotline}
              required
              onChange={(e) => setHotline(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
            />
          </div>
          <div>
            <label className="block text-neutral-800 font-semibold mb-1">GCash Waste Treasury Destination</label>
            <input
              type="text"
              value={gcashNumber}
              required
              onChange={(e) => setGcashNumber(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
            />
          </div>
          <div>
            <label className="block text-neutral-800 font-semibold mb-1">Maya Waste Treasury Destination</label>
            <input
              type="text"
              value={mayaNumber}
              onChange={(e) => setMayaNumber(e.target.value)}
              placeholder="e.g. 0917-849-2031 (Barangay Bang-Bang Waste Fund)"
              className="w-full p-2 border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white text-neutral-900"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-200 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            Save System Settings
          </button>
        </div>
      </form>

      {/* Official payment QR codes */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs text-xs">
        <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide border-b border-neutral-100 pb-2 flex items-center gap-2">
          <QrCode className="h-4 w-4 text-emerald-700" /> Official Payment QR Codes
        </h2>
        <p className="mt-2 text-neutral-500 leading-relaxed">
          In the GCash / Maya app of the barangay account, open <strong>Receive → My QR</strong>, save the image and upload it here.
          Residents scan it when they pay the weekly contribution.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['gcash', 'maya'] as const).map((kind) => (
            <div key={kind} className="rounded-xl border border-neutral-200 p-4 flex items-center gap-4">
              {qrImages[kind] ? (
                <img src={qrImages[kind]} alt={`${kind} QR`} className="h-28 w-28 rounded-lg border border-neutral-200 object-contain bg-white" />
              ) : (
                <div className="h-28 w-28 rounded-lg border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 text-[10px] text-center p-2">
                  No QR uploaded
                </div>
              )}
              <div className="space-y-2">
                <p className="font-bold text-neutral-900">{kind === 'gcash' ? 'GCash' : 'Maya'} QR</p>
                <label className="inline-flex items-center gap-1 cursor-pointer rounded-lg bg-emerald-800 px-3 py-1.5 font-semibold text-white hover:bg-emerald-900">
                  <ImagePlus className="h-3.5 w-3.5" />
                  {savingQr === kind ? 'Saving…' : qrImages[kind] ? 'Replace' : 'Upload'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={savingQr !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.target.value = '';
                      if (f) void uploadQr(kind, f);
                    }}
                  />
                </label>
                {qrImages[kind] && (
                  <button type="button" onClick={() => uploadQr(kind, null)} className="flex items-center gap-1 text-rose-700 hover:underline">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
