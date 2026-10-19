/**
 * SMART GARBAGE MONITORING SYSTEM - API CLIENT
 * Connects to REST endpoints with Authorization Bearer token
 */

import {
  User,
  Purok,
  Household,
  CollectionSchedule,
  DisposalSubmission,
  PaymentSubmission,
  EndorsementRequest,
  Announcement,
  NotificationItem,
  ActivityLog,
  DashboardStats,
  PaymentChannels,
  ScanLookup,
  ScanRecord,
  MapOverview
} from '../types';

export interface RegisterStarted {
  require_verification: true;
  verification_id: string;
  email: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
  message: string;
}

// Same-origin "/api" by default (Vite proxy in dev, Vercel rewrite in production).
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export function getStoredToken(): string | null {
  return localStorage.getItem('bb_auth_token');
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('bb_auth_token', token);
  } else {
    localStorage.removeItem('bb_auth_token');
  }
}

/** Fired when the server says the session is no longer valid, so the app can return to the sign-in screen. */
export const AUTH_EXPIRED_EVENT = 'bb:auth-expired';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch {
    throw new Error('Cannot reach the server. Please check your internet connection and try again.');
  }

  if (!response.ok) {
    let errorMsg = 'An error occurred during API request.';
    try {
      const data = await response.json();
      if (data && data.error) errorMsg = data.error;
    } catch {
      errorMsg = response.statusText || errorMsg;
    }
    if (response.status === 401 && token) {
      setStoredToken(null);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

/** Downloads a file from an authenticated endpoint (window.location cannot send the Bearer token). */
async function download(endpoint: string, fallbackName: string): Promise<void> {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) {
    let msg = 'Download failed.';
    try { msg = (await response.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  // Health
  checkHealth: () => request<{ status: string; database_mode: string }>('/health'),

  // Public (no sign-in) data for the landing page
  getPublicSchedules: () => request<CollectionSchedule[]>('/public/schedules'),
  getPublicAnnouncements: () => request<Announcement[]>('/public/announcements'),
  verifyCertificate: (code: string) =>
    request<{ valid: boolean; certificate_code: string; purpose: string; issued_at: string; resident_name: string; purok_name: string; leader_name: string }>(
      `/public/verify-certificate/${encodeURIComponent(code)}`
    ),

  // Auth
  login: (identifier: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    }),

  register: (payload: {
    full_name: string;
    username: string;
    email: string;
    password: string;
    contact_number: string;
    purok_id: string;
    address_details?: string;
    family_member_count?: number;
    latitude?: number | null;
    longitude?: number | null;
  }) =>
    request<RegisterStarted>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  /** Step 2 of registration: the 6-digit code from the email. */
  verifyRegistration: (verification_id: string, code: string) =>
    request<{ require_approval: boolean; user_id: string; message: string }>('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify({ verification_id, code })
    }),
  resendRegistrationCode: (verification_id: string) =>
    request<{ success: boolean; email: string; expires_in_seconds: number; resend_after_seconds: number; message: string }>('/auth/register/resend', {
      method: 'POST',
      body: JSON.stringify({ verification_id })
    }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  forgotPassword: (identifier: string) =>
    request<{ success: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier })
    }),

  resetPassword: (payload: { identifier: string; code: string; new_password: string }) =>
    request<{ success: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getMe: () => request<User>('/auth/me'),

  // Puroks & Households
  getPuroks: () => request<Purok[]>('/puroks'),
  getHouseholds: (purokId?: string, search?: string) => {
    const params = new URLSearchParams();
    if (purokId) params.append('purok_id', purokId);
    if (search) params.append('search', search);
    return request<Household[]>(`/households?${params.toString()}`);
  },
  createHousehold: (payload: {
    head_name: string;
    purok_id: string;
    contact_number?: string;
    address_details?: string;
    family_member_count?: number;
  }) =>
    request<Household>('/households', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  regenerateHouseholdQr: (id: string) => request<Household>(`/households/${id}/regenerate-qr`, { method: 'POST' }),
  setMyHouseholdLocation: (latitude: number, longitude: number) =>
    request<Household>('/households/mine/location', { method: 'PUT', body: JSON.stringify({ latitude, longitude }) }),
  updateHousehold: (id: string, payload: Partial<Pick<Household, 'head_name' | 'contact_number' | 'address_details' | 'family_member_count' | 'waste_segregation_compliant' | 'latitude' | 'longitude'>>) =>
    request<Household>(`/households/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  // Users
  getUsers: (role?: string, purokId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (purokId) params.append('purok_id', purokId);
    if (status) params.append('status', status);
    return request<User[]>(`/users?${params.toString()}`);
  },
  createUser: (payload: {
    full_name: string;
    username: string;
    email: string;
    password: string;
    role: string;
    purok_id?: string;
    contact_number?: string;
    address_details?: string;
  }) =>
    request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateUser: (id: string, payload: Partial<Omit<User, 'purok_id'>> & { purok_id?: string | null; new_password?: string }) =>
    request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  approveRegistration: (id: string) =>
    request<User>(`/users/${id}/approve`, { method: 'POST' }),
  rejectRegistration: (id: string, reason?: string) =>
    request<{ success: boolean }>(`/users/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  // Own profile (any role)
  updateProfile: (payload: { full_name?: string; email?: string; contact_number?: string }) =>
    request<User>('/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    request<{ success: boolean; message: string }>('/profile/password', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Schedules
  getSchedules: (params?: { purok_id?: string; status?: string; collector_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.purok_id) q.append('purok_id', params.purok_id);
    if (params?.status) q.append('status', params.status);
    if (params?.collector_id) q.append('collector_id', params.collector_id);
    return request<CollectionSchedule[]>(`/schedules?${q.toString()}`);
  },
  createSchedule: (payload: {
    purok_id: string;
    collector_id: string;
    scheduled_date: string;
    time_slot: string;
    waste_type: string;
    notes?: string;
  }) =>
    request<CollectionSchedule>('/schedules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateSchedule: (id: string, payload: Partial<CollectionSchedule>) =>
    request<CollectionSchedule>(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  /** Cancels the schedule (schedules are never hard-deleted so history is kept). */
  cancelSchedule: (id: string, reason?: string) =>
    request<{ success: boolean; message: string }>(`/schedules/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, {
      method: 'DELETE'
    }),

  // Collector Operations
  startCollection: (payload: { schedule_id: string; truck_number?: string; notes?: string }) =>
    request<{ schedule: CollectionSchedule; record: any }>('/collections/start', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateCollectionProgress: (payload: {
    schedule_id: string;
    collected_volume_kg?: number;
    collector_notes?: string;
  }) =>
    request<any>('/collections/update-progress', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  completeCollection: (payload: {
    schedule_id: string;
    collected_volume_kg?: number;
    collector_notes?: string;
  }) =>
    request<{ schedule: CollectionSchedule; record: any }>('/collections/complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Disposal Submissions & Leader Verification
  submitDisposal: (payload: {
    schedule_id: string;
    waste_type?: string;
    bag_count?: number;
    notes?: string;
    proof_url?: string;
  }) =>
    request<{ submission: DisposalSubmission; verification: any }>('/disposal/submit', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getDisposalSubmissions: () => request<DisposalSubmission[]>('/disposal/submissions'),
  verifyDisposal: (payload: { submission_id: string; status: 'Verified' | 'Rejected'; remarks?: string }) =>
    request<any>('/disposal/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Payment Submissions & Leader Verification
  /** The amount and week end are set by the server from Settings; only the week start is sent. */
  submitPayment: (payload: {
    period_start: string;
    payment_method: string;
    reference_number?: string;
    proof_url?: string;
  }) =>
    request<PaymentSubmission>('/payments/submit', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getPayments: (code?: string) => request<PaymentSubmission[]>(`/payments${code ? `?code=${encodeURIComponent(code)}` : ''}`),
  getPaymentChannels: () => request<PaymentChannels>('/payments/channels'),

  // Field QR scanning (collector / leader)
  scanLookup: (code: string) =>
    request<ScanLookup>('/scan/lookup', { method: 'POST', body: JSON.stringify({ code }) }),
  scanDisposal: (payload: { code: string; schedule_id: string; bag_count: number; notes?: string; latitude?: number | null; longitude?: number | null }) =>
    request<{ id: string; message: string }>('/scan/disposal', { method: 'POST', body: JSON.stringify(payload) }),
  scanPayment: (payload: { code: string; period_start?: string; notes?: string; latitude?: number | null; longitude?: number | null }) =>
    request<{ payment_id: string; payment_code: string; status: 'Pending' | 'Verified'; message: string }>('/scan/payment', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getRecentScans: (params?: { schedule_id?: string; date?: string }) => {
    const q = new URLSearchParams();
    if (params?.schedule_id) q.append('schedule_id', params.schedule_id);
    if (params?.date) q.append('date', params.date);
    return request<ScanRecord[]>(`/scan/recent?${q.toString()}`);
  },

  // Map tracking
  getMapOverview: (date?: string) => request<MapOverview>(`/map/overview${date ? `?date=${date}` : ''}`),
  sendLocationPing: (payload: { schedule_id: string; latitude: number; longitude: number; accuracy?: number | null }) =>
    request<{ stored: boolean }>('/map/ping', { method: 'POST', body: JSON.stringify(payload) }),
  verifyPayment: (payload: { payment_id: string; status: 'Verified' | 'Rejected'; rejection_reason?: string }) =>
    request<PaymentSubmission>('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Endorsements (Purok Leader Final Approver!)
  requestEndorsement: (payload: { purpose: string; details?: string }) =>
    request<EndorsementRequest>('/endorsements/request', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getEndorsements: () => request<EndorsementRequest[]>('/endorsements'),
  reviewEndorsement: (payload: { endorsement_id: string; status: 'Approved' | 'Rejected'; remarks?: string }) =>
    request<EndorsementRequest>('/endorsements/review', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Announcements & Notifications
  getAnnouncements: () => request<Announcement[]>('/announcements'),
  createAnnouncement: (payload: {
    title: string;
    content: string;
    category?: string;
    priority?: string;
  }) =>
    request<Announcement>('/announcements', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  deleteAnnouncement: (id: string) =>
    request<{ success: boolean }>(`/announcements/${id}`, {
      method: 'DELETE'
    }),
  getNotifications: () => request<NotificationItem[]>('/notifications'),
  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/${id}/read`, {
      method: 'POST'
    }),
  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/notifications/read-all', {
      method: 'POST'
    }),

  // Activity logs & System Settings
  getActivityLogs: () => request<ActivityLog[]>('/activity-logs'),
  getSettings: () => request<Record<string, string>>('/settings'),
  updateSettings: (payload: Record<string, string>) =>
    request<{ success: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  // Reports
  getDashboardStats: () => request<DashboardStats>('/reports/dashboard-stats'),
  downloadCsv: (type: 'collections' | 'payments' | 'households' | 'endorsements' | 'disposals') =>
    download(`/reports/export-csv?type=${type}`, `bangbang_${type}.csv`)
};
