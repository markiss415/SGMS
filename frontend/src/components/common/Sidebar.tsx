/**
 * Role-Based Clean Sidebar Navigation
 * Barangay Bang-Bang Smart Garbage Monitoring System
 * Fully styled for Light and Dark themes
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { NAVIGATION } from '../../config/navigation';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const role: UserRole = user?.role || 'resident';

  const navItems = NAVIGATION[role];

  const roleBadgeInfo: Record<UserRole, { badge: string; color: string }> = {
    admin: { badge: 'Barangay Admin', color: 'bg-emerald-900 text-white dark:bg-emerald-800' },
    collector: { badge: 'Garbage Collector', color: 'bg-amber-900 text-white dark:bg-amber-800' },
    leader: { badge: 'Purok Leader', color: 'bg-teal-900 text-white dark:bg-teal-800' },
    resident: { badge: 'Resident Household', color: 'bg-neutral-800 text-white dark:bg-neutral-700' }
  };

  const currentRoleInfo = roleBadgeInfo[role];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 dark:bg-black/70 lg:hidden backdrop-blur-2xs"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col transition-transform duration-200 ease-in-out shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* User Card */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-800 dark:bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
              {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : 'BB'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {user?.full_name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm ${currentRoleInfo.color}`}>
                  {currentRoleInfo.badge}
                </span>
                {user?.purok_name && (
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    {user.purok_name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                  active
                    ? 'bg-emerald-800 dark:bg-emerald-700 text-white font-semibold shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-neutral-400 dark:text-neutral-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 dark:text-neutral-500">
          <p className="font-semibold text-neutral-600 dark:text-neutral-300">Barangay Bang-Bang</p>
          <p>Cordova, Cebu · Solid Waste Dept.</p>
        </div>
      </aside>
    </>
  );
};
