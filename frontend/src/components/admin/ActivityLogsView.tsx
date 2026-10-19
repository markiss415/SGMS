/**
 * Activity Audit Trail - Barangay Bang-Bang
 */

import React, { useState, useEffect } from 'react';
import { History, Shield, RefreshCw, Search } from 'lucide-react';
import { ActivityLog } from '../../types';
import { api } from '../../services/api';

export const ActivityLogsView: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const data = await api.getActivityLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = logs.filter(
    (l) =>
      (l.details || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.module.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <History className="w-4 h-4 text-emerald-700" />
            <span>Audit Governance & Compliance</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">
            System Activity & Audit Logs
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Immutable log of schedule adjustments, collector checkpoints, disposal approvals, and financial receipts.
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="p-3 bg-white border border-neutral-200 rounded-xl">
        <input
          type="text"
          placeholder="Search by action, module, or details..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs p-2 border border-neutral-200 rounded-lg bg-neutral-50 focus:bg-white text-neutral-800"
        />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 uppercase font-semibold text-[10px]">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Module</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Details</th>
                <th className="py-2.5 px-4 text-right">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50">
                  <td className="py-3 px-4 font-mono text-neutral-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-neutral-800 whitespace-nowrap">
                    {log.user_name || <span className="text-neutral-400">System / deleted user</span>}
                    {log.user_role && <span className="block text-[10px] text-neutral-400 capitalize">{log.user_role}</span>}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-100 text-neutral-700 font-semibold uppercase">
                      {log.module}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-neutral-800 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 text-neutral-700">{log.details}</td>
                  <td className="py-3 px-4 font-mono text-neutral-400 text-right whitespace-nowrap">
                    {log.ip_address}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
