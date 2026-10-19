/**
 * Quantitative Stat Card following Universal Frontend Design Constitution:
 * Clean unboxed metadata, tabular figures, no pill badge sandwiches.
 * Supports Light and Dark themes.
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  variant?: 'emerald' | 'amber' | 'slate' | 'sky';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'emerald'
}) => {
  const iconColor = {
    emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400',
    amber: 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-400',
    slate: 'text-slate-700 bg-slate-100 dark:bg-neutral-800 dark:text-neutral-300',
    sky: 'text-sky-700 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-400'
  }[variant];

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs transition-all hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{label}</span>
          <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-white font-mono tabular-nums tracking-tight">
            {value}
          </div>
          {subtext && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <span>{subtext}</span>
            </p>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${iconColor} shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
