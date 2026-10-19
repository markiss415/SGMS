/**
 * Announcements: the Admin publishes and archives; every other role reads them.
 */

import React, { useState, useEffect } from 'react';
import { Megaphone, Plus, Trash2, AlertTriangle, Calendar, Bell } from 'lucide-react';
import { Announcement } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/format';

export const AnnouncementsManager: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'Schedule Update' | 'Community Advisory' | 'Policy Advisory' | 'Collection Alert'>('Community Advisory');
  const [priority, setPriority] = useState<'Normal' | 'Important' | 'Urgent'>('Normal');

  const loadData = async () => {
    try {
      const data = await api.getAnnouncements();
      setAnnouncements(data);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load announcements', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    try {
      await api.createAnnouncement({
        title,
        content,
        category,
        priority
      });
      showToast({
        type: 'success',
        title: 'Announcement Published',
        message: `Advisory "${title}" has been broadcast to all Barangay Bang-Bang citizens.`,
        duration: 6000
      });
      setIsModalOpen(false);
      setTitle('');
      setContent('');
      loadData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Publish Error',
        message: err.message || 'Failed to post announcement'
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Archive this announcement? It will no longer be shown to residents.')) return;
    try {
      await api.deleteAnnouncement(id);
      showToast({ type: 'success', title: 'Announcement archived', message: 'It is no longer visible.' });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not archive', message: err.message });
    }
  };

  const priorityColors = {
    Normal: 'text-neutral-700 bg-neutral-100 border-neutral-200',
    Important: 'text-amber-800 bg-amber-50 border-amber-200',
    Urgent: 'text-rose-800 bg-rose-50 border-rose-200'
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <Megaphone className="w-4 h-4 text-emerald-700" />
            <span>Community Public Information</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">
            Barangay Advisories & Broadcasts
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {isAdmin
              ? 'Post waste segregation advisories, schedule adjustments and policies. Everyone is notified.'
              : 'Official advisories from the Barangay about collection schedules and waste policies.'}
          </p>
        </div>

        {isAdmin && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Publish Announcement
        </button>
        )}
      </div>

      <div className="space-y-4">
        {loading && <div className="py-10 text-center text-xs text-neutral-400">Loading…</div>}
        {!loading && announcements.length === 0 && (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-xs text-neutral-500">No announcements yet.</div>
        )}
        {announcements.map((ann) => (
          <div
            key={ann.id}
            className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      priorityColors[ann.priority]
                    }`}
                  >
                    {ann.priority} Priority
                  </span>
                  <span className="text-xs text-neutral-500 font-medium">
                    {ann.category}
                  </span>
                  <span className="text-xs text-neutral-400 font-mono">·</span>
                  <span className="text-xs text-neutral-400 font-mono">
                    {formatDateTime(ann.created_at)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-neutral-900">{ann.title}</h3>
                <p className="mt-2 text-xs text-neutral-700 leading-relaxed whitespace-pre-line">
                  {ann.content}
                </p>
              </div>

              {isAdmin && (
              <button
                onClick={() => handleDelete(ann.id)}
                className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-neutral-100 transition-colors shrink-0"
                title="Archive announcement"
                aria-label={`Archive ${ann.title}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <h2 className="text-base font-bold text-neutral-900">Publish Barangay Announcement</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Broadcasted immediately to all resident, collector, and leader dashboards.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Solid Waste Schedule Adjustment"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e: any) => setCategory(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                  >
                    <option value="Schedule Update">Schedule Update</option>
                    <option value="Community Advisory">Community Advisory</option>
                    <option value="Policy Advisory">Policy Advisory</option>
                    <option value="Collection Alert">Collection Alert</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e: any) => setPriority(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Announcement Body</label>
                <textarea
                  rows={4}
                  required
                  placeholder="State the guidelines or schedule details clearly..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
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
                  disabled={publishing}
                  className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 disabled:opacity-60 shadow-xs"
                >
                  {publishing ? 'Publishing…' : 'Publish Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
