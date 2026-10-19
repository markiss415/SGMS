/**
 * TypeScript Interfaces for Barangay Bang-Bang Smart Garbage Monitoring System
 */

export type UserRole = 'admin' | 'collector' | 'leader' | 'resident';

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  purok_id: string | null;
  purok_name?: string | null;
  household_id: string | null;
  household_number?: string | null;
  address_details?: string | null;
  contact_number: string;
  status: 'active' | 'inactive' | 'pending';
  last_login_at?: string | null;
  created_at: string;
}

export interface Purok {
  id: string;
  name: string;
  description: string;
  target_collection_days: string;
  leader_id: string | null;
  leader_name?: string;
  leader_contact?: string;
  households_count?: number;
  residents_count?: number;
}

export interface Household {
  id: string;
  household_number: string;
  purok_id: string;
  purok_name?: string;
  head_name: string;
  contact_number: string;
  address_details: string;
  family_member_count: number;
  waste_segregation_compliant: boolean;
  registered_residents_count?: number;
  latitude?: number | null;
  longitude?: number | null;
  /** Text encoded in the household's printed QR card. */
  qr_payload?: string | null;
  created_at: string;
}

export type WasteType = 'Biodegradable' | 'Non-Biodegradable' | 'Recyclable' | 'Special Waste';
export type ScheduleStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';

export interface CollectionSchedule {
  id: string;
  purok_id: string;
  purok_name: string;
  collector_id: string;
  collector_name: string;
  collector_contact?: string;
  scheduled_date: string;
  time_slot: string;
  waste_type: WasteType;
  status: ScheduleStatus;
  notes?: string;
  created_by: string;
  created_at: string;
  execution_record?: CollectionRecord | null;
  route_code?: string;
  truck_number?: string;
  collected_volume_kg?: number;
}

export interface CollectionRecord {
  id: string;
  schedule_id: string;
  collector_id: string;
  started_at: string | null;
  completed_at: string | null;
  status: 'In Progress' | 'Completed';
  truck_number: string;
  collected_volume_kg: number;
  collector_notes: string;
}

export type VerificationStatus = 'Pending' | 'Verified' | 'Rejected';

export interface DisposalSubmission {
  id: string;
  schedule_id: string;
  resident_id: string;
  resident_name?: string;
  household_id: string;
  household_number?: string;
  purok_id: string;
  purok_name?: string;
  waste_type: string;
  bag_count: number;
  notes: string;
  proof_url?: string;
  submission_timestamp: string;
  created_at: string;
  scheduled_date?: string;
  verification_status?: VerificationStatus;
  verification_remarks?: string;
  verified_at?: string | null;
  verified_by?: string | null;
  leader_name?: string | null;
  time_slot?: string;
  schedule_status?: ScheduleStatus;
}

export interface PaymentSubmission {
  id: string;
  resident_id: string | null;
  resident_name?: string;
  household_id: string;
  household_number?: string;
  purok_id: string;
  purok_name?: string;
  period_start: string;
  period_end: string;
  amount: number;
  payment_method: 'Cash to Leader' | 'Cash to Collector' | 'GCash' | 'Maya' | 'Barangay Hall';
  payment_code?: string | null;
  source?: 'resident' | 'collector_scan' | 'leader_scan';
  recorded_by_name?: string | null;
  head_name?: string;
  reference_number: string;
  proof_url?: string;
  status: VerificationStatus;
  reviewed_by_leader_id?: string | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
}

export type EndorsementStatus = 'Pending' | 'Approved' | 'Rejected';

export interface EndorsementRequest {
  id: string;
  resident_id: string;
  resident_name?: string;
  resident_contact?: string;
  household_number?: string;
  household_address?: string;
  purok_id: string;
  purok_name?: string;
  leader_id: string;
  leader_name?: string;
  purpose: string;
  details: string;
  status: EndorsementStatus;
  remarks?: string | null;
  certificate_code?: string | null;
  certificate_number?: string | null;
  issued_at?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'Schedule Update' | 'Community Advisory' | 'Policy Advisory' | 'Collection Alert';
  priority: 'Normal' | 'Important' | 'Urgent';
  created_by: string;
  is_active: boolean;
  author_name?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'schedule' | 'disposal' | 'payment' | 'endorsement' | 'system' | 'announcement';
  link?: string;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  module: string;
  details: string;
  ip_address: string;
  user_name?: string | null;
  user_role?: UserRole | null;
  created_at: string;
}

export interface DashboardStats {
  counts: {
    residents: number;
    residents_pending: number;
    schedules_cancelled: number;
    schedules_today: number;
    total_volume_kg: number;
    disposals_rejected: number;
    payments_rejected: number;
    endorsements_rejected: number;
    households: number;
    collectors: number;
    leaders: number;
    schedules: number;
    schedules_completed: number;
    schedules_in_progress: number;
    schedules_pending: number;
    disposals_submitted: number;
    disposals_verified: number;
    disposals_pending: number;
    payments_total: number;
    payments_verified: number;
    payments_pending: number;
    total_funds_collected: number;
    endorsements_total: number;
    endorsements_approved: number;
    endorsements_pending: number;
  };
  total_households?: number;
  total_residents?: number;
  completed_collections?: number;
  total_waste_contributions?: number;
  purok_breakdown: Array<{
    purok_id: string;
    purok_name: string;
    households: number;
    residents: number;
    schedules: number;
    completed: number;
    compliance_rate: number;
    total_contributions: number;
    leader_name?: string | null;
    disposals_verified?: number;
    payments_pending?: number;
    volume_kg?: number;
  }>;
  weekly_contributions?: Array<{ week: string; amount: number; payments: number }>;
}

export interface PaymentChannels {
  fee: number;
  barangay_name: string;
  gcash: { number: string; qr_image: string };
  maya: { number: string; qr_image: string };
}

export interface ScanHousehold {
  id: string;
  household_number: string;
  head_name: string;
  purok_id: string;
  purok_name: string;
  address_details: string;
  contact_number: string;
  family_member_count: number;
  latitude: number | null;
  longitude: number | null;
}

export interface ScanLookup {
  household: ScanHousehold;
  fee: number;
  week_start: string;
  week_end: string;
  this_week_payment: { status: string; payment_method: string; payment_code: string; amount: number } | null;
  unpaid_weeks_last_4: number;
  schedules: Array<{ id: string; status: ScheduleStatus; time_slot: string; waste_type: string; scheduled_date: string; already_scanned: boolean }>;
  resident_disposal_log: { bag_count: number; verification_status: string } | null;
}

export interface ScanRecord {
  id: string;
  scan_type: 'Disposal' | 'Payment';
  schedule_id: string | null;
  household_id: string;
  household_number: string;
  head_name: string;
  purok_name: string;
  bag_count: number | null;
  payment_code?: string | null;
  payment_status?: string | null;
  amount?: number | null;
  latitude: number | null;
  longitude: number | null;
  notes?: string | null;
  scanned_by_name: string;
  scanned_by_role?: UserRole;
  created_at: string;
}

export interface MapPoint {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

export interface MapOverview {
  date: string;
  center: { latitude: number; longitude: number };
  puroks: Array<{ id: string; name: string; latitude: number | null; longitude: number | null; leader_name: string | null; households: number }>;
  households: Array<{
    id: string;
    household_number: string;
    head_name: string;
    purok_id: string;
    purok_name: string;
    address_details: string;
    latitude: number | null;
    longitude: number | null;
    payment_status: 'Pending' | 'Verified' | null;
    scanned_today: boolean;
    logged_today: boolean;
  }>;
  routes: Array<{
    id: string;
    purok_id: string;
    purok_name: string;
    collector_id: string;
    collector_name: string;
    time_slot: string;
    waste_type: string;
    status: ScheduleStatus;
    truck_number: string | null;
    collected_volume_kg: number | null;
    scans: number;
    last_position: MapPoint | null;
    trail: MapPoint[];
  }>;
  scans: Array<{
    id: string;
    scan_type: 'Disposal' | 'Payment';
    household_id: string;
    household_number: string;
    head_name: string;
    bag_count: number | null;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
    scanned_by_name: string;
    payment_code: string | null;
  }>;
}
