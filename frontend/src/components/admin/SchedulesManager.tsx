/**
 * Collection Schedules
 *  - Admin: create, edit, assign and cancel collection schedules.
 *  - Collector / Purok Leader / Resident: read-only view of the schedules they are allowed to see
 *    (the server scopes the list to their assignments or purok).
 */

import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Plus,
  Filter,
  Trash2,
  Edit2,
  CheckCircle,
  Clock,
  XCircle,
  Truck,
  AlertCircle
} from 'lucide-react';
import { CollectionSchedule, Purok, User, WasteType } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { addDaysStr, formatDate, localDateStr } from '../../utils/format';

export const SchedulesManager: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<CollectionSchedule[]>([]);
  const [puroks, setPuroks] = useState<Purok[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<CollectionSchedule | null>(null);

  // Form State
  const [formPurokId, setFormPurokId] = useState('');
  const [formCollectorId, setFormCollectorId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTimeSlot, setFormTimeSlot] = useState('06:00 AM - 09:00 AM');
  const [formWasteType, setFormWasteType] = useState<WasteType>('Biodegradable');
  const [formNotes, setFormNotes] = useState('');

  // Filter State
  const [filterPurok, setFilterPurok] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [schedList, purList, userList] = await Promise.all([
        api.getSchedules(),
        api.getPuroks(),
        isAdmin ? api.getUsers('collector', undefined, 'active') : Promise.resolve([] as User[])
      ]);
      setSchedules(schedList);
      setPuroks(purList);
      setCollectors(userList);
      if (purList.length > 0 && !formPurokId) setFormPurokId(purList[0].id);
      if (userList.length > 0 && !formCollectorId) setFormCollectorId(userList[0].id);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load schedules', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setFormDate(addDaysStr(localDateStr(), 1));
  }, []);

  const openCreateModal = () => {
    setEditingSchedule(null);
    setFormWasteType('Biodegradable');
    setFormNotes('');
    setFormDate(addDaysStr(localDateStr(), 1));
    if (puroks[0]) setFormPurokId(puroks[0].id);
    if (collectors[0]) setFormCollectorId(collectors[0].id);
    setIsModalOpen(true);
  };

  const openEditModal = (s: CollectionSchedule) => {
    setEditingSchedule(s);
    setFormPurokId(s.purok_id);
    setFormCollectorId(s.collector_id);
    setFormDate(s.scheduled_date);
    setFormTimeSlot(s.time_slot);
    setFormWasteType(s.waste_type);
    setFormNotes(s.notes || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingSchedule) {
        await api.updateSchedule(editingSchedule.id, {
          purok_id: formPurokId,
          collector_id: formCollectorId,
          scheduled_date: formDate,
          time_slot: formTimeSlot,
          waste_type: formWasteType,
          notes: formNotes
        });
        setActionMessage('Schedule updated. The collector, purok leader and residents were notified.');
      } else {
        await api.createSchedule({
          purok_id: formPurokId,
          collector_id: formCollectorId,
          scheduled_date: formDate,
          time_slot: formTimeSlot,
          waste_type: formWasteType,
          notes: formNotes
        });
        setActionMessage('New collection scheduled. The collector, purok leader and residents were notified.');
      }
      setIsModalOpen(false);
      loadData();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Schedule not saved', message: err.message || 'Failed to save schedule' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (s: CollectionSchedule) => {
    const reason = window.prompt(`Cancel the ${s.purok_name} collection on ${formatDate(s.scheduled_date)}?\n\nOptional reason (residents will see this):`, '');
    if (reason === null) return;
    try {
      await api.cancelSchedule(s.id, reason.trim());
      loadData();
      setActionMessage('Schedule cancelled. Everyone affected was notified.');
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not cancel', message: err.message || 'Failed to cancel schedule' });
    }
  };

  const filtered = schedules.filter((s) => {
    if (filterPurok && s.purok_id !== filterPurok) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <CalendarDays className="w-4 h-4 text-emerald-700" />
            <span>Barangay Bang-Bang Schedule Registry</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">
            Garbage Collection Schedules
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {isAdmin
              ? 'Dispatch trucks, assign collectors and set waste segregation days.'
              : user?.role === 'collector'
                ? 'All collection schedules assigned to you.'
                : `Collection schedules for ${user?.purok_name || 'your purok'}. Please set out the right waste type on each day.`}
          </p>
        </div>

        {isAdmin && (
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create New Schedule
        </button>
        )}
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-white border border-neutral-200 rounded-xl">
        <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter By:</span>
        </div>

        {(isAdmin || user?.role === 'collector') && (
        <select
          value={filterPurok}
          onChange={(e) => setFilterPurok(e.target.value)}
          className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-neutral-50 focus:bg-white focus:outline-emerald-600 text-neutral-800"
        >
          <option value="">All Puroks</option>
          {puroks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        )}

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-neutral-50 focus:bg-white focus:outline-emerald-600 text-neutral-800"
        >
          <option value="">All Statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <span className="text-xs text-neutral-400 ml-auto font-mono">
          Showing {filtered.length} of {schedules.length}
        </span>
      </div>

      {/* Schedules Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-500 uppercase font-semibold text-[10px]">
                <th className="py-3 px-4">Scheduled Date</th>
                <th className="py-3 px-4">Purok Area</th>
                <th className="py-3 px-4">Time Slot</th>
                <th className="py-3 px-4">Waste Category</th>
                <th className="py-3 px-4">Assigned Collector</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Collected Volume</th>
                {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-xs text-neutral-400">
                    {isAdmin ? 'No collection schedules match the criteria. Click "Create New Schedule" to plan one.' : 'No collection schedules to show yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const statusColors: Record<string, string> = {
                    'Scheduled': 'text-amber-800 bg-amber-50 border-amber-200',
                    'In Progress': 'text-sky-800 bg-sky-50 border-sky-200 animate-pulse',
                    'Completed': 'text-emerald-800 bg-emerald-50 border-emerald-200',
                    'Cancelled': 'text-neutral-500 bg-neutral-100 border-neutral-200'
                  };

                  return (
                    <tr key={s.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-neutral-900 whitespace-nowrap">
                        {formatDate(s.scheduled_date)}
                        {s.scheduled_date === localDateStr() && (
                          <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Today</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-900 font-semibold whitespace-nowrap">
                        {s.purok_name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-600 whitespace-nowrap">
                        {s.time_slot}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-neutral-800">{s.waste_type}</span>
                        {s.notes && (
                          <span className="block text-[11px] text-neutral-400 truncate max-w-[200px]" title={s.notes}>
                            {s.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-700 whitespace-nowrap">
                        {s.collector_name}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${
                            statusColors[s.status] || ''
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-700 tabular-nums whitespace-nowrap">
                        {s.execution_record?.collected_volume_kg
                          ? `${s.execution_record.collected_volume_kg} kg`
                          : '—'}
                      </td>
                      {isAdmin && (
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {s.status === 'Scheduled' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => openEditModal(s)}
                            className="p-1.5 text-neutral-500 hover:text-emerald-800 rounded hover:bg-neutral-100 transition-colors"
                            title="Edit schedule"
                            aria-label="Edit schedule"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleCancel(s)}
                            className="p-1.5 text-neutral-500 hover:text-rose-600 rounded hover:bg-neutral-100 transition-colors"
                            title="Cancel schedule"
                            aria-label="Cancel schedule"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        ) : (
                          <span className="text-[10px] text-neutral-400">Locked</span>
                        )}
                      </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <h2 className="text-base font-bold text-neutral-900">
              {editingSchedule ? 'Modify Collection Schedule' : 'Schedule Garbage Collection'}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Barangay Bang-Bang official route assignment.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Target Purok Area</label>
                <select
                  value={formPurokId}
                  onChange={(e) => setFormPurokId(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                  required
                >
                  {puroks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.target_collection_days})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Assigned Garbage Collector</label>
                <select
                  value={formCollectorId}
                  onChange={(e) => setFormCollectorId(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                  required
                >
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.contact_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    min={localDateStr()}
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Time Slot</label>
                  <select
                    value={formTimeSlot}
                    onChange={(e) => setFormTimeSlot(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                  >
                    <option value="06:00 AM - 09:00 AM">06:00 AM - 09:00 AM</option>
                    <option value="09:30 AM - 12:00 PM">09:30 AM - 12:00 PM</option>
                    <option value="02:00 PM - 05:00 PM">02:00 PM - 05:00 PM</option>
                    <option value="05:30 PM - 08:00 PM">05:30 PM - 08:00 PM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Waste Classification</label>
                <select
                  value={formWasteType}
                  onChange={(e) => setFormWasteType(e.target.value as WasteType)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                >
                  <option value="Biodegradable">Biodegradable (Malata - Food & Garden waste)</option>
                  <option value="Non-Biodegradable">Non-Biodegradable (Residual plastics & packaging)</option>
                  <option value="Recyclable">Recyclable (Bottles, cans, cardboard, metal)</option>
                  <option value="Special Waste">Special Waste (E-waste, batteries, tires)</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Collector Route Notes / Advisory</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Focus on Sitio Seaside coastal alley bins..."
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
                  disabled={saving || collectors.length === 0}
                  className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 disabled:opacity-60 shadow-xs"
                >
                  {saving ? 'Saving…' : editingSchedule ? 'Save Changes' : 'Publish Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
