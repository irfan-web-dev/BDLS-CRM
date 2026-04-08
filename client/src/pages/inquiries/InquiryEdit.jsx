import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin, isAdminOrAbove } from '../../utils/roleUtils';
import { RELATIONSHIPS, GENDERS, SESSION_PREFERENCES, PRIORITIES, LAHORE_AREAS } from '../../utils/constants';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function InquiryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [campuses, setCampuses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sources, setSources] = useState([]);
  const [tags, setTags] = useState([]);
  const [staff, setStaff] = useState([]);

  const [areaOptions, setAreaOptions] = useState(LAHORE_AREAS);
  const [areaSearch, setAreaSearch] = useState('');
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const areaRef = useRef(null);

  const [form, setForm] = useState({
    parent_name: '', relationship: 'father', parent_phone: '', parent_whatsapp: '',
    parent_email: '', city: 'Lahore', area: '', student_name: '', date_of_birth: '',
    gender: '', student_phone: '', class_applying_id: '', current_school: '',
    previous_institute: '', previous_marks_obtained: '', previous_total_marks: '', previous_major_subjects: '',
    special_needs: '', source_id: '', referral_parent_name: '',
    campus_id: user?.campus_id || '', package_name: '', package_amount: '', session_preference: '', assigned_staff_id: '',
    priority: 'normal', notes: '', tag_ids: [],
  });

  useEffect(() => {
    function handleClickOutside(e) {
      if (areaRef.current && !areaRef.current.contains(e.target)) setShowAreaDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAreas = areaOptions.filter(a => a.toLowerCase().includes(areaSearch.toLowerCase()));

  function handleAreaSelect(area) {
    setForm(prev => ({ ...prev, area }));
    setAreaSearch(area);
    setShowAreaDropdown(false);
  }

  function handleAreaInput(value) {
    setAreaSearch(value);
    setForm(prev => ({ ...prev, area: value }));
    setShowAreaDropdown(true);
  }

  function handleAddArea() {
    if (areaSearch.trim() && !areaOptions.some(a => a.toLowerCase() === areaSearch.trim().toLowerCase())) {
      setAreaOptions(prev => [...prev, areaSearch.trim()].sort());
    }
    setForm(prev => ({ ...prev, area: areaSearch.trim() }));
    setShowAreaDropdown(false);
  }

  const selectedCampusId = isSuperAdmin(user) ? form.campus_id : user?.campus_id;
  const selectedCampus = campuses.find(c => String(c.id) === String(selectedCampusId));
  const isCollegeFlow = selectedCampus?.campus_type === 'college';
  const isSingleCampus = campuses.length === 1;

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    loadScopedOptions();
  }, [form.campus_id, user?.role, campuses]);

  useEffect(() => {
    if (form.class_applying_id && !classes.some(c => String(c.id) === String(form.class_applying_id))) {
      setForm(prev => ({ ...prev, class_applying_id: '' }));
    }
  }, [classes]);

  async function loadData() {
    try {
      const [inqRes, campRes, tagRes] = await Promise.all([
        api.get(`/inquiries/${id}`),
        api.get('/campuses'),
        api.get('/settings/inquiry-tags'),
      ]);

      const inq = inqRes.data;

      setForm({
        parent_name: inq.parent_name || '', relationship: inq.relationship || 'father',
        parent_phone: inq.parent_phone || '', parent_whatsapp: inq.parent_whatsapp || '',
        parent_email: inq.parent_email || '', city: inq.city || 'Lahore', area: inq.area || '',
        student_name: inq.student_name || '', date_of_birth: inq.date_of_birth || '',
        gender: inq.gender || '', student_phone: inq.student_phone || '',
        class_applying_id: inq.class_applying_id || '', current_school: inq.current_school || '',
        previous_institute: inq.previous_institute || '',
        previous_marks_obtained: inq.previous_marks_obtained || '',
        previous_total_marks: inq.previous_total_marks || '',
        previous_major_subjects: inq.previous_major_subjects || '',
        special_needs: inq.special_needs || '', source_id: inq.source_id || '',
        referral_parent_name: inq.referral_parent_name || '', campus_id: inq.campus_id || '',
        package_name: inq.package_name || '', package_amount: inq.package_amount || '',
        session_preference: inq.session_preference || '', assigned_staff_id: inq.assigned_staff_id || '',
        priority: inq.priority || 'normal', notes: inq.notes || '',
        tag_ids: inq.tags?.map(t => t.id) || [],
      });

      setAreaSearch(inq.area || '');
      setCampuses(campRes.data);
      setTags(tagRes.data);

      if (isSuperAdmin(user) && campRes.data.length === 1) {
        const onlyCampusId = String(campRes.data[0].id);
        setForm(prev => ({ ...prev, campus_id: onlyCampusId }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadScopedOptions() {
    try {
      let classRes;
      let staffRes;
      let sourceRes;

      if (isSuperAdmin(user)) {
        if (form.campus_id) {
          const selected = campuses.find(c => String(c.id) === String(form.campus_id));
          const sourceParams = selected?.campus_type ? { campus_type: selected.campus_type } : {};

          [classRes, staffRes] = await Promise.all([
            api.get('/classes', { params: { campus_id: form.campus_id } }),
            isAdminOrAbove(user)
              ? api.get('/users/staff/available', { params: { campus_id: form.campus_id } })
              : Promise.resolve({ data: [] }),
          ]);
          sourceRes = await api.get('/settings/inquiry-sources', { params: sourceParams });
          setClasses(classRes.data);
          setStaff(staffRes?.data || []);
          setSources(sourceRes.data || []);
        } else {
          setClasses([]);
          setStaff([]);
          setSources([]);
        }
      } else {
        [classRes, staffRes, sourceRes] = await Promise.all([
          api.get('/classes'),
          isAdminOrAbove(user)
            ? api.get('/users/staff/available')
            : Promise.resolve({ data: [] }),
          api.get('/settings/inquiry-sources'),
        ]);
        setClasses(classRes.data);
        setStaff(staffRes?.data || []);
        setSources(sourceRes.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleTagToggle(tagId) {
    setForm(prev => ({
      ...prev,
      tag_ids: prev.tag_ids.includes(tagId) ? prev.tag_ids.filter(i => i !== tagId) : [...prev.tag_ids, tagId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = { ...form };
      Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
      if (data.class_applying_id) data.class_applying_id = parseInt(data.class_applying_id, 10);
      if (data.source_id) data.source_id = parseInt(data.source_id, 10);
      if (data.campus_id) data.campus_id = parseInt(data.campus_id, 10);
      if (data.assigned_staff_id) data.assigned_staff_id = parseInt(data.assigned_staff_id, 10);
      if (data.previous_marks_obtained) data.previous_marks_obtained = parseInt(data.previous_marks_obtained, 10);
      if (data.previous_total_marks) data.previous_total_marks = parseInt(data.previous_total_marks, 10);
      if (data.package_amount) data.package_amount = parseInt(data.package_amount, 10);
      if (!isCollegeFlow) {
        data.package_name = null;
        data.package_amount = null;
      }

      await api.put(`/inquiries/${id}`, data);
      navigate(`/inquiries/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update inquiry');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  function renderAreaInput() {
    return (
      <div ref={areaRef} className="relative">
        <label className={labelClass}>Area</label>
        <input value={areaSearch} onChange={(e) => handleAreaInput(e.target.value)} onFocus={() => setShowAreaDropdown(true)} className={inputClass} placeholder="Type to search or add..." />
        {showAreaDropdown && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filteredAreas.map(area => (
              <button key={area} type="button" onClick={() => handleAreaSelect(area)} className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 hover:text-primary-700">{area}</button>
            ))}
            {areaSearch.trim() && !areaOptions.some(a => a.toLowerCase() === areaSearch.trim().toLowerCase()) && (
              <button type="button" onClick={handleAddArea} className="w-full text-left px-3 py-2 text-sm text-primary-600 font-medium hover:bg-primary-50 border-t border-gray-100">+ Add "{areaSearch.trim()}"</button>
            )}
            {filteredAreas.length === 0 && !areaSearch.trim() && (
              <div className="px-3 py-2 text-sm text-gray-400">No areas found</div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderStudentSection() {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Student Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelClass}>Student Name *</label><input name="student_name" value={form.student_name} onChange={handleChange} required className={inputClass} /></div>
          <div><label className={labelClass}>Date of Birth</label><input name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} className={inputClass} /></div>
          <div><label className={labelClass}>Gender</label><select name="gender" value={form.gender} onChange={handleChange} className={inputClass}><option value="">Select</option>{GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
          <div>
            <label className={labelClass}>{isCollegeFlow ? 'Discipline *' : 'Class Applying For *'}</label>
            <select name="class_applying_id" value={form.class_applying_id} onChange={handleChange} required className={inputClass}>
              <option value="">{isSuperAdmin(user) && !form.campus_id ? 'Select campus first' : (isCollegeFlow ? 'Select discipline' : 'Select class')}</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {isCollegeFlow ? (
            <>
              <div><label className={labelClass}>Student Phone</label><input name="student_phone" value={form.student_phone} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Priority</label><select name="priority" value={form.priority} onChange={handleChange} className={inputClass}>{PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div><label className={labelClass}>Previous Institute</label><input name="previous_institute" value={form.previous_institute} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Major Subjects</label><input name="previous_major_subjects" value={form.previous_major_subjects} onChange={handleChange} className={inputClass} placeholder="e.g. Biology, Chemistry" /></div>
              <div><label className={labelClass}>Marks Obtained</label><input type="number" min="0" name="previous_marks_obtained" value={form.previous_marks_obtained} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Total Marks</label><input type="number" min="0" name="previous_total_marks" value={form.previous_total_marks} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>City</label><input name="city" value={form.city} onChange={handleChange} className={inputClass} /></div>
              {renderAreaInput()}
            </>
          ) : (
            <div><label className={labelClass}>Current School</label><input name="current_school" value={form.current_school} onChange={handleChange} className={inputClass} /></div>
          )}

          <div className="sm:col-span-2"><label className={labelClass}>Special Needs</label><textarea name="special_needs" value={form.special_needs} onChange={handleChange} rows={2} className={inputClass} /></div>
        </div>
      </div>
    );
  }

  function renderParentSection() {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Parent Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelClass}>Parent Full Name *</label><input name="parent_name" value={form.parent_name} onChange={handleChange} required className={inputClass} /></div>
          <div><label className={labelClass}>Relationship *</label><select name="relationship" value={form.relationship} onChange={handleChange} className={inputClass}>{RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
          <div><label className={labelClass}>Parent Phone *</label><input name="parent_phone" value={form.parent_phone} onChange={handleChange} required className={inputClass} /></div>
          <div><label className={labelClass}>WhatsApp</label><input name="parent_whatsapp" value={form.parent_whatsapp} onChange={handleChange} className={inputClass} /></div>

          {!isCollegeFlow && (
            <>
              <div><label className={labelClass}>Email</label><input name="parent_email" value={form.parent_email} onChange={handleChange} className={inputClass} placeholder="Optional" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>City</label><input name="city" value={form.city} onChange={handleChange} className={inputClass} /></div>
                {renderAreaInput()}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Edit Inquiry" subtitle={`Editing inquiry for ${form.student_name}`} />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {isCollegeFlow ? renderStudentSection() : renderParentSection()}
        {isCollegeFlow ? renderParentSection() : renderStudentSection()}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Inquiry Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelClass}>Source</label><select name="source_id" value={form.source_id} onChange={handleChange} className={inputClass}><option value="">Select</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className={labelClass}>Referral Parent</label><input name="referral_parent_name" value={form.referral_parent_name} onChange={handleChange} className={inputClass} /></div>
            {isCollegeFlow ? (
              <>
                <div>
                  <label className={labelClass}>Campus</label>
                  <select name="campus_id" value={form.campus_id} onChange={handleChange} disabled={!isSuperAdmin(user) || isSingleCampus} className={inputClass}>
                    <option value="">Select</option>
                    {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Package</label><input name="package_name" value={form.package_name} onChange={handleChange} className={inputClass} placeholder="e.g. Merit Scholarship" /></div>
                <div><label className={labelClass}>Package Amount</label><input type="number" min="0" name="package_amount" value={form.package_amount} onChange={handleChange} className={inputClass} placeholder="e.g. 50000" /></div>
              </>
            ) : (
              isSuperAdmin(user) && (
                <div>
                  <label className={labelClass}>Campus</label>
                  <select name="campus_id" value={form.campus_id} onChange={handleChange} disabled={isSingleCampus} className={inputClass}>
                    <option value="">Select</option>
                    {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )
            )}
            <div><label className={labelClass}>Session</label><select name="session_preference" value={form.session_preference} onChange={handleChange} className={inputClass}><option value="">Select</option>{SESSION_PREFERENCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            {isAdminOrAbove(user) && <div><label className={labelClass}>Assigned Staff</label><select name="assigned_staff_id" value={form.assigned_staff_id} onChange={handleChange} className={inputClass}><option value="">Select</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
            {!isCollegeFlow && <div><label className={labelClass}>Priority</label><select name="priority" value={form.priority} onChange={handleChange} className={inputClass}>{PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <button key={tag.id} type="button" onClick={() => handleTagToggle(tag.id)} className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${form.tag_ids.includes(tag.id) ? 'bg-primary-100 text-primary-700 border-2 border-primary-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'}`}>{tag.name}</button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Notes</h3>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className={inputClass} />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(`/inquiries/${id}`)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
}
