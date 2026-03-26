import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin, isAdminOrAbove } from '../../utils/roleUtils';
import { RELATIONSHIPS, GENDERS, SESSION_PREFERENCES, PRIORITIES } from '../../utils/constants';
import PageHeader from '../../components/ui/PageHeader';

export default function InquiryCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [campuses, setCampuses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sources, setSources] = useState([]);
  const [tags, setTags] = useState([]);
  const [staff, setStaff] = useState([]);

  const [form, setForm] = useState({
    parent_name: '', relationship: 'father', parent_phone: '',
    parent_whatsapp: '', parent_email: '', city: '', area: '',
    student_name: '', date_of_birth: '', gender: '',
    class_applying_id: '', current_school: '', special_needs: '',
    source_id: '', referral_parent_name: '', campus_id: user?.campus_id || '',
    session_preference: '', assigned_staff_id: '', priority: 'normal',
    notes: '', tag_ids: [],
  });

  useEffect(() => {
    loadOptions();
  }, []);

  async function loadOptions() {
    try {
      const [campRes, classRes, srcRes, tagRes] = await Promise.all([
        api.get('/campuses'),
        api.get('/classes'),
        api.get('/settings/inquiry-sources'),
        api.get('/settings/inquiry-tags'),
      ]);
      setCampuses(campRes.data);
      setClasses(classRes.data);
      setSources(srcRes.data);
      setTags(tagRes.data);

      if (isAdminOrAbove(user)) {
        const staffRes = await api.get('/users/staff/available');
        setStaff(staffRes.data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleTagToggle(tagId) {
    setForm(prev => ({
      ...prev,
      tag_ids: prev.tag_ids.includes(tagId)
        ? prev.tag_ids.filter(id => id !== tagId)
        : [...prev.tag_ids, tagId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = { ...form };
      // Clean empty strings
      Object.keys(data).forEach(k => {
        if (data[k] === '') data[k] = null;
      });
      data.tag_ids = form.tag_ids;
      if (data.class_applying_id) data.class_applying_id = parseInt(data.class_applying_id);
      if (data.source_id) data.source_id = parseInt(data.source_id);
      if (data.campus_id) data.campus_id = parseInt(data.campus_id);
      if (data.assigned_staff_id) data.assigned_staff_id = parseInt(data.assigned_staff_id);

      const res = await api.post('/inquiries', data);
      navigate(`/inquiries/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create inquiry');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="New Inquiry" subtitle="Record a new admission inquiry" />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Parent Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Parent Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Parent Full Name *</label>
              <input name="parent_name" value={form.parent_name} onChange={handleChange} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Relationship *</label>
              <select name="relationship" value={form.relationship} onChange={handleChange} className={inputClass}>
                {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Phone Number *</label>
              <input name="parent_phone" value={form.parent_phone} onChange={handleChange} required className={inputClass} placeholder="03XX-XXXXXXX" />
            </div>
            <div>
              <label className={labelClass}>WhatsApp Number</label>
              <input name="parent_whatsapp" value={form.parent_whatsapp} onChange={handleChange} className={inputClass} placeholder="If different from phone" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input name="parent_email" type="email" value={form.parent_email} onChange={handleChange} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>City</label>
                <input name="city" value={form.city} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Area</label>
                <input name="area" value={form.area} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Student Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Student Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Student Full Name *</label>
              <input name="student_name" value={form.student_name} onChange={handleChange} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date of Birth</label>
              <input name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Gender</label>
              <select name="gender" value={form.gender} onChange={handleChange} className={inputClass}>
                <option value="">Select</option>
                {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Class Applying For *</label>
              <select name="class_applying_id" value={form.class_applying_id} onChange={handleChange} required className={inputClass}>
                <option value="">Select class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Current School</label>
              <input name="current_school" value={form.current_school} onChange={handleChange} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Special Needs / Notes</label>
              <textarea name="special_needs" value={form.special_needs} onChange={handleChange} rows={2} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Inquiry Details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Inquiry Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>How They Heard About Us</label>
              <select name="source_id" value={form.source_id} onChange={handleChange} className={inputClass}>
                <option value="">Select source</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Referral Parent Name</label>
              <input name="referral_parent_name" value={form.referral_parent_name} onChange={handleChange} className={inputClass} placeholder="If referred by existing parent" />
            </div>
            {isSuperAdmin(user) && (
              <div>
                <label className={labelClass}>Campus *</label>
                <select name="campus_id" value={form.campus_id} onChange={handleChange} required className={inputClass}>
                  <option value="">Select campus</option>
                  {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Session Preference</label>
              <select name="session_preference" value={form.session_preference} onChange={handleChange} className={inputClass}>
                <option value="">Select</option>
                {SESSION_PREFERENCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {isAdminOrAbove(user) && (
              <div>
                <label className={labelClass}>Assign to Staff</label>
                <select name="assigned_staff_id" value={form.assigned_staff_id} onChange={handleChange} className={inputClass}>
                  <option value="">Select staff</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Priority</label>
              <select name="priority" value={form.priority} onChange={handleChange} className={inputClass}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleTagToggle(tag.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  form.tag_ids.includes(tag.id)
                    ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Additional Notes</h3>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className={inputClass} placeholder="Any additional notes about this inquiry..." />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/inquiries')} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Inquiry'}
          </button>
        </div>
      </form>
    </div>
  );
}
