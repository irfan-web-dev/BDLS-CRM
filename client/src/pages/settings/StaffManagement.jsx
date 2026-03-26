import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roleUtils';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function StaffManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'staff', campus_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [userRes, campRes] = await Promise.all([
        api.get('/users'),
        api.get('/campuses'),
      ]);
      setUsers(userRes.data);
      setCampuses(campRes.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', password: '', role: 'staff', campus_id: user?.campus_id || '' });
    setError('');
    setModal(true);
  }

  function openEdit(u) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, phone: u.phone || '', password: '', role: u.role, campus_id: u.campus_id || '' });
    setError('');
    setModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = { ...form };
      if (data.campus_id) data.campus_id = parseInt(data.campus_id);
      if (editing) {
        if (!data.password) delete data.password;
        await api.put(`/users/${editing.id}`, data);
      } else {
        await api.post('/users', data);
      }
      load();
      setModal(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      load();
    } catch (err) {
      console.error(err);
    }
    setDeleteTarget(null);
  }

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

  const roleColors = { super_admin: 'red', admin: 'blue', staff: 'gray' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Staff Management</h2>
        <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Add Staff
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Campus</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3"><Badge color={roleColors[u.role]}>{u.role.replace('_', ' ')}</Badge></td>
                <td className="px-4 py-3 text-gray-600">{u.campus?.name || '-'}</td>
                <td className="px-4 py-3"><Badge color={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(u)} className="rounded p-1.5 hover:bg-gray-100 text-gray-400"><Edit2 className="h-4 w-4" /></button>
                    {u.role !== 'super_admin' && (
                      <button onClick={() => setDeleteTarget(u)} className="rounded p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Staff' : 'Add Staff'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputClass} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{editing ? 'New Password' : 'Password *'}</label><input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} {...(!editing && { required: true })} className={inputClass} placeholder={editing ? 'Leave blank to keep current' : ''} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={inputClass}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
                {isSuperAdmin(user) && <option value="super_admin">Super Admin</option>}
              </select>
            </div>
            {isSuperAdmin(user) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
                <select value={form.campus_id} onChange={e => setForm(p => ({ ...p, campus_id: e.target.value }))} className={inputClass}>
                  <option value="">No campus</option>
                  {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Staff"
        message={`Are you sure you want to deactivate ${deleteTarget?.name}? They will no longer be able to log in.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
