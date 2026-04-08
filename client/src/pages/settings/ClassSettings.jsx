import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roleUtils';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import CampusTypeTabs from '../../components/ui/CampusTypeTabs';

export default function ClassSettings() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', campus_id: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState('class');
  const [campusType, setCampusType] = useState(user?.campus?.campus_type || 'school');

  // Section state
  const [expandedClass, setExpandedClass] = useState(null);
  const [sectionModal, setSectionModal] = useState(false);
  const [sectionForm, setSectionForm] = useState({ name: '' });
  const [sectionParentId, setSectionParentId] = useState(null);
  const [savingSection, setSavingSection] = useState(false);

  useEffect(() => { load(); }, [campusType]);

  const filteredCampuses = isSuperAdmin(user)
    ? campuses.filter(c => (c.campus_type || 'school') === campusType)
    : campuses;

  async function load() {
    setLoading(true);
    try {
      const params = isSuperAdmin(user) ? { campus_type: campusType } : {};
      const [classRes, campusRes] = await Promise.all([
        api.get('/classes', { params }),
        api.get('/campuses'),
      ]);
      setClasses(classRes.data);
      setCampuses(campusRes.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', campus_id: filteredCampuses[0]?.id || '' });
    setModal(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({ name: c.name, campus_id: c.campus_id || c.campus?.id || '' });
    setModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name };
      if (isSuperAdmin(user)) {
        payload.campus_id = form.campus_id ? parseInt(form.campus_id, 10) : null;
      }

      if (editing) {
        await api.put(`/classes/${editing.id}`, payload);
      } else {
        await api.post('/classes', payload);
      }
      load();
      setModal(false);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    try {
      if (deleteType === 'section') {
        await api.delete(`/classes/${deleteTarget.class_level_id}/sections/${deleteTarget.id}`);
      } else {
        await api.delete(`/classes/${deleteTarget.id}`);
      }
      load();
    } catch (err) { console.error(err); }
    setDeleteTarget(null);
  }

  function openSectionCreate(classId) {
    setSectionParentId(classId);
    setSectionForm({ name: '' });
    setSectionModal(true);
  }

  async function handleSectionSubmit(e) {
    e.preventDefault();
    setSavingSection(true);
    try {
      const parentClass = classes.find(c => c.id === sectionParentId);
      const payload = { ...sectionForm };
      if (isSuperAdmin(user)) {
        payload.campus_id = parentClass?.campus_id || parentClass?.campus?.id || null;
      }
      await api.post(`/classes/${sectionParentId}/sections`, payload);
      load();
      setSectionModal(false);
    } finally { setSavingSection(false); }
  }

  function toggleExpand(classId) {
    setExpandedClass(prev => prev === classId ? null : classId);
  }

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

  return (
    <div>
      {isSuperAdmin(user) && (
        <CampusTypeTabs value={campusType} onChange={setCampusType} className="mb-4" />
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Class Levels</h2>
        <button
          onClick={openCreate}
          disabled={isSuperAdmin(user) && filteredCampuses.length === 0}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Add Class
        </button>
      </div>

      {isSuperAdmin(user) && filteredCampuses.length === 0 && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
          No active {campusType} campus found. Add a campus first to manage classes.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="divide-y">
          {classes.map(c => (
            <div key={c.id}>
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleExpand(c.id)} className="rounded p-1 hover:bg-gray-100 text-gray-400">
                    {expandedClass === c.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div>
                    <p className="font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.sections?.length || 0} sections</p>
                    {isSuperAdmin(user) && c.campus?.name && (
                      <p className="text-xs text-gray-400">Campus: {c.campus.name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openSectionCreate(c.id)} className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 font-medium">
                    + Section
                  </button>
                  <button onClick={() => openEdit(c)} className="rounded p-1.5 hover:bg-gray-100 text-gray-400">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setDeleteTarget(c); setDeleteType('class'); }} className="rounded p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {expandedClass === c.id && c.sections?.length > 0 && (
                <div className="bg-gray-50 border-t border-gray-100 px-4 py-2">
                  {c.sections.map(s => (
                    <div key={s.id} className="flex items-center justify-between py-2 px-4">
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <button onClick={() => { setDeleteTarget({ ...s, class_level_id: c.id }); setDeleteType('section'); }} className="rounded p-1 hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Class' : 'Add Class'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Class Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputClass} placeholder="e.g. Class 1, KG, Nursery" /></div>
          {isSuperAdmin(user) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campus *</label>
              <select value={form.campus_id} onChange={e => setForm(p => ({ ...p, campus_id: e.target.value }))} required className={inputClass}>
                <option value="">Select campus</option>
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

      <Modal isOpen={sectionModal} onClose={() => setSectionModal(false)} title="Add Section" size="sm">
        <form onSubmit={handleSectionSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Section Name *</label><input value={sectionForm.name} onChange={e => setSectionForm({ name: e.target.value })} required className={inputClass} placeholder="e.g. A, B, C" /></div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setSectionModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingSection} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">{savingSection ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteType === 'section' ? 'Delete Section' : 'Delete Class'}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? It will be deactivated.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
