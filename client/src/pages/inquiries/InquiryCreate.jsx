import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin, isAdminOrAbove } from '../../utils/roleUtils';
import { RELATIONSHIPS, GENDERS, SESSION_PREFERENCES, PRIORITIES, LAHORE_AREAS } from '../../utils/constants';
import PageHeader from '../../components/ui/PageHeader';
import CampusTypeTabs from '../../components/ui/CampusTypeTabs';

function createInquiryFormState(today, campusId = '', manualMode = false) {
  return {
    parent_name: '', relationship: manualMode ? '' : 'father', parent_phone: '',
    parent_whatsapp: '', parent_email: '', city: manualMode ? '' : 'Lahore', area: '',
    student_name: '', date_of_birth: '', gender: '', student_phone: '',
    class_applying_id: '', current_school: '', previous_institute: '',
    previous_marks_obtained: '', previous_total_marks: '', previous_major_subjects: '',
    special_needs: '',
    inquiry_date: manualMode ? '' : today,
    source_id: '', referral_parent_name: '', campus_id: campusId || '',
    package_name: '', package_amount: '', inquiry_form_taken: '',
    session_preference: '', assigned_staff_id: '', priority: manualMode ? '' : 'normal',
    notes: '', tag_ids: [],
  };
}

const SIBLING_SHARED_FIELDS = [
  'parent_name',
  'relationship',
  'parent_phone',
  'parent_whatsapp',
  'parent_email',
  'city',
  'area',
  'source_id',
  'session_preference',
  'assigned_staff_id',
  'priority',
];
const SIBLING_SHARED_FIELD_SET = new Set(SIBLING_SHARED_FIELDS);
const INQUIRY_DRAFT_STORAGE_PREFIX = 'bdls_inquiry_create_draft_v1';
const INQUIRY_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getInquiryDraftStorageKey(userId, manualMode = false) {
  return `${INQUIRY_DRAFT_STORAGE_PREFIX}:${manualMode ? 'manual' : 'default'}:${String(userId || 'guest')}`;
}

export default function InquiryCreate({ manualMode = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
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
  const [superAdminCampusType, setSuperAdminCampusType] = useState(user?.campus?.campus_type || 'school');

  useEffect(() => {
    function handleClickOutside(e) {
      if (areaRef.current && !areaRef.current.contains(e.target)) setShowAreaDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAreas = areaOptions.filter(a => a.toLowerCase().includes(areaSearch.toLowerCase()));

  function handleAreaSelect(area) {
    setForm(prev => {
      const next = { ...prev, area };
      syncSecondFormSharedFrom(next);
      return next;
    });
    setAreaSearch(area);
    setShowAreaDropdown(false);
  }

  function handleAreaInput(value) {
    setAreaSearch(value);
    setForm(prev => {
      const next = { ...prev, area: value };
      syncSecondFormSharedFrom(next);
      return next;
    });
    setShowAreaDropdown(true);
  }

  function handleAddArea() {
    if (areaSearch.trim() && !areaOptions.some(a => a.toLowerCase() === areaSearch.trim().toLowerCase())) {
      setAreaOptions(prev => [...prev, areaSearch.trim()].sort());
    }
    setForm(prev => {
      const next = { ...prev, area: areaSearch.trim() };
      syncSecondFormSharedFrom(next);
      return next;
    });
    setShowAreaDropdown(false);
  }

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState(() => createInquiryFormState(today, user?.campus_id || '', manualMode));
  const [secondFormEnabled, setSecondFormEnabled] = useState(false);
  const [secondForm, setSecondForm] = useState(() => createInquiryFormState(today, user?.campus_id || '', manualMode));
  const [siblingEnabled, setSiblingEnabled] = useState(false);
  const [selectedSibling, setSelectedSibling] = useState(null);
  const [siblingQuery, setSiblingQuery] = useState('');
  const [siblingResults, setSiblingResults] = useState([]);
  const [siblingSearching, setSiblingSearching] = useState(false);
  const draftHydratedRef = useRef(false);

  useEffect(() => {
    setAreaSearch(form.area || '');
  }, [form.area]);

  useEffect(() => {
    if (!user?.id || draftHydratedRef.current) return;

    try {
      const raw = localStorage.getItem(getInquiryDraftStorageKey(user.id, manualMode));
      if (!raw) {
        draftHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed?.savedAt || 0);
      if (!savedAt || (Date.now() - savedAt) > INQUIRY_DRAFT_TTL_MS) {
        localStorage.removeItem(getInquiryDraftStorageKey(user.id, manualMode));
        draftHydratedRef.current = true;
        return;
      }

      if (parsed?.form && typeof parsed.form === 'object') {
        setForm(prev => ({ ...prev, ...parsed.form }));
      }
      if (parsed?.secondForm && typeof parsed.secondForm === 'object') {
        setSecondForm(prev => ({ ...prev, ...parsed.secondForm }));
      }
      setSecondFormEnabled(Boolean(parsed?.secondFormEnabled));
      setSiblingEnabled(Boolean(parsed?.siblingEnabled));
      setSelectedSibling(parsed?.selectedSibling || null);
      setSiblingQuery(typeof parsed?.siblingQuery === 'string' ? parsed.siblingQuery : '');
      if (typeof parsed?.superAdminCampusType === 'string') {
        setSuperAdminCampusType(parsed.superAdminCampusType);
      }
      if (typeof parsed?.areaSearch === 'string') {
        setAreaSearch(parsed.areaSearch);
      }
    } catch (err) {
      console.error('Failed to restore inquiry draft:', err);
    } finally {
      draftHydratedRef.current = true;
    }
  }, [user?.id, manualMode]);

  const selectedCampusId = isSuperAdmin(user) ? form.campus_id : user?.campus_id;
  const selectedCampus = campuses.find(c => String(c.id) === String(selectedCampusId));
  const superAdminCampusesByType = campuses.filter(c => c.campus_type === superAdminCampusType);
  const isCollegeFlow = isSuperAdmin(user)
    ? superAdminCampusType === 'college'
    : selectedCampus?.campus_type === 'college';
  const isSingleCampus = isSuperAdmin(user)
    ? superAdminCampusesByType.length <= 1
    : campuses.length === 1;
  const isSuperAdminWithoutCampus = isSuperAdmin(user) && !form.campus_id;
  const primarySharedLocked = siblingEnabled && Boolean(selectedSibling);

  useEffect(() => {
    if (!manualMode) return;
    setSecondFormEnabled(false);
    setSiblingEnabled(false);
    setSelectedSibling(null);
    setSiblingQuery('');
    setSiblingResults([]);
  }, [manualMode]);

  useEffect(() => {
    if (!user?.id || !draftHydratedRef.current) return;

    try {
      localStorage.setItem(
        getInquiryDraftStorageKey(user.id, manualMode),
        JSON.stringify({
          savedAt: Date.now(),
          form,
          secondFormEnabled,
          secondForm,
          siblingEnabled,
          selectedSibling,
          siblingQuery,
          superAdminCampusType,
          areaSearch,
        }),
      );
    } catch (err) {
      console.error('Failed to persist inquiry draft:', err);
    }
  }, [
    user?.id,
    form,
    secondFormEnabled,
    secondForm,
    siblingEnabled,
    selectedSibling,
    siblingQuery,
    superAdminCampusType,
    areaSearch,
    manualMode,
  ]);

  useEffect(() => {
    loadBaseOptions();
  }, []);

  useEffect(() => {
    loadScopedOptions();
  }, [form.campus_id, user?.role, campuses]);

  useEffect(() => {
    if (form.class_applying_id && !classes.some(c => String(c.id) === String(form.class_applying_id))) {
      setForm(prev => ({ ...prev, class_applying_id: '' }));
    }
  }, [classes]);

  useEffect(() => {
    if (secondForm.class_applying_id && !classes.some(c => String(c.id) === String(secondForm.class_applying_id))) {
      setSecondForm(prev => ({ ...prev, class_applying_id: '' }));
    }
  }, [classes, secondForm.class_applying_id]);

  useEffect(() => {
    if (!isSuperAdmin(user)) return;

    const selectedCampusForType = campuses.find(c => String(c.id) === String(form.campus_id));
    if (selectedCampusForType?.campus_type && selectedCampusForType.campus_type !== superAdminCampusType) {
      setSuperAdminCampusType(selectedCampusForType.campus_type);
    }
  }, [campuses, form.campus_id, superAdminCampusType, user]);

  useEffect(() => {
    if (!isSuperAdmin(user)) return;

    const scopedCampuses = campuses.filter(c => c.campus_type === superAdminCampusType);
    if (!scopedCampuses.length) {
      if (form.campus_id) {
        setForm(prev => ({ ...prev, campus_id: '' }));
      }
      return;
    }

    const currentCampusInScope = scopedCampuses.some(c => String(c.id) === String(form.campus_id));
    if (!currentCampusInScope) {
      const autoCampus = scopedCampuses.length === 1 ? String(scopedCampuses[0].id) : '';
      setForm(prev => ({ ...prev, campus_id: autoCampus }));
    }
  }, [campuses, form.campus_id, superAdminCampusType, user]);

  useEffect(() => {
    const normalizedCampusId = isSuperAdmin(user) ? form.campus_id : (user?.campus_id || '');
    setSecondForm(prev => ({
      ...prev,
      campus_id: normalizedCampusId || '',
    }));
  }, [form.campus_id, user?.campus_id, user?.role]);

  useEffect(() => {
    if (!siblingEnabled) {
      setSiblingResults([]);
      setSiblingQuery('');
      setSelectedSibling(null);
      return;
    }

    const activeCampusId = isSuperAdmin(user) ? form.campus_id : user?.campus_id;
    if (!activeCampusId || siblingQuery.trim().length < 2) {
      setSiblingResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSiblingSearching(true);
        const res = await api.get('/inquiries/sibling-search', {
          params: {
            q: siblingQuery.trim(),
            campus_id: activeCampusId,
            limit: 10,
          },
        });
        setSiblingResults(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Sibling search failed:', err);
        setSiblingResults([]);
      } finally {
        setSiblingSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [siblingQuery, siblingEnabled, form.campus_id, user?.campus_id, user?.role]);

  useEffect(() => {
    if (!siblingEnabled || !secondFormEnabled) return;

    const sharedPatch = {};
    SIBLING_SHARED_FIELDS.forEach((key) => {
      sharedPatch[key] = form[key] ?? '';
    });

    setSecondForm((prev) => ({
      ...prev,
      ...sharedPatch,
      campus_id: isSuperAdmin(user) ? (form.campus_id || '') : (user?.campus_id || prev.campus_id || ''),
    }));
  }, [
    siblingEnabled,
    secondFormEnabled,
    form.parent_name,
    form.relationship,
    form.parent_phone,
    form.parent_whatsapp,
    form.parent_email,
    form.city,
    form.area,
    form.source_id,
    form.session_preference,
    form.assigned_staff_id,
    form.priority,
    form.campus_id,
    user?.campus_id,
    user?.role,
  ]);

  function syncSecondFormSharedFrom(nextForm) {
    if (!siblingEnabled || !secondFormEnabled) return;

    const sharedPatch = {};
    SIBLING_SHARED_FIELDS.forEach((key) => {
      sharedPatch[key] = nextForm[key] ?? '';
    });

    setSecondForm((prev) => ({
      ...prev,
      ...sharedPatch,
      campus_id: isSuperAdmin(user) ? (nextForm.campus_id || '') : (user?.campus_id || prev.campus_id || ''),
    }));
  }

  async function loadBaseOptions() {
    try {
      const [campRes, tagRes] = await Promise.all([
        api.get('/campuses'),
        api.get('/settings/inquiry-tags'),
      ]);

      setCampuses(campRes.data);
      setTags(tagRes.data);

      if (isSuperAdmin(user) && campRes.data.length === 1) {
        const onlyCampusId = String(campRes.data[0].id);
        setForm(prev => ({ ...prev, campus_id: onlyCampusId }));
      }
    } catch (err) {
      console.error(err);
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
    const { name, value } = e.target;
    if (isSuperAdmin(user) && name === 'campus_id') {
      const campus = campuses.find(c => String(c.id) === String(value));
      if (campus?.campus_type && campus.campus_type !== superAdminCampusType) {
        setSuperAdminCampusType(campus.campus_type);
      }
      setSelectedSibling(null);
      setSiblingQuery('');
      setSiblingResults([]);
    }
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (SIBLING_SHARED_FIELD_SET.has(name)) {
        syncSecondFormSharedFrom(next);
      }
      return next;
    });
  }

  function handleSecondChange(e) {
    const { name, value } = e.target;
    setSecondForm(prev => ({ ...prev, [name]: value }));
  }

  function toggleSecondForm() {
    if (secondFormEnabled) {
      setSecondFormEnabled(false);
      setSecondForm(createInquiryFormState(today, isSuperAdmin(user) ? form.campus_id : (user?.campus_id || ''), manualMode));
      return;
    }

    setSecondFormEnabled(true);
    setSecondForm(prev => ({
      ...createInquiryFormState(today, isSuperAdmin(user) ? form.campus_id : (user?.campus_id || ''), manualMode),
      parent_name: form.parent_name || prev.parent_name,
      relationship: form.relationship || prev.relationship,
      parent_phone: form.parent_phone || prev.parent_phone,
      parent_whatsapp: form.parent_whatsapp || prev.parent_whatsapp,
      parent_email: form.parent_email || prev.parent_email,
      city: form.city || prev.city,
      area: form.area || prev.area,
      source_id: form.source_id || prev.source_id,
      session_preference: form.session_preference || prev.session_preference,
      assigned_staff_id: form.assigned_staff_id || prev.assigned_staff_id,
      priority: form.priority || prev.priority,
    }));
  }

  function applySiblingSharedFields(siblingData) {
    if (!siblingData) return;
    const patch = {};
    SIBLING_SHARED_FIELDS.forEach((key) => {
      if (siblingData[key] !== null && siblingData[key] !== undefined && siblingData[key] !== '') {
        patch[key] = String(siblingData[key]);
      }
    });

    if (patch.area && !areaOptions.some(a => a.toLowerCase() === patch.area.toLowerCase())) {
      setAreaOptions(prev => [...prev, patch.area].sort());
    }

    setForm(prev => ({
      ...prev,
      ...patch,
      campus_id: isSuperAdmin(user) ? (String(siblingData.campus_id || prev.campus_id || '')) : prev.campus_id,
    }));

    setSecondForm(prev => ({
      ...prev,
      ...patch,
      campus_id: isSuperAdmin(user) ? (String(siblingData.campus_id || prev.campus_id || '')) : prev.campus_id,
    }));
  }

  async function handleSiblingSelect(candidate) {
    try {
      const res = await api.get(`/inquiries/${candidate.id}`, { params: { include_history: false } });
      const siblingData = res.data || candidate;
      setSelectedSibling({
        id: siblingData.id,
        student_name: siblingData.student_name,
        parent_name: siblingData.parent_name,
        parent_phone: siblingData.parent_phone,
        classApplying: siblingData.classApplying || candidate.classApplying,
      });
      applySiblingSharedFields(siblingData);
      setSiblingResults([]);
      setSiblingQuery(siblingData.student_name || '');
    } catch (err) {
      console.error('Failed to load sibling details:', err);
      setError('Unable to load selected sibling details.');
    }
  }

  function handleSuperAdminCampusTypeChange(nextType) {
    setSuperAdminCampusType(nextType);
    setError('');
    setSiblingEnabled(false);
    setSelectedSibling(null);
    setSiblingQuery('');
    setSiblingResults([]);
    setForm(prev => ({
      ...prev,
      campus_id: '',
      class_applying_id: '',
      source_id: '',
      assigned_staff_id: '',
      inquiry_form_taken: '',
    }));
    setSecondForm(prev => ({
      ...prev,
      campus_id: '',
      class_applying_id: '',
      source_id: '',
      assigned_staff_id: '',
      inquiry_form_taken: '',
    }));
    setClasses([]);
    setStaff([]);
    setSources([]);
  }

  function handleTagToggle(tagId) {
    setForm(prev => ({
      ...prev,
      tag_ids: prev.tag_ids.includes(tagId)
        ? prev.tag_ids.filter(id => id !== tagId)
        : [...prev.tag_ids, tagId],
    }));
  }

  function buildPayload(rawForm, { linkAsSibling = false, siblingReferenceId = null, includeTags = true } = {}) {
    const data = { ...rawForm };

    if (isCollegeFlow) {
      const studentName = String(data.student_name || '').trim();
      const studentPhone = String(data.student_phone || '').trim();
      data.parent_name = String(data.parent_name || '').trim() || studentName || 'Self';
      data.parent_phone = String(data.parent_phone || '').trim() || studentPhone || 'N/A';
      data.relationship = data.relationship || 'other';
      data.parent_whatsapp = String(data.parent_whatsapp || '').trim() || studentPhone || null;
    }

    Object.keys(data).forEach((k) => {
      if (data[k] === '') data[k] = null;
    });

    data.tag_ids = includeTags ? (Array.isArray(rawForm.tag_ids) ? rawForm.tag_ids : []) : [];
    if (data.class_applying_id) data.class_applying_id = parseInt(data.class_applying_id, 10);
    if (data.source_id) data.source_id = parseInt(data.source_id, 10);
    if (data.campus_id) data.campus_id = parseInt(data.campus_id, 10);
    if (data.assigned_staff_id) data.assigned_staff_id = parseInt(data.assigned_staff_id, 10);
    if (data.previous_marks_obtained) data.previous_marks_obtained = parseInt(data.previous_marks_obtained, 10);
    if (data.previous_total_marks) data.previous_total_marks = parseInt(data.previous_total_marks, 10);
    if (data.package_amount) data.package_amount = parseInt(data.package_amount, 10);
    if (data.inquiry_form_taken !== null && data.inquiry_form_taken !== undefined) {
      data.inquiry_form_taken = data.inquiry_form_taken === 'true';
    }

    if (!isCollegeFlow) {
      data.package_name = null;
      data.package_amount = null;
      data.inquiry_form_taken = null;
    }

    data.is_sibling = Boolean(linkAsSibling);
    data.sibling_of_inquiry_id = linkAsSibling ? (siblingReferenceId || null) : null;

    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSuperAdminWithoutCampus) {
        throw new Error('Please select campus first');
      }

      if (!form.student_name || !form.class_applying_id) {
        throw new Error('Please fill student name and class/discipline in Form 1');
      }

      if (!manualMode && secondFormEnabled && (!secondForm.student_name || !secondForm.class_applying_id)) {
        throw new Error('Please fill student name and class/discipline in Form 2');
      }

      if (!manualMode && siblingEnabled && !selectedSibling && !secondFormEnabled) {
        throw new Error('Sibling option ON hai. Existing sibling select karein ya Add Second Form se sibling entry add karein.');
      }

      const selectedSiblingId = selectedSibling?.id || null;
      const primaryPayload = buildPayload(form, {
        linkAsSibling: manualMode ? false : siblingEnabled,
        siblingReferenceId: selectedSiblingId,
        includeTags: true,
      });
      const primaryRes = await api.post('/inquiries', primaryPayload);

      let redirectId = primaryRes?.data?.id;
      if (!manualMode && secondFormEnabled) {
        const secondaryPayload = buildPayload(secondForm, {
          linkAsSibling: manualMode ? false : siblingEnabled,
          siblingReferenceId: selectedSiblingId || primaryRes?.data?.id || null,
          includeTags: false,
        });
        const secondaryRes = await api.post('/inquiries', secondaryPayload);
        redirectId = secondaryRes?.data?.id || redirectId;
      }

      if (user?.id) {
        localStorage.removeItem(getInquiryDraftStorageKey(user.id, manualMode));
      }
      navigate(`/inquiries/${redirectId}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create inquiry');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  function renderCampusSelectorCard() {
    if (!isSuperAdmin(user)) return null;

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Inquiry Context</h3>
        <CampusTypeTabs
          value={superAdminCampusType}
          onChange={handleSuperAdminCampusTypeChange}
          className="mb-4"
        />
        <div>
          <label className={labelClass}>Campus *</label>
          <select
            name="campus_id"
            value={form.campus_id}
            onChange={handleChange}
            required
            disabled={isSingleCampus || superAdminCampusesByType.length === 0}
            className={inputClass}
          >
            <option value="">
              {superAdminCampusesByType.length === 0
                ? `No ${superAdminCampusType} campus available`
                : `Select ${superAdminCampusType} campus`}
            </option>
            {superAdminCampusesByType.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {superAdminCampusesByType.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">
            No active campus found for this type. Add or enable a campus in settings first.
          </p>
        )}
      </div>
    );
  }

  function renderSiblingSection() {
    if (manualMode) return null;

    const activeCampusId = isSuperAdmin(user) ? form.campus_id : user?.campus_id;
    const canSearchSibling = siblingEnabled && Boolean(activeCampusId);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold text-gray-900">Sibling Option</h3>
          <button
            type="button"
            onClick={toggleSecondForm}
            className="text-xs font-medium rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
          >
            {secondFormEnabled ? 'Remove Second Form' : 'Add Second Form'}
          </button>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={siblingEnabled}
            onChange={(e) => {
              setSiblingEnabled(e.target.checked);
              if (!e.target.checked) {
                setSelectedSibling(null);
              }
            }}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Mark this inquiry as sibling and link existing record
        </label>

        {siblingEnabled && (
          <div className="mt-4 space-y-3">
            {!activeCampusId && (
              <p className="text-xs text-amber-700">Select campus first to search sibling records.</p>
            )}

            {!selectedSibling && (
              <div>
                <label className={labelClass}>Search Existing Sibling</label>
                <input
                  value={siblingQuery}
                  onChange={(e) => setSiblingQuery(e.target.value)}
                  disabled={!canSearchSibling}
                  placeholder="Search by student, parent or phone"
                  className={inputClass}
                />
              </div>
            )}

            {siblingSearching && !selectedSibling && (
              <p className="text-xs text-gray-500">Searching sibling records...</p>
            )}

            {selectedSibling && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-800">
                  Linked: {selectedSibling.student_name} (#{selectedSibling.id})
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  Parent: {selectedSibling.parent_name || '-'} | Phone: {selectedSibling.parent_phone || '-'}
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Existing sibling selected. Shared/non-unique fields auto-filled.
                </p>
                <div className="mt-2 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSibling(null);
                      setSiblingQuery('');
                    }}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Change sibling
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSibling(null);
                      setSiblingQuery('');
                    }}
                    className="text-xs font-medium text-red-700 hover:text-red-800"
                  >
                    Remove link
                  </button>
                </div>
              </div>
            )}

            {!selectedSibling && siblingQuery.trim().length >= 2 && siblingResults.length === 0 && !siblingSearching && (
              <p className="text-xs text-gray-500">
                No existing sibling found. Continue with manual entry or add second form.
              </p>
            )}

            {siblingResults.length > 0 && !selectedSibling && (
              <div className="rounded-lg border border-gray-200 divide-y max-h-56 overflow-y-auto">
                {siblingResults.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleSiblingSelect(row)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  >
                    <p className="text-sm font-medium text-gray-900">{row.student_name} (#{row.id})</p>
                    <p className="text-xs text-gray-500">
                      Parent: {row.parent_name || '-'} | Phone: {row.parent_phone || row.student_phone || '-'} | {row.classApplying?.name || 'Class/Discipline'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderSecondFormSection() {
    if (!secondFormEnabled) return null;
    const lockSharedFields = siblingEnabled;

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Second Inquiry Form</h3>
        <p className="text-xs text-gray-500 mb-4">
          {siblingEnabled
            ? 'Shared fields can be auto-filled from selected sibling. Enter unique student details below.'
            : 'Fill this second inquiry manually.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Student Full Name *</label>
            <input name="student_name" value={secondForm.student_name} onChange={handleSecondChange} required={secondFormEnabled} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isCollegeFlow ? 'Discipline *' : 'Class Applying For *'}</label>
            <select name="class_applying_id" value={secondForm.class_applying_id} onChange={handleSecondChange} required={secondFormEnabled} className={inputClass}>
              <option value="">{isSuperAdmin(user) && !secondForm.campus_id ? 'Select campus first' : (isCollegeFlow ? 'Select discipline' : 'Select class')}</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Date of Birth</label>
            <input name="date_of_birth" type="date" value={secondForm.date_of_birth} onChange={handleSecondChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Gender</label>
            <select name="gender" value={secondForm.gender} onChange={handleSecondChange} className={inputClass}>
              <option value="">Select</option>
              {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Student Phone</label>
            <input name="student_phone" value={secondForm.student_phone} onChange={handleSecondChange} className={inputClass} placeholder="03XX-XXXXXXX" />
          </div>
          <div>
            <label className={labelClass}>Parent Full Name *</label>
            <input name="parent_name" value={secondForm.parent_name} onChange={handleSecondChange} required={secondFormEnabled} className={inputClass} disabled={lockSharedFields} />
          </div>
          <div>
            <label className={labelClass}>Relationship *</label>
            <select name="relationship" value={secondForm.relationship} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields}>
              <option value="">Select</option>
              {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Parent Phone *</label>
            <input name="parent_phone" value={secondForm.parent_phone} onChange={handleSecondChange} required={secondFormEnabled} className={inputClass} placeholder="03XX-XXXXXXX" disabled={lockSharedFields} />
          </div>
          <div>
            <label className={labelClass}>WhatsApp Number</label>
            <input name="parent_whatsapp" value={secondForm.parent_whatsapp} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields} />
          </div>
          {!isCollegeFlow && (
            <>
              <div>
                <label className={labelClass}>Email</label>
                <input name="parent_email" value={secondForm.parent_email} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields} />
              </div>
              <div>
                <label className={labelClass}>Current School</label>
                <input name="current_school" value={secondForm.current_school} onChange={handleSecondChange} className={inputClass} />
              </div>
            </>
          )}
          {isCollegeFlow && (
            <>
              <div>
                <label className={labelClass}>Previous Institute</label>
                <input name="previous_institute" value={secondForm.previous_institute} onChange={handleSecondChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Major Subjects</label>
                <input name="previous_major_subjects" value={secondForm.previous_major_subjects} onChange={handleSecondChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Marks Obtained</label>
                <input type="number" min="0" name="previous_marks_obtained" value={secondForm.previous_marks_obtained} onChange={handleSecondChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Total Marks</label>
                <input type="number" min="0" name="previous_total_marks" value={secondForm.previous_total_marks} onChange={handleSecondChange} className={inputClass} />
              </div>
            </>
          )}
          <div>
            <label className={labelClass}>City</label>
            <input name="city" value={secondForm.city} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields} />
          </div>
          <div>
            <label className={labelClass}>Area</label>
            <input name="area" value={secondForm.area} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields} />
          </div>
          <div>
            <label className={labelClass}>Inquiry Date *</label>
            <input name="inquiry_date" type="date" value={secondForm.inquiry_date} onChange={handleSecondChange} max={today} required={secondFormEnabled} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>How They Heard About Us</label>
            <select name="source_id" value={secondForm.source_id} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields}>
              <option value="">Select source</option>
              {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Session Preference</label>
            <select name="session_preference" value={secondForm.session_preference} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields}>
              <option value="">Select</option>
              {SESSION_PREFERENCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {isAdminOrAbove(user) && (
            <div>
              <label className={labelClass}>Assign to Staff</label>
              <select name="assigned_staff_id" value={secondForm.assigned_staff_id} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields}>
                <option value="">Select staff</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelClass}>Priority</label>
            <select name="priority" value={secondForm.priority} onChange={handleSecondChange} className={inputClass} disabled={lockSharedFields}>
              <option value="">Select</option>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea name="notes" value={secondForm.notes} onChange={handleSecondChange} rows={2} className={inputClass} />
          </div>
        </div>
      </div>
    );
  }

  function renderAreaInput() {
    return (
      <div ref={areaRef} className="relative">
        <label className={labelClass}>Area</label>
        <input
          value={areaSearch}
          onChange={(e) => {
            if (!primarySharedLocked) handleAreaInput(e.target.value);
          }}
          onFocus={() => {
            if (!primarySharedLocked) setShowAreaDropdown(true);
          }}
          disabled={primarySharedLocked}
          className={inputClass}
          placeholder="Type to search or add..."
        />
        {!primarySharedLocked && showAreaDropdown && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filteredAreas.map(area => (
              <button
                key={area}
                type="button"
                onClick={() => handleAreaSelect(area)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 hover:text-primary-700"
              >
                {area}
              </button>
            ))}
            {areaSearch.trim() && !areaOptions.some(a => a.toLowerCase() === areaSearch.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={handleAddArea}
                className="w-full text-left px-3 py-2 text-sm text-primary-600 font-medium hover:bg-primary-50 border-t border-gray-100"
              >
                + Add "{areaSearch.trim()}"
              </button>
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
            <label className={labelClass}>{isCollegeFlow ? 'Discipline *' : 'Class Applying For *'}</label>
            <select name="class_applying_id" value={form.class_applying_id} onChange={handleChange} required className={inputClass}>
              <option value="">{isSuperAdmin(user) && !form.campus_id ? 'Select campus first' : (isCollegeFlow ? 'Select discipline' : 'Select class')}</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {isCollegeFlow ? (
            <>
              <div>
                <label className={labelClass}>Parent / Guardian Name *</label>
                <input name="parent_name" value={form.parent_name} onChange={handleChange} required className={inputClass} disabled={primarySharedLocked} />
              </div>
              <div>
                <label className={labelClass}>Relationship *</label>
                <select name="relationship" value={form.relationship} onChange={handleChange} className={inputClass} disabled={primarySharedLocked}>
                  <option value="">Select</option>
                  {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Student Phone</label>
                <input name="student_phone" value={form.student_phone} onChange={handleChange} className={inputClass} placeholder="03XX-XXXXXXX" />
              </div>
              <div>
                <label className={labelClass}>Parent / Guardian Phone</label>
                <input name="parent_phone" value={form.parent_phone} onChange={handleChange} className={inputClass} placeholder="03XX-XXXXXXX" disabled={primarySharedLocked} />
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <select name="priority" value={form.priority} onChange={handleChange} className={inputClass} disabled={primarySharedLocked}>
                  <option value="">Select</option>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Previous Institute</label>
                <input name="previous_institute" value={form.previous_institute} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Major Subjects</label>
                <input name="previous_major_subjects" value={form.previous_major_subjects} onChange={handleChange} className={inputClass} placeholder="e.g. Biology, Chemistry" />
              </div>
              <div>
                <label className={labelClass}>Marks Obtained</label>
                <input type="number" min="0" name="previous_marks_obtained" value={form.previous_marks_obtained} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Total Marks</label>
                <input type="number" min="0" name="previous_total_marks" value={form.previous_total_marks} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input name="city" value={form.city} onChange={handleChange} className={inputClass} disabled={primarySharedLocked} />
              </div>
              {renderAreaInput()}
            </>
          ) : (
            <>
              <div>
                <label className={labelClass}>Current School</label>
                <input name="current_school" value={form.current_school} onChange={handleChange} className={inputClass} />
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <label className={labelClass}>Special Needs / Notes</label>
            <textarea name="special_needs" value={form.special_needs} onChange={handleChange} rows={2} className={inputClass} />
          </div>
        </div>
      </div>
    );
  }

  function renderParentSection() {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Parent Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Parent Full Name *</label>
            <input name="parent_name" value={form.parent_name} onChange={handleChange} required className={inputClass} disabled={primarySharedLocked} />
          </div>
          <div>
            <label className={labelClass}>Relationship *</label>
            <select name="relationship" value={form.relationship} onChange={handleChange} className={inputClass} disabled={primarySharedLocked}>
              <option value="">Select</option>
              {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Parent Phone *</label>
            <input name="parent_phone" value={form.parent_phone} onChange={handleChange} required className={inputClass} placeholder="03XX-XXXXXXX" disabled={primarySharedLocked} />
          </div>
          <div>
            <label className={labelClass}>WhatsApp Number</label>
            <input name="parent_whatsapp" value={form.parent_whatsapp} onChange={handleChange} className={inputClass} placeholder="If different from phone" disabled={primarySharedLocked} />
          </div>

          {!isCollegeFlow && (
            <>
              <div>
                <label className={labelClass}>Email</label>
                <input name="parent_email" value={form.parent_email} onChange={handleChange} className={inputClass} placeholder="Optional" disabled={primarySharedLocked} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  <input name="city" value={form.city} onChange={handleChange} className={inputClass} disabled={primarySharedLocked} />
                </div>
                {renderAreaInput()}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${(!manualMode && secondFormEnabled) ? 'max-w-7xl' : 'max-w-4xl'} mx-auto`}>
      <PageHeader
        title={manualMode ? 'Manual Inquiry Entry' : 'New Inquiry'}
        subtitle={manualMode ? 'Manually add inquiry data to the pipeline' : 'Record a new admission inquiry'}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {renderCampusSelectorCard()}

        {isSuperAdminWithoutCampus ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Select a campus first. School tab shows the school form and college tab shows the college form.
          </div>
        ) : (
          <>
            {renderSiblingSection()}
            {!manualMode && secondFormEnabled ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                  {renderStudentSection()}
                  {!isCollegeFlow && renderParentSection()}
                </div>
                <div>
                  {renderSecondFormSection()}
                </div>
              </div>
            ) : (
              <>
                {renderStudentSection()}
                {!isCollegeFlow && renderParentSection()}
              </>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Inquiry Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Inquiry Date *</label>
                  <input name="inquiry_date" type="date" value={form.inquiry_date} onChange={handleChange} max={today} required className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>How They Heard About Us</label>
                  <select name="source_id" value={form.source_id} onChange={handleChange} className={inputClass} disabled={primarySharedLocked}>
                    <option value="">Select source</option>
                    {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {!isCollegeFlow && (
                  <div>
                    <label className={labelClass}>Referral Parent Name</label>
                    <input name="referral_parent_name" value={form.referral_parent_name} onChange={handleChange} className={inputClass} placeholder="If referred by existing parent" />
                  </div>
                )}
                {isCollegeFlow && !isSuperAdmin(user) && (
                  <div>
                    <label className={labelClass}>Campus *</label>
                    <select
                      name="campus_id"
                      value={form.campus_id}
                      onChange={handleChange}
                      required
                      disabled
                      className={inputClass}
                    >
                      <option value="">Select campus</option>
                      {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {isCollegeFlow && (
                  <>
                    <div>
                      <label className={labelClass}>Package</label>
                      <input
                        name="package_name"
                        value={form.package_name}
                        onChange={handleChange}
                        className={inputClass}
                        placeholder="e.g. Merit Scholarship"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Package Amount</label>
                      <input
                        type="number"
                        min="0"
                        name="package_amount"
                        value={form.package_amount}
                        onChange={handleChange}
                        className={inputClass}
                        placeholder="e.g. 50000"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Form Taken</label>
                      <select
                        name="inquiry_form_taken"
                        value={form.inquiry_form_taken}
                        onChange={handleChange}
                        className={inputClass}
                      >
                        <option value="">Select</option>
                        <option value="true">Taken</option>
                        <option value="false">Not Taken</option>
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label className={labelClass}>Session Preference</label>
                  <select name="session_preference" value={form.session_preference} onChange={handleChange} className={inputClass} disabled={primarySharedLocked}>
                    <option value="">Select</option>
                    {SESSION_PREFERENCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {isAdminOrAbove(user) && (
                  <div>
                    <label className={labelClass}>Assign to Staff</label>
                    <select name="assigned_staff_id" value={form.assigned_staff_id} onChange={handleChange} className={inputClass} disabled={primarySharedLocked}>
                      <option value="">Select staff</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                {!isCollegeFlow && (
                  <div>
                    <label className={labelClass}>Priority</label>
                    <select name="priority" value={form.priority} onChange={handleChange} className={inputClass} disabled={primarySharedLocked}>
                      <option value="">Select</option>
                      {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

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

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Additional Notes</h3>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className={inputClass} placeholder="Any additional notes about this inquiry..." />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => navigate('/inquiries')} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Inquiry'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
