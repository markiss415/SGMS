/**
 * Toast Notification System & Context Provider
 * Barangay Bang-Bang Smart Garbage Monitoring System
 *
 * Alerts users immediately when endorsement requests are processed or when
 * a new announcement is posted.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X, Megaphone, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { NotificationItem } from '../types';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number;
  action?: ToastAction;
  timestamp: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id' | 'timestamp'>) => string;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Tracking refs to detect real-time changes
  const prevNotificationIds = useRef<Set<string>>(new Set());
  const isFirstPoll = useRef<boolean>(true);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, 'id' | 'timestamp'>): string => {
      const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
      const newToast: ToastItem = {
        ...toast,
        id,
        duration: toast.duration ?? 5500,
        timestamp: Date.now()
      };

      setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Keep max 5 toasts

      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, newToast.duration);
      }

      return id;
    },
    [removeToast]
  );

  // Background listener: shows a toast for each new notification addressed to this user
  // (announcements, endorsement decisions, payment/disposal reviews, schedule changes …).
  useEffect(() => {
    if (!user) {
      isFirstPoll.current = true;
      prevNotificationIds.current.clear();
      return;
    }

    const checkUpdates = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const notifications = await api.getNotifications();
        if (isFirstPoll.current) {
          // Baseline on first load so old notifications do not pop up.
          notifications.forEach((n) => prevNotificationIds.current.add(n.id));
          isFirstPoll.current = false;
          return;
        }
        let changed = false;
        for (const notif of notifications.slice(0, 5).reverse()) {
          if (prevNotificationIds.current.has(notif.id)) continue;
          prevNotificationIds.current.add(notif.id);
          changed = true;
          showToast({
            type: notif.type === 'endorsement' || /approved|verified|completed/i.test(notif.title) ? 'success' : /rejected|cancelled/i.test(notif.title) ? 'warning' : 'info',
            title: notif.title,
            message: notif.message.length > 160 ? `${notif.message.slice(0, 160)}…` : notif.message,
            duration: 6000
          });
        }
        if (changed) window.dispatchEvent(new Event('bb:notifications-changed'));
      } catch {
        // Silent: background polling must never break the page.
      }
    };

    checkUpdates();
    const interval = setInterval(checkUpdates, 15000);
    return () => clearInterval(interval);
  }, [user?.id, showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, clearAllToasts }}>
      {children}

      {/* Floating Toast Container */}
      <div
        aria-live="assertive"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none"
      >
        {toasts.map((toast) => {
          const iconConfig = {
            success: {
              Icon: CheckCircle2,
              color: 'text-emerald-700',
              border: 'border-emerald-200 bg-emerald-50/95',
              badge: 'bg-emerald-100 text-emerald-800'
            },
            info: {
              Icon: Megaphone,
              color: 'text-sky-700',
              border: 'border-sky-200 bg-sky-50/95',
              badge: 'bg-sky-100 text-sky-800'
            },
            warning: {
              Icon: AlertTriangle,
              color: 'text-amber-700',
              border: 'border-amber-200 bg-amber-50/95',
              badge: 'bg-amber-100 text-amber-800'
            },
            error: {
              Icon: XCircle,
              color: 'text-rose-700',
              border: 'border-rose-200 bg-rose-50/95',
              badge: 'bg-rose-100 text-rose-800'
            }
          }[toast.type];

          const { Icon, color, border, badge } = iconConfig;

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto w-full p-4 rounded-xl border shadow-lg backdrop-blur-xs transition-all duration-200 animate-in slide-in-from-top-3 fade-in ${border}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-lg bg-white shadow-2xs shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-xs font-bold text-neutral-900 truncate">
                      {toast.title}
                    </h4>
                    <span className="text-[10px] text-neutral-400 font-mono shrink-0">Just now</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-700 leading-relaxed break-words">
                    {toast.message}
                  </p>

                  {toast.action && (
                    <button
                      onClick={() => {
                        toast.action?.onClick();
                        removeToast(toast.id);
                      }}
                      className="mt-2 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 block"
                    >
                      {toast.action.label}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => removeToast(toast.id)}
                  className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-200/50 transition-colors shrink-0"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
