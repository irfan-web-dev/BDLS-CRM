import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roleUtils';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import CampusTypeTabs from '../../components/ui/CampusTypeTabs';

export default function StudentManagement() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', campus_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [campusType, setCampusType] = useState(user?.campus?.campus_type || 'school');

  useEffect(() => { load(); }, [campusType]);

  const filteredCampuses = isSuperAdmin(user)
    ? campuses.filter(c => (c.campus_type || 'school') === campusType)
    : campuses;

  async function load() {
    setLoading(true);
    try {
      const params = isSuperAdmin(user)
        ? { campus_type: campusType, role: 'student' }
        : { role: 'student' };
      const [studentRes, campRes] = await Promise.all([
        api.get('/users', { params }),
        api.get('/campuses'),
      ]);
      setStudents(studentRes.data);
      setCampuses(campRes.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    const defaultCampusId = isSuperAdmin(user)
      ? (filteredCampuses[0]?.id || '')
      : (user?.campus_id || '');
    setEditing(null);
    setForm({ name: '', email: '', phone: '', campus_id: defaultCampusId });
    setError('');
    setModal(true);
  }

  function openEdit(student) {
    setEditing(student);
    setForm({
      name: student.name || '',
      email: student.email || '',
      phone: student.phone || '',
      campus_id: student.campus_id || '',
    });
    setError('');
    setModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = { ...form, role: 'student' };
      if (data.campus_id) data.campus_id = parseInt(data.campus_id, 10);
      if (editing) {
        await api.put(`/users/${editing.id}`, data);
      } else {
        await api.post('/users', data);
      }
      await load();
      setModal(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      await load();
    } catch (err) {
      console.error(err);
    }
    setDeleteTarget(null);
  }

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

  return (
    <div>
      {isSuperAdmin(user) && (
        <CampusTypeTabs value={campusType} onChange={setCampusType} className="mb-4" />
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Student Management</h2>
        <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Add Student
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Campus</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map(student => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{student.name}</td>
                <td className="px-4 py-3 text-gray-600">{student.email}</td>
                <td className="px-4 py-3 text-gray-600">{student.phone || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{student.campus?.name || '-'}</td>
                <td className="px-4 py-3"><Badge color={student.is_active ? 'green' : 'red'}>{student.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(student)} className="rounded p-1.5 hover:bg-gray-100 text-gray-400"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteTarget(student)} className="rounded p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Student' : 'Add Student'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputClass} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className={inputClass} /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} /></div>
          {isSuperAdmin(user) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
              <select value={form.campus_id} onChange={e => setForm(p => ({ ...p, campus_id: e.target.value }))} className={inputClass}>
                <option value="">No campus</option>
                {filteredCampuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
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
        title="Delete Student"
        message={`Are you sure you want to deactivate ${deleteTarget?.name}?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
