/**
 * Header Component conforming strictly to the Top Bar Contract:
 * Zone 1: Brand Wordmark & Seal
 * Zone 2: Dark Theme Toggle, Notification Bell & Account Profile / Logout
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { NotificationBell } from './NotificationBell';
import { LogOut, Sun, Moon, Menu } from 'lucide-react';
import { sealImage } from '../../assets/images';

interface HeaderProps {
  onToggleSidebar?: () => void;
  onOpenLogin?: () => void;
  onOpenRegister?: () => void;
  onViewLandingPage?: () => void;
  onNavigate?: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onViewLandingPage, onNavigate }) => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const sealImg = sealImage;

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 md:gap-8 transition-colors">
      {/* Zone 1: Brand Wordmark & Official Seal */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div
          onClick={onViewLandingPage}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-95 transition-opacity"
          title="Go to Public Landing Page"
        >
          <img
            src={sealImg}
            alt="Barangay Bang-Bang"
            className="w-9 h-9 rounded-full object-cover border border-emerald-200 dark:border-emerald-700/60 shadow-2xs"
            referrerPolicy="no-referrer"
          />
          <div className="leading-tight">
            <span className="text-base font-bold text-neutral-900 dark:text-white tracking-tight whitespace-nowrap block font-['Plus_Jakarta_Sans',sans-serif]">
              Barangay Bang-Bang
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap block font-medium">
              Smart Waste Monitoring · Cordova, Cebu
            </span>
          </div>
        </div>
      </div>

      {/* Zone 3: Dark Theme Toggle, Notification Bell & Account Profile */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {onViewLandingPage && (
          <button
            onClick={onViewLandingPage}
            className="hidden sm:inline-flex items-center text-xs text-emerald-800 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-300 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
          >
            Public Landing Page
          </button>
        )}

        {/* Dark / Light Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme (Night Shift)'}
          aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 hover:text-amber-300 transition-transform hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-neutral-600 hover:text-neutral-900 transition-transform hover:-rotate-12" />
          )}
        </button>

        {user && <NotificationBell onNavigate={onNavigate} />}

        {user ? (
          <div className="flex items-center gap-2 sm:gap-3 pl-2 border-l border-neutral-200 dark:border-neutral-800">
            <div className="hidden sm:block text-right leading-tight">
              <span className="text-xs font-semibold text-neutral-900 dark:text-white block truncate max-w-[140px]">
                {user.full_name}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono capitalize block">
                {({ admin: 'Barangay Admin', collector: 'Garbage Collector', leader: 'Purok Leader', resident: 'Resident' } as const)[user.role]} {user.purok_name ? `· ${user.purok_name}` : ''}
              </span>
            </div>
            <button
              onClick={() => { void logout(); }}
              className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onViewLandingPage}
              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-lg transition-colors whitespace-nowrap shadow-xs"
            >
              Landing Page
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
