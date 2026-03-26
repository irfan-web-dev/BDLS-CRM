import { useState, useEffect } from 'react';
import { Plus, Edit2 } from 'lucide-react';
import api from '../../api';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function ClassSettings() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.get('/classes');
      setClasses(res.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ name: '' }); setModal(true); }
  function openEdit(c) { setEditing(c); setForm({ name: c.name }); setModal(true); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/classes/${editing.id}`, form);
      } else {
        await api.post('/classes', form);
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
        <h2 className="text-lg font-semibold">Class Levels</h2>
        <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Add Class
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="divide-y">
          {classes.map(c => (
            <div key={c.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">{c.sections?.length || 0} sections</p>
              </div>
              <button onClick={() => openEdit(c)} className="rounded p-1.5 hover:bg-gray-100 text-gray-400">
                <Edit2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Class' : 'Add Class'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Class Name *</label><input value={form.name} onChange={e => setForm({ name: e.target.value })} required className={inputClass} placeholder="e.g. Class 1, KG, Nursery" /></div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
