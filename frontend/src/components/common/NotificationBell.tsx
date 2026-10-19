/**
 * Notification Bell Popover with unread counters and quick mark-read actions
 * Fully styled for Light and Dark themes
 */

import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { NotificationItem } from '../../types';
import { api } from '../../services/api';

interface Props {
  /** Opens the page a notification refers to (sidebar tab id). */
  onNavigate?: (tab: string) => void;
}

/** Fired by pages that change notifications (e.g. the Notifications page) so the bell refreshes. */
export const NOTIFICATIONS_CHANGED_EVENT = 'bb:notifications-changed';

export const NotificationBell: React.FC<Props> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchNotifs();
    }, 20000);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, fetchNotifs);
    return () => {
      clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, fetchNotifs);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleMarkAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
      } catch {
        /* ignore */
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (onNavigate && notif.link) {
      onNavigate(notif.link);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label={unreadCount > 0 ? `View notifications (${unreadCount} unread)` : 'View notifications'}
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 text-[9px] leading-4 font-bold text-white text-center bg-rose-600 rounded-full ring-2 ring-white dark:ring-neutral-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-50 overflow-hidden transition-colors">
          <div className="p-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-neutral-850/70">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs font-mono tabular-nums text-emerald-800 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-medium flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                No notifications right now
              </div>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`block w-full p-3.5 text-left transition-colors cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/60 ${
                    !n.is_read ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        !n.is_read ? 'text-emerald-950 dark:text-emerald-300' : 'text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      {n.title}
                    </span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono whitespace-nowrap">
                      {new Date(n.created_at).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                    {n.message}
                  </p>
                </button>
              ))
            )}
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => {
                onNavigate('notifications');
                setOpen(false);
              }}
              className="block w-full p-2.5 text-center text-xs font-semibold text-emerald-800 dark:text-emerald-400 border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
            >
              View all notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
};
