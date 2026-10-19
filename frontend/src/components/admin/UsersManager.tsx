/**
 * Accounts manager (Admin).
 *  - mode "residents": resident accounts, including registrations waiting for approval.
 *  - mode "staff": Barangay Admins, Garbage Collectors and Purok Leaders.
 * Admin can create, edit, (de)activate, reset passwords, and approve/reject pending registrations.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Search, CheckCircle2, XCircle, Clock, Edit2, KeyRound, Power, UserCheck } from 'lucide-react';
import { User, Purok, UserRole } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';

interface Props {
  mode: 'residents' | 'staff';
}

const roleBadges: Record<UserRole, { label: string; color: string }> = {
  admin: { label: 'Barangay Admin', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  collector: { label: 'Garbage Collector', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  leader: { label: 'Purok Leader', color: 'bg-teal-100 text-teal-900 border-teal-300' },
  resident: { label: 'Resident', color: 'bg-neutral-100 text-neutral-800 border-neutral-300' }
};

const statusBadges: Record<User['status'], { label: string; color: string; icon: React.ElementType }> = {
  active: { label: 'Active', color: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  pending: { label: 'Pending Approval', color: 'text-amber-800 bg-amber-50 border-amber-200', icon: Clock },
  inactive: { label: 'Deactivated', color: 'text-neutral-600 bg-neutral-100 border-neutral-300', icon: XCircle }
};

const inputCls = 'w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 focus:bg-white text-neutral-900';

function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

export const UsersManager: React.FC<Props> = ({ mode }) => {
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [puroks, setPuroks] = useState<Purok[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'' | UserRole>('');
  const [statusFilter, setStatusFilter] = useState<'' | User['status']>('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  // Create
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', role: (mode === 'residents' ? 'resident' : 'collector') as UserRole, purok_id: '', contact_number: '', address_details: '' });

  // Edit
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', contact_number: '', role: 'resident' as UserRole, purok_id: '' });

  // Reset password
  const [resetting, setResetting] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [uList, pList] = await Promise.all([api.getUsers(), api.getPuroks()]);
      setUsers(uList);
      setPuroks(pList);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load accounts', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const scoped = useMemo(
    () => users.filter((u) => (mode === 'residents' ? u.role === 'resident' : u.role !== 'resident')),
    [users, mode]
  );

  const visible = scoped.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter && u.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [u.full_name, u.username, u.email, u.purok_name || '', u.household_number || ''].some((v) => v.toLowerCase().includes(q));
    }
    return true;
  });

  const pendingCount = scoped.filter((u) => u.status === 'pending').length;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      showToast({ type: 'success', title: 'Saved', message: success });
      await loadData();
      return true;
    } catch (err: any) {
      showToast({ type: 'error', title: 'Action failed', message: err.message || 'Please try again.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setForm({ full_name: '', username: '', email: '', password: '', role: mode === 'residents' ? 'resident' : 'collector', purok_id: puroks[0]?.id || '', contact_number: '', address_details: '' });
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(form.password);
    if (problem) return showToast({ type: 'error', title: 'Weak password', message: problem });
    const needsPurok = form.role === 'leader' || form.role === 'resident';
    const ok = await run(
      () =>
        api.createUser({
          full_name: form.full_name,
          username: form.username,
          email: form.email,
          password: form.password,
          role: form.role,
          purok_id: needsPurok ? form.purok_id : undefined,
          contact_number: form.contact_number,
          address_details: form.role === 'resident' ? form.address_details : undefined
        }),
      `${form.full_name}'s account was created. Share the initial password with them privately.`
    );
    if (ok) setIsCreateOpen(false);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setEditForm({ full_name: u.full_name, email: u.email, contact_number: u.contact_number || '', role: u.role, purok_id: u.purok_id || puroks[0]?.id || '' });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const needsPurok = editForm.role === 'leader' || editForm.role === 'resident';
    const ok = await run(
      () =>
        api.updateUser(editing.id, {
          full_name: editForm.full_name,
          email: editForm.email,
          contact_number: editForm.contact_number,
          ...(editing.role !== 'resident' ? { role: editForm.role, purok_id: needsPurok ? editForm.purok_id : null } : {})
        }),
      'Account details updated.'
    );
    if (ok) setEditing(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetting) return;
    const problem = passwordProblem(newPassword);
    if (problem) return showToast({ type: 'error', title: 'Weak password', message: problem });
    const ok = await run(() => api.updateUser(resetting.id, { new_password: newPassword }), `Password reset for ${resetting.full_name}. They were signed out of all devices.`);
    if (ok) {
      setResetting(null);
      setNewPassword('');
    }
  };

  const toggleActive = (u: User) => {
    const activating = u.status !== 'active';
    if (!activating && !confirm(`Deactivate ${u.full_name}? They will be signed out and can no longer log in.`)) return;
    run(() => api.updateUser(u.id, { status: activating ? 'active' : 'inactive' }), `${u.full_name} is now ${activating ? 'active' : 'deactivated'}.`);
  };

  const approve = (u: User) => run(() => api.approveRegistration(u.id), `${u.full_name}'s registration was approved.`);
  const reject = (u: User) => {
    const reason = window.prompt(`Reject ${u.full_name}'s registration? The pending account will be removed.\n\nReason (optional):`, '');
    if (reason === null) return;
    run(() => api.rejectRegistration(u.id, reason.trim()), `${u.full_name}'s registration was rejected.`);
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = new Uint32Array(10);
    crypto.getRandomValues(bytes);
    let pw = Array.from(bytes, (b) => chars[b % chars.length]).join('');
    if (!/[0-9]/.test(pw)) pw = pw.slice(0, 9) + '7';
    return pw;
  };

  const title = mode === 'residents' ? 'Residents Management' : 'Collectors & Leaders';
  const subtitle =
    mode === 'residents'
      ? 'Registered household members. Approve new registrations, update details, and reset passwords.'
      : 'Barangay admins, garbage collectors and purok leaders. Each purok can have one active leader.';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <Users className="w-4 h-4 text-emerald-700" />
            <span>Personnel & Community Directory</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">{title}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          {mode === 'residents' ? 'Add Resident' : 'Add Staff Account'}
        </button>
      </div>

      {mode === 'residents' && pendingCount > 0 && (
        <button
          onClick={() => setStatusFilter('pending')}
          className="w-full text-left p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-center gap-2"
        >
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>{pendingCount}</strong> registration{pendingCount > 1 ? 's are' : ' is'} waiting for approval. Purok Leaders normally approve these; you can also approve them here. Click to show.
          </span>
        </button>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-white border border-neutral-200 rounded-xl">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, username, email…"
            aria-label="Search accounts"
            className="text-xs border border-neutral-200 rounded-lg pl-8 pr-2.5 py-1.5 bg-neutral-50 focus:bg-white text-neutral-800 w-56"
          />
        </div>
        {mode === 'staff' && (
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as '' | UserRole)}
            aria-label="Filter by role"
            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-neutral-50 focus:bg-white text-neutral-800"
          >
            <option value="">All Roles</option>
            <option value="admin">Barangay Admins</option>
            <option value="collector">Garbage Collectors</option>
            <option value="leader">Purok Leaders</option>
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | User['status'])}
          aria-label="Filter by status"
          className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-neutral-50 focus:bg-white text-neutral-800"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          {mode === 'residents' && <option value="pending">Pending Approval</option>}
          <option value="inactive">Deactivated</option>
        </select>
        <span className="text-xs text-neutral-400 ml-auto font-mono">
          Showing {visible.length} of {scoped.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-500 uppercase font-semibold text-[10px]">
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Username / Email</th>
                <th className="py-3 px-4">{mode === 'residents' ? 'Purok / Household' : 'Purok Assignment'}</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">Loading accounts…</td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">No accounts match your filters.</td>
                </tr>
              ) : (
                visible.map((u) => {
                  const badge = roleBadges[u.role];
                  const st = statusBadges[u.status];
                  const StIcon = st.icon;
                  const isMe = u.id === me?.id;
                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-neutral-900 whitespace-nowrap">
                        {u.full_name} {isMe && <span className="text-[10px] text-neutral-400 font-normal">(you)</span>}
                        <span className="block text-[10px] text-neutral-400 font-normal">
                          Last sign-in: {u.last_login_at ? formatDateTime(u.last_login_at) : 'never'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${badge.color}`}>{badge.label}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-600">
                        <div>{u.username}</div>
                        <div className="text-[11px] text-neutral-400">{u.email}</div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-800 whitespace-nowrap">
                        {u.purok_name || (u.role === 'leader' ? 'Unassigned' : 'All puroks')}
                        {u.household_number && <span className="block text-[11px] text-neutral-400 font-mono">{u.household_number}</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-600 whitespace-nowrap">{u.contact_number || '—'}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-2 py-0.5 rounded ${st.color}`}>
                          <StIcon className="w-3 h-3" />
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {u.status === 'pending' ? (
                          <div className="inline-flex gap-1.5">
                            <button disabled={busy} onClick={() => approve(u)} className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-800 text-white hover:bg-emerald-900 disabled:opacity-60">
                              Approve
                            </button>
                            <button disabled={busy} onClick={() => reject(u)} className="px-2.5 py-1 text-[11px] font-semibold rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => openEdit(u)} title="Edit details" aria-label={`Edit ${u.full_name}`} className="p-1.5 text-neutral-500 hover:text-emerald-800 rounded hover:bg-neutral-100">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setResetting(u);
                                setNewPassword(generatePassword());
                              }}
                              title="Reset password"
                              aria-label={`Reset password for ${u.full_name}`}
                              className="p-1.5 text-neutral-500 hover:text-amber-700 rounded hover:bg-neutral-100"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            {!isMe && (
                              <button
                                disabled={busy}
                                onClick={() => toggleActive(u)}
                                title={u.status === 'active' ? 'Deactivate account' : 'Reactivate account'}
                                aria-label={u.status === 'active' ? `Deactivate ${u.full_name}` : `Reactivate ${u.full_name}`}
                                className={`p-1.5 rounded hover:bg-neutral-100 ${u.status === 'active' ? 'text-neutral-500 hover:text-rose-600' : 'text-emerald-700 hover:text-emerald-900'}`}
                              >
                                {u.status === 'active' ? <Power className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-neutral-900">{mode === 'residents' ? 'Add Resident Account' : 'Add Staff Account'}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {mode === 'residents' ? 'A household record is created automatically for the resident.' : 'The account can sign in right away.'}
            </p>
            <form onSubmit={handleCreate} className="mt-4 space-y-3 text-xs">
              {mode === 'staff' && (
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Account Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={`${inputCls} font-semibold`}>
                    <option value="collector">Garbage Collector</option>
                    <option value="leader">Purok Leader</option>
                    <option value="admin">Barangay Admin</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Full Name</label>
                <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Username</label>
                  <input required minLength={3} pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, dots, dashes and underscores only" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Contact Number</label>
                  <input value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} placeholder="0918-000-0000" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Email Address</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </div>
              {(form.role === 'leader' || form.role === 'resident') && (
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">{form.role === 'leader' ? 'Purok to Lead' : 'Purok'}</label>
                  <select value={form.purok_id} onChange={(e) => setForm({ ...form, purok_id: e.target.value })} className={inputCls} required>
                    {puroks.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {form.role === 'leader' && p.leader_id ? ` (current leader: ${p.leader_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.role === 'resident' && (
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Sitio / Street / Landmark</label>
                  <input value={form.address_details} onChange={(e) => setForm({ ...form, address_details: e.target.value })} className={inputCls} />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-neutral-700 font-semibold">Initial Password</label>
                  <button type="button" onClick={() => setForm({ ...form, password: generatePassword() })} className="text-[11px] text-emerald-800 font-semibold hover:underline">
                    Generate
                  </button>
                </div>
                <input required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters, letters and numbers" className={`${inputCls} font-mono`} />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 disabled:opacity-60 shadow-xs">
                  {busy ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <h2 className="text-base font-bold text-neutral-900">Edit {editing.full_name}</h2>
            <form onSubmit={handleEdit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Full Name</label>
                <input required value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Email Address</label>
                <input type="email" required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Contact Number</label>
                <input value={editForm.contact_number} onChange={(e) => setEditForm({ ...editForm, contact_number: e.target.value })} className={inputCls} />
              </div>
              {editing.role !== 'resident' && (
                <>
                  <div>
                    <label className="block text-neutral-700 font-semibold mb-1">Role</label>
                    <select
                      value={editForm.role}
                      disabled={editing.id === me?.id}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                      className={inputCls}
                    >
                      <option value="collector">Garbage Collector</option>
                      <option value="leader">Purok Leader</option>
                      <option value="admin">Barangay Admin</option>
                    </select>
                  </div>
                  {editForm.role === 'leader' && (
                    <div>
                      <label className="block text-neutral-700 font-semibold mb-1">Purok to Lead</label>
                      <select value={editForm.purok_id} onChange={(e) => setEditForm({ ...editForm, purok_id: e.target.value })} className={inputCls}>
                        {puroks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.leader_id && p.leader_id !== editing.id ? ` (current leader: ${p.leader_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 disabled:opacity-60 shadow-xs">
                  {busy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetting && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200">
            <h2 className="text-base font-bold text-neutral-900">Reset Password</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Set a new password for <strong>{resetting.full_name}</strong>. Give it to them in person; they can change it in their profile.
            </p>
            <form onSubmit={handleResetPassword} className="mt-4 space-y-3 text-xs">
              <div className="flex gap-2">
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${inputCls} font-mono`} aria-label="New password" />
                <button type="button" onClick={() => setNewPassword(generatePassword())} className="px-2.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                  New
                </button>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button type="button" onClick={() => setResetting(null)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-emerald-800 text-white font-semibold hover:bg-emerald-900 disabled:opacity-60">
                  {busy ? 'Saving…' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
