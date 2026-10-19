/**
 * Households registry.
 *  - Admin: every purok, can register and edit households.
 *  - Purok Leader: only their own purok (enforced by the server), can register and edit.
 */

import React, { useState, useEffect } from 'react';
import { Home, Plus, Search, Filter, CheckCircle2, XCircle, Edit2, QrCode, RefreshCw, X, MapPin } from 'lucide-react';
import { HouseholdQrCard } from '../qr/HouseholdQrCard';
import { Household, Purok } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const inputCls = 'w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900';

interface FormState {
  head_name: string;
  purok_id: string;
  contact_number: string;
  address_details: string;
  family_member_count: string;
  waste_segregation_compliant: boolean;
}

const emptyForm = (purokId = ''): FormState => ({
  head_name: '',
  purok_id: purokId,
  contact_number: '',
  address_details: '',
  family_member_count: '4',
  waste_segregation_compliant: true
});

export const HouseholdsManager: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [households, setHouseholds] = useState<Household[]>([]);
  const [puroks, setPuroks] = useState<Purok[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrFor, setQrFor] = useState<Household | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);

  const regenerateQr = async (h: Household) => {
    if (!confirm(`Issue a NEW QR card for ${h.household_number}? The old printed card will stop working.`)) return;
    setRegenBusy(true);
    try {
      const updated = await api.regenerateHouseholdQr(h.id);
      setQrFor(updated);
      setHouseholds((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      showToast({ type: 'success', title: 'New QR issued', message: 'Print the new card for the household.' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'QR not changed', message: err.message });
    } finally {
      setRegenBusy(false);
    }
  };
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterPurok, setFilterPurok] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; household?: Household } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadData = async () => {
    try {
      const [hList, pList] = await Promise.all([
        api.getHouseholds(filterPurok || undefined, debouncedSearch || undefined),
        puroks.length ? Promise.resolve(puroks) : api.getPuroks()
      ]);
      setHouseholds(hList);
      setPuroks(pList);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load households', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterPurok, debouncedSearch]);

  const openCreate = () => {
    setForm(emptyForm(isAdmin ? puroks[0]?.id || '' : user?.purok_id || ''));
    setModal({ mode: 'create' });
  };

  const openEdit = (h: Household) => {
    setForm({
      head_name: h.head_name,
      purok_id: h.purok_id,
      contact_number: h.contact_number || '',
      address_details: h.address_details,
      family_member_count: String(h.family_member_count),
      waste_segregation_compliant: h.waste_segregation_compliant
    });
    setModal({ mode: 'edit', household: h });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        head_name: form.head_name,
        contact_number: form.contact_number,
        address_details: form.address_details,
        family_member_count: Number(form.family_member_count) || 1,
        waste_segregation_compliant: form.waste_segregation_compliant
      };
      if (modal?.mode === 'edit' && modal.household) {
        await api.updateHousehold(modal.household.id, payload);
        showToast({ type: 'success', title: 'Household updated', message: `${modal.household.household_number} was saved.` });
      } else {
        const created = await api.createHousehold({ ...payload, purok_id: form.purok_id });
        showToast({ type: 'success', title: 'Household registered', message: `Assigned number ${created.household_number}.` });
      }
      setModal(null);
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Not saved', message: err.message || 'Failed to save household' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <Home className="w-4 h-4 text-emerald-700" />
            <span>{isAdmin ? 'Barangay Bang-Bang Household Registry' : `${user?.purok_name} Household Registry`}</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">Registered Households & Waste Compliance</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {isAdmin
              ? 'All households per purok, with segregation compliance and linked resident accounts.'
              : 'Households in your purok. Keep the head of family, contact and compliance status up to date.'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Register Household
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 bg-white border border-neutral-200 rounded-xl">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search households"
            placeholder="Search household no., head of family, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-neutral-50 focus:bg-white text-neutral-800"
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={filterPurok}
              aria-label="Filter by purok"
              onChange={(e) => setFilterPurok(e.target.value)}
              className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-neutral-50 focus:bg-white text-neutral-800"
            >
              <option value="">All Puroks</option>
              {puroks.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <span className="text-xs text-neutral-400 ml-auto font-mono">{households.length} Households</span>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-500 uppercase font-semibold text-[10px]">
                <th className="py-3 px-4">Household No.</th>
                <th className="py-3 px-4">Head of Family</th>
                {isAdmin && <th className="py-3 px-4">Purok</th>}
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Address Details</th>
                <th className="py-3 px-4">Family Size</th>
                <th className="py-3 px-4">Accounts</th>
                <th className="py-3 px-4">Segregation</th>
                <th className="py-3 px-4 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center text-neutral-400">Loading…</td></tr>
              ) : households.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-neutral-400">No households found.</td></tr>
              ) : (
                households.map((h) => (
                  <tr key={h.id} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-900 whitespace-nowrap">{h.household_number}</td>
                    <td className="py-3.5 px-4 font-semibold text-neutral-900 whitespace-nowrap">{h.head_name}</td>
                    {isAdmin && <td className="py-3.5 px-4 text-neutral-800 whitespace-nowrap">{h.purok_name}</td>}
                    <td className="py-3.5 px-4 text-neutral-600 font-mono whitespace-nowrap">{h.contact_number || '—'}</td>
                    <td className="py-3.5 px-4 text-neutral-600 max-w-xs">{h.address_details}</td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-neutral-700 whitespace-nowrap">{h.family_member_count} members</td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-neutral-700">{h.registered_residents_count ?? 0}</td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {h.waste_segregation_compliant ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Compliant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                          <XCircle className="w-3 h-3 text-rose-600" /> Non-compliant
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {h.latitude != null && <MapPin className="inline w-3.5 h-3.5 mr-1 text-emerald-600" aria-label="Pinned on map" />}
                      <button onClick={() => setQrFor(h)} aria-label={`QR card for ${h.household_number}`} title="Household QR card" className="p-1.5 text-neutral-500 hover:text-emerald-800 rounded hover:bg-neutral-100">
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEdit(h)} aria-label={`Edit ${h.household_number}`} title="Edit household" className="p-1.5 text-neutral-500 hover:text-emerald-800 rounded hover:bg-neutral-100">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-neutral-900">
              {modal.mode === 'edit' ? `Edit ${modal.household?.household_number}` : 'Register Household'}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label htmlFor="hh-head" className="block text-neutral-700 font-semibold mb-1">Head of Family</label>
                <input id="hh-head" required value={form.head_name} onChange={(e) => setForm({ ...form, head_name: e.target.value })} className={inputCls} />
              </div>
              {modal.mode === 'create' && isAdmin && (
                <div>
                  <label htmlFor="hh-purok" className="block text-neutral-700 font-semibold mb-1">Purok</label>
                  <select id="hh-purok" required value={form.purok_id} onChange={(e) => setForm({ ...form, purok_id: e.target.value })} className={inputCls}>
                    {puroks.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hh-contact" className="block text-neutral-700 font-semibold mb-1">Contact Number</label>
                  <input id="hh-contact" value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} placeholder="0917-000-0000" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="hh-members" className="block text-neutral-700 font-semibold mb-1">Family Members</label>
                  <input id="hh-members" type="number" min="1" max="50" required value={form.family_member_count} onChange={(e) => setForm({ ...form, family_member_count: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="hh-address" className="block text-neutral-700 font-semibold mb-1">Sitio / Street / Landmark</label>
                <input id="hh-address" required={modal.mode === 'edit'} value={form.address_details} onChange={(e) => setForm({ ...form, address_details: e.target.value })} className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-neutral-800 font-semibold">
                <input type="checkbox" checked={form.waste_segregation_compliant} onChange={(e) => setForm({ ...form, waste_segregation_compliant: e.target.checked })} className="accent-emerald-700" />
                Household follows waste segregation
              </label>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button type="button" onClick={() => setModal(null)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 disabled:opacity-60 shadow-xs">
                  {saving ? 'Saving…' : modal.mode === 'edit' ? 'Save Changes' : 'Register Household'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {qrFor && qrFor.qr_payload && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4" onClick={() => setQrFor(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-neutral-200 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-900">Household QR Card</h2>
              <button type="button" onClick={() => setQrFor(null)} aria-label="Close" className="p-1 text-neutral-400 hover:text-neutral-700"><X className="h-4 w-4" /></button>
            </div>
            <HouseholdQrCard
              payload={qrFor.qr_payload}
              householdNumber={qrFor.household_number}
              headName={qrFor.head_name}
              purokName={qrFor.purok_name}
              address={qrFor.address_details}
            />
            <button
              type="button"
              disabled={regenBusy}
              onClick={() => regenerateQr(qrFor)}
              className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold text-rose-700 hover:underline disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Lost card? Issue a new QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
