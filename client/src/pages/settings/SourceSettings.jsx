import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roleUtils';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import CampusTypeTabs from '../../components/ui/CampusTypeTabs';

export default function SourceSettings() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [campusType, setCampusType] = useState(user?.campus?.campus_type || 'school');

  useEffect(() => { load(); }, [campusType]);

  async function load() {
    setLoading(true);
    try {
      const params = isSuperAdmin(user) ? { campus_type: campusType } : {};
      setSources((await api.get('/settings/inquiry-sources', { params })).data);
    }
    finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setName(''); setModal(true); }
  function openEdit(s) { setEditing(s); setName(s.name); setModal(true); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = isSuperAdmin(user) ? { name, campus_type: campusType } : { name };
      if (editing) await api.put(`/settings/inquiry-sources/${editing.id}`, payload);
      else await api.post('/settings/inquiry-sources', payload);
      load(); setModal(false);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    try {
      await api.delete(`/settings/inquiry-sources/${deleteTarget.id}`);
      load();
    } catch (err) { console.error(err); }
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
        <h2 className="text-lg font-semibold">Inquiry Sources</h2>
        <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Add Source</button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y">
        {sources.map(s => (
          <div key={s.id} className="flex items-center justify-between p-4">
            <span className="text-sm font-medium text-gray-900">{s.name}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(s)} className="rounded p-1.5 hover:bg-gray-100 text-gray-400"><Edit2 className="h-4 w-4" /></button>
              <button onClick={() => setDeleteTarget(s)} className="rounded p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Source' : 'Add Source'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Source Name *</label><input value={name} onChange={e => setName(e.target.value)} required className={inputClass} /></div>
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
        title="Delete Source"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
