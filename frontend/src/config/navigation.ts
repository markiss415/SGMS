/**
 * Single source of truth for each role's menu. The sidebar renders it and App.tsx uses the same
 * ids to pick the page, so a menu item can never point to a page the role cannot open.
 */
import type React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Home,
  Truck,
  CheckCircle2,
  Receipt,
  FileCheck2,
  FileSpreadsheet,
  Megaphone,
  Settings,
  History,
  UserCheck,
  Bell,
  UserCircle,
  UserPlus,
  ScanLine,
  Map as MapIcon,
  QrCode
} from 'lucide-react';
import type { UserRole } from '../types';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

export const NAVIGATION: Record<UserRole, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
    { id: 'schedules', label: 'Collection Schedules', icon: CalendarDays },
    { id: 'monitoring', label: 'Collection Monitoring', icon: Truck },
    { id: 'map', label: 'Live Map & Tracking', icon: MapIcon },
    { id: 'households', label: 'Households', icon: Home },
    { id: 'residents', label: 'Residents', icon: Users },
    { id: 'staff', label: 'Collectors & Leaders', icon: UserCheck },
    { id: 'payments', label: 'Contribution Ledger', icon: Receipt },
    { id: 'endorsements', label: 'Endorsement Records', icon: FileCheck2 },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'activity-logs', label: 'Activity Logs', icon: History },
    { id: 'settings', label: 'Barangay Settings', icon: Settings },
    { id: 'profile', label: 'My Profile', icon: UserCircle }
  ],
  collector: [
    { id: 'dashboard', label: 'Collector Dashboard', icon: LayoutDashboard },
    { id: 'assigned-tasks', label: "Today's Route & Tasks", icon: Truck },
    { id: 'scanner', label: 'QR Scanner', icon: ScanLine },
    { id: 'map', label: 'Route Map', icon: MapIcon },
    { id: 'collection-history', label: 'Collection History', icon: History },
    { id: 'schedules', label: 'My Schedules', icon: CalendarDays },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'profile', label: 'My Profile', icon: UserCircle }
  ],
  leader: [
    { id: 'dashboard', label: 'Purok Dashboard', icon: LayoutDashboard },
    { id: 'registrations', label: 'New Registrations', icon: UserPlus },
    { id: 'purok-households', label: 'Purok Households', icon: Home },
    { id: 'map', label: 'Purok Map & Tracking', icon: MapIcon },
    { id: 'scanner', label: 'QR Cash Scanner', icon: ScanLine },
    { id: 'disposal-verification', label: 'Disposal Verification', icon: CheckCircle2 },
    { id: 'payment-verification', label: 'Payment Verification', icon: Receipt },
    { id: 'endorsement-processing', label: 'Endorsement Requests', icon: FileCheck2 },
    { id: 'schedules', label: 'Purok Schedules', icon: CalendarDays },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'profile', label: 'My Profile', icon: UserCircle }
  ],
  resident: [
    { id: 'dashboard', label: 'Resident Dashboard', icon: LayoutDashboard },
    { id: 'schedules', label: 'Collection Schedules', icon: CalendarDays },
    { id: 'my-disposal', label: 'My Disposal Records', icon: CheckCircle2 },
    { id: 'contributions', label: 'Weekly Contributions', icon: Receipt },
    { id: 'my-qr', label: 'My Household QR', icon: QrCode },
    { id: 'map', label: 'Truck Tracker', icon: MapIcon },
    { id: 'endorsements', label: 'Endorsement Requests', icon: FileCheck2 },
    { id: 'announcements', label: 'Barangay Advisories', icon: Megaphone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'profile', label: 'My Household Profile', icon: UserCircle }
  ]
};

/** Returns the tab id if the role has it, otherwise the dashboard (used for notification links). */
export function resolveTab(role: UserRole, tab: string | undefined | null): string {
  const clean = (tab || '').replace(/^\//, '');
  return NAVIGATION[role].some((i) => i.id === clean) ? clean : 'dashboard';
}
