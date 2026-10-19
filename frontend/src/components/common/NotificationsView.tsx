/**
 * Full notifications page (all roles). Each user only ever sees their own notifications.
 */
import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, CalendarDays, CheckCircle2, Receipt, FileCheck2, Megaphone, Info } from 'lucide-react';
import { NotificationItem } from '../../types';
import { api } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { NOTIFICATIONS_CHANGED_EVENT } from './NotificationBell';

const typeIcons: Record<NotificationItem['type'], React.ElementType> = {
  schedule: CalendarDays,
  disposal: CheckCircle2,
  payment: Receipt,
  endorsement: FileCheck2,
  announcement: Megaphone,
  system: Info
};

interface Props {
  onNavigate: (tab: string) => void;
}

export const NotificationsView: React.FC<Props> = ({ onNavigate }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = async () => {
    try {
      setItems(await api.getNotifications());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changed = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));

  const markAll = async () => {
    await api.markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    changed();
  };

  const open = async (n: NotificationItem) => {
    if (!n.is_read) {
      await api.markNotificationRead(n.id).catch(() => undefined);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      changed();
    }
    if (n.link) onNavigate(n.link);
  };

  const unread = items.filter((n) => !n.is_read).length;
  const visible = filter === 'unread' ? items.filter((n) => !n.is_read) : items;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <Bell className="w-4 h-4 text-emerald-700" />
            <span>Inbox</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">Notifications</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {unread > 0 ? `You have ${unread} unread notification${unread > 1 ? 's' : ''}.` : 'You are all caught up.'}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAll}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="flex gap-2 p-1.5 bg-neutral-200/60 rounded-xl w-fit">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${filter === f ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            {f === 'all' ? `All (${items.length})` : `Unread (${unread})`}
          </button>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs divide-y divide-neutral-100">
        {loading ? (
          <div className="py-12 text-center text-xs text-neutral-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400">No notifications here.</div>
        ) : (
          visible.map((n) => {
            const Icon = typeIcons[n.type] || Info;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={`w-full text-left p-4 flex gap-3 hover:bg-neutral-50 transition-colors ${!n.is_read ? 'bg-emerald-50/40' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${!n.is_read ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-xs font-semibold ${!n.is_read ? 'text-emerald-950' : 'text-neutral-800'}`}>
                      {!n.is_read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5 align-middle" />}
                      {n.title}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono whitespace-nowrap">{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600 leading-relaxed">{n.message}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
