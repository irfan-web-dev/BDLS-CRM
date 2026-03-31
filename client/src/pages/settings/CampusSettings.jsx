import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import api from '../../api';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function CampusSettings() {
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.get('/campuses');
      setCampuses(res.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ name: '', address: '', phone: '' }); setModal(true); }
  function openEdit(c) { setEditing(c); setForm({ name: c.name, address: c.address || '', phone: c.phone || '' }); setModal(true); }

  async function handleDelete() {
    try {
      await api.delete(`/campuses/${deleteTarget.id}`);
      load();
    } catch (err) { console.error(err); }
    setDeleteTarget(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/campuses/${editing.id}`, form);
      } else {
        await api.post('/campuses', form);
      }
      load();
      setModal(false);
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Campuses</h2>
        <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Add Campus
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="divide-y">
          {campuses.map(c => (
            <div key={c.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">{[c.address, c.phone].filter(Boolean).join(' | ')}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(c)} className="rounded p-1.5 hover:bg-gray-100 text-gray-400">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteTarget(c)} className="rounded p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Campus' : 'Add Campus'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputClass} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inputClass} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} /></div>
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
        title="Delete Campus"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This campus will be deactivated.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
