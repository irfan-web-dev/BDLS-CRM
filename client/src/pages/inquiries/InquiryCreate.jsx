import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin, isAdminOrAbove } from '../../utils/roleUtils';
import {
  RELATIONSHIPS, GENDERS, SESSION_PREFERENCES, PRIORITIES, QUOTA_TYPES, LAHORE_AREAS,
} from '../../utils/constants';
import PageHeader from '../../components/ui/PageHeader';
import CampusTypeTabs from '../../components/ui/CampusTypeTabs';

function createInquiryFormState(today, campusId = '', manualMode = false, assignedStaffId = '') {
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
    session_preference: '', assigned_staff_id: assignedStaffId || '', priority: manualMode ? '' : 'normal',
    quota: '',
    notes: '', tag_ids: [],
  };
}

function createSiblingRowState(seed = {}) {
  return {
    student_name: '',
    date_of_birth: '',
    gender: '',
    student_phone: '',
    class_applying_id: '',
    current_school: '',
    previous_institute: '',
    previous_marks_obtained: '',
    previous_total_marks: '',
    previous_major_subjects: '',
    special_needs: '',
    inquiry_date: '',
    source_id: '',
    referral_parent_name: '',
    session_preference: '',
    assigned_staff_id: '',
    priority: '',
    quota: '',
    package_name: '',
    package_amount: '',
    inquiry_form_taken: '',
    notes: '',
    ...seed,
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
const INQUIRY_DRAFT_STORAGE_PREFIX = 'bdls_inquiry_create_draft_v1';
const INQUIRY_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PHONE_FIELDS = new Set(['parent_phone', 'parent_whatsapp', 'student_phone']);

function normalizePhoneInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function isValidPhoneInput(value) {
  return /^\d{11}$/.test(String(value || ''));
}

function getInquiryDraftStorageKey(userId, manualMode = false) {
  return `${INQUIRY_DRAFT_STORAGE_PREFIX}:${manualMode ? 'manual' : 'default'}:${String(userId || 'guest')}`;
}

function isSiblingRowEmpty(row = {}) {
  return Object.values(row).every((value) => String(value ?? '').trim() === '');
}

export default function InquiryCreate({ manualMode = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    setSuccess('');
    setForm(prev => ({ ...prev, area }));
    setAreaSearch(area);
    setShowAreaDropdown(false);
  }

  function handleAreaInput(value) {
    setSuccess('');
    setAreaSearch(value);
    setForm(prev => ({ ...prev, area: value }));
    setShowAreaDropdown(true);
  }

  function handleAddArea() {
    setSuccess('');
    if (areaSearch.trim() && !areaOptions.some(a => a.toLowerCase() === areaSearch.trim().toLowerCase())) {
      setAreaOptions(prev => [...prev, areaSearch.trim()].sort());
    }
    setForm(prev => ({ ...prev, area: areaSearch.trim() }));
    setShowAreaDropdown(false);
  }

  const today = new Date().toISOString().split('T')[0];
  const defaultAssignedStaffId = user?.id ? String(user.id) : '';

  const [form, setForm] = useState(() => createInquiryFormState(today, user?.campus_id || '', manualMode, defaultAssignedStaffId));
  const [siblingEnabled, setSiblingEnabled] = useState(false);
  const [selectedSibling, setSelectedSibling] = useState(null);
  const [siblingQuery, setSiblingQuery] = useState('');
  const [siblingResults, setSiblingResults] = useState([]);
  const [siblingSearching, setSiblingSearching] = useState(false);
  const [siblingRows, setSiblingRows] = useState([]);
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
      setSiblingEnabled(Boolean(parsed?.siblingEnabled));
      setSelectedSibling(parsed?.selectedSibling || null);
      setSiblingQuery(typeof parsed?.siblingQuery === 'string' ? parsed.siblingQuery : '');
      if (Array.isArray(parsed?.siblingRows)) {
        setSiblingRows(parsed.siblingRows.map((row) => ({
          ...createSiblingRowState(),
          ...row,
          student_phone: normalizePhoneInput(row?.student_phone || ''),
        })));
      }
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
          siblingEnabled,
          selectedSibling,
          siblingQuery,
          siblingRows,
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
    siblingEnabled,
    selectedSibling,
    siblingQuery,
    siblingRows,
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
    if (!isAdminOrAbove(user)) return;
    if (!Array.isArray(staff) || staff.length === 0) return;
    if (primarySharedLocked) return;

    const currentAssignedExists = staff.some(s => String(s.id) === String(form.assigned_staff_id));
    if (currentAssignedExists) return;

    const selfStaff = staff.find(s => String(s.id) === String(user?.id));
    const fallback = selfStaff || staff[0];
    if (!fallback) return;

    setForm(prev => ({ ...prev, assigned_staff_id: String(fallback.id) }));
  }, [staff, user, form.assigned_staff_id, primarySharedLocked]);

  useEffect(() => {
    if (form.class_applying_id && !classes.some(c => String(c.id) === String(form.class_applying_id))) {
      setForm(prev => ({ ...prev, class_applying_id: '' }));
    }
  }, [classes]);

  useEffect(() => {
    if (!isSuperAdmin(user)) return;

    const selectedCampusForType = campuses.find(c => String(c.id) === String(form.campus_id));
    if (selectedCampusForType?.campus_type && selectedCampusForType.campus_type !== superAdminCampusType) {
      setSuperAdminCampusType(selectedCampusForType.campus_type);
    }
  }, [campuses, form.campus_id, superAdminCampusType, user]);

  useEffect(() => {
    if (!isAdminOrAbove(user)) return;
    if (!form.assigned_staff_id && defaultAssignedStaffId) {
      setForm(prev => ({ ...prev, assigned_staff_id: defaultAssignedStaffId }));
    }
  }, [defaultAssignedStaffId, form.assigned_staff_id, user]);

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
    const normalizedValue = PHONE_FIELDS.has(name) ? normalizePhoneInput(value) : value;
    setSuccess('');
    if (isSuperAdmin(user) && name === 'campus_id') {
      const campus = campuses.find(c => String(c.id) === String(normalizedValue));
      if (campus?.campus_type && campus.campus_type !== superAdminCampusType) {
        setSuperAdminCampusType(campus.campus_type);
      }
      setSelectedSibling(null);
      setSiblingQuery('');
      setSiblingResults([]);
    }
    setForm(prev => ({ ...prev, [name]: normalizedValue }));
  }

  function applySiblingSharedFields(siblingData) {
    if (!siblingData) return;
    const patch = {};
    SIBLING_SHARED_FIELDS.forEach((key) => {
      if (siblingData[key] !== null && siblingData[key] !== undefined && siblingData[key] !== '') {
        const rawValue = String(siblingData[key]);
        patch[key] = PHONE_FIELDS.has(key) ? normalizePhoneInput(rawValue) : rawValue;
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
  }

  async function handleSiblingSelect(candidate) {
    try {
      setSuccess('');
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
      assigned_staff_id: defaultAssignedStaffId,
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
      const studentPhone = normalizePhoneInput(data.student_phone);
      const parentPhone = normalizePhoneInput(data.parent_phone);
      const parentWhatsapp = normalizePhoneInput(data.parent_whatsapp);
      data.parent_name = String(data.parent_name || '').trim() || studentName || 'Self';
      data.parent_phone = parentPhone || studentPhone || null;
      data.relationship = data.relationship || 'other';
      data.parent_whatsapp = isValidPhoneInput(parentWhatsapp) ? parentWhatsapp : null;
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
    setSuccess('');
    setLoading(true);
    // submitAction no longer needed — sibling auto-handled

    try {
      if (isSuperAdminWithoutCampus) {
        throw new Error('Please select campus first');
      }

      if (!form.student_name || !form.class_applying_id) {
        throw new Error('Please fill student name and class/discipline');
      }

      if (form.inquiry_date && form.inquiry_date > today) {
        throw new Error('Inquiry date cannot be in the future');
      }

      if (!isCollegeFlow) {
        if (!isValidPhoneInput(form.parent_phone)) {
          throw new Error('Parent phone must be exactly 11 digits');
        }
      } else if (form.parent_phone && !isValidPhoneInput(form.parent_phone)) {
        throw new Error('Parent phone must be exactly 11 digits');
      }
      if (form.student_phone && !isValidPhoneInput(form.student_phone)) {
        throw new Error('Student phone must be exactly 11 digits');
      }
      if (!isCollegeFlow && form.parent_whatsapp && !isValidPhoneInput(form.parent_whatsapp)) {
        throw new Error('WhatsApp number must be exactly 11 digits');
      }

      const filledSiblingRows = (siblingEnabled ? siblingRows : [])
        .filter((row) => !isSiblingRowEmpty(row));

      for (let i = 0; i < filledSiblingRows.length; i += 1) {
        const row = filledSiblingRows[i];
        if (!String(row.student_name || '').trim() || !String(row.class_applying_id || '').trim()) {
          throw new Error(`Please fill sibling ${i + 1} name and class/discipline`);
        }
        if (row.inquiry_date && row.inquiry_date > today) {
          throw new Error(`Sibling ${i + 1} inquiry date cannot be in the future`);
        }
        if (row.student_phone && !isValidPhoneInput(row.student_phone)) {
          throw new Error(`Sibling ${i + 1} phone must be exactly 11 digits`);
        }
      }

      const selectedSiblingId = selectedSibling?.id || null;
      const shouldLinkAsSibling = !manualMode && siblingEnabled && Boolean(selectedSiblingId);
      const primaryPayload = buildPayload(form, {
        linkAsSibling: shouldLinkAsSibling,
        siblingReferenceId: selectedSiblingId,
        includeTags: true,
      });
      const primaryRes = await api.post('/inquiries', primaryPayload);

      const createdInquiry = primaryRes?.data || {};
      const redirectId = createdInquiry?.id;

      // Create additional sibling inquiries if any
      if (!manualMode && siblingEnabled && filledSiblingRows.length > 0) {
        const siblingReferenceId = createdInquiry.id;
        let siblingCount = 0;
        for (const row of filledSiblingRows) {
          const siblingOverrides = Object.fromEntries(
            Object.entries(row).filter(([, value]) => value !== '' && value !== null && value !== undefined),
          );
          const siblingForm = { ...form, ...siblingOverrides };
          const siblingPayload = buildPayload(siblingForm, {
            linkAsSibling: true,
            siblingReferenceId,
            includeTags: true,
          });
          try {
            await api.post('/inquiries', siblingPayload);
            siblingCount++;
          } catch (sibErr) {
            console.error('Sibling creation error:', sibErr);
          }
        }
        if (siblingCount > 0) {
          setSuccess(`Inquiry + ${siblingCount} sibling(s) created successfully!`);
        }
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
          {isSingleCampus && superAdminCampusesByType.length === 1 ? (
            <div className={`${inputClass} bg-gray-50 text-gray-700`}>
              {superAdminCampusesByType[0].name}
            </div>
          ) : (
            <select
              name="campus_id"
              value={form.campus_id}
              onChange={handleChange}
              required
              disabled={superAdminCampusesByType.length === 0}
              className={inputClass}
            >
              <option value="">
                {superAdminCampusesByType.length === 0
                  ? `No ${superAdminCampusType} campus available`
                  : `Select ${superAdminCampusType} campus`}
              </option>
              {superAdminCampusesByType.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        {superAdminCampusesByType.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">
            No active campus found for this type. Add or enable a campus in settings first.
          </p>
        )}
      </div>
    );
  }

  function addSiblingRow() {
    setSiblingRows(prev => [...prev, createSiblingRowState({
      class_applying_id: form.class_applying_id || '',
      gender: form.gender || '',
      current_school: form.current_school || '',
      previous_institute: form.previous_institute || '',
      previous_marks_obtained: form.previous_marks_obtained || '',
      previous_total_marks: form.previous_total_marks || '',
      previous_major_subjects: form.previous_major_subjects || '',
      inquiry_date: form.inquiry_date || today,
      source_id: form.source_id || '',
      referral_parent_name: form.referral_parent_name || '',
      session_preference: form.session_preference || '',
      assigned_staff_id: form.assigned_staff_id || '',
      priority: form.priority || '',
      quota: form.quota || '',
      package_name: form.package_name || '',
      package_amount: form.package_amount || '',
      inquiry_form_taken: form.inquiry_form_taken || '',
      notes: form.notes || '',
    })]);
  }

  function updateSiblingRow(index, field, value) {
    setSiblingRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: field === 'student_phone' ? normalizePhoneInput(value) : value } : row));
  }

  function removeSiblingRow(index) {
    setSiblingRows(prev => prev.filter((_, i) => i !== index));
  }

  function renderSiblingSection() {
    if (manualMode) return null;
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={siblingEnabled}
            onChange={(e) => {
              setSuccess('');
              setSiblingEnabled(e.target.checked);
              if (!e.target.checked) {
                setSelectedSibling(null);
                setSiblingRows([]);
              } else if (siblingRows.length === 0) {
                setSiblingRows([createSiblingRowState()]);
              }
            }}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Add multiple students (siblings) — same parent, different students
        </label>
        {siblingEnabled && <p className="text-xs text-gray-500 mt-2">Add additional students below in the Student Information section. Parent details will be shared across all.</p>}
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
    const classOptions = classes.map(c => ({ value: String(c.id), label: c.name }));
    const additionalSiblingRows = siblingRows;

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Student Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Student Full Name *</label>
            <input
              name="student_name"
              value={form.student_name}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Date of Birth</label>
            <input
              name="date_of_birth"
              value={form.date_of_birth}
              onChange={handleChange}
              type="date"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Gender</label>
            <select name="gender" value={form.gender} onChange={handleChange} className={inputClass}>
              <option value="">Select</option>
              {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{isCollegeFlow ? 'Discipline *' : 'Class Applying For *'}</label>
            <select
              name="class_applying_id"
              value={form.class_applying_id}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="">{isCollegeFlow ? 'Select discipline' : 'Select class'}</option>
              {classOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                <input
                  name="student_phone"
                  value={form.student_phone}
                  onChange={handleChange}
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  pattern="[0-9]{11}"
                  className={inputClass}
                  placeholder="03XX-XXXXXXX"
                />
              </div>
              <div>
                <label className={labelClass}>Parent / Guardian Phone</label>
                <input
                  name="parent_phone"
                  value={form.parent_phone}
                  onChange={handleChange}
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  pattern="[0-9]{11}"
                  className={inputClass}
                  placeholder="03XX-XXXXXXX"
                  disabled={primarySharedLocked}
                />
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
                <input
                  name="previous_institute"
                  value={form.previous_institute}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Major Subjects</label>
                <input
                  name="previous_major_subjects"
                  value={form.previous_major_subjects}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="e.g. Biology, Chemistry"
                />
              </div>
              <div>
                <label className={labelClass}>Marks Obtained</label>
                <input
                  name="previous_marks_obtained"
                  value={form.previous_marks_obtained}
                  onChange={handleChange}
                  type="number"
                  min={0}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Total Marks</label>
                <input
                  name="previous_total_marks"
                  value={form.previous_total_marks}
                  onChange={handleChange}
                  type="number"
                  min={0}
                  className={inputClass}
                />
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
                <label className={labelClass}>Student Phone</label>
                <input
                  name="student_phone"
                  value={form.student_phone}
                  onChange={handleChange}
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  pattern="[0-9]{11}"
                  className={inputClass}
                  placeholder="03XX-XXXXXXX"
                />
              </div>
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

        {siblingEnabled && (
          <div className="mt-6 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Additional Siblings</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Add as many siblings as needed. Shared parent information will stay same.
                </p>
              </div>
              <button
                type="button"
                onClick={addSiblingRow}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-primary-200 text-primary-700 hover:bg-primary-50"
              >
                + Add Sibling
              </button>
            </div>

            {additionalSiblingRows.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-600">
                No additional sibling added yet. Click <span className="font-medium">+ Add Sibling</span>.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {additionalSiblingRows.map((row, index) => (
                  <div key={`sibling-row-${index}`} className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-sm font-semibold text-gray-900">Sibling {index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeSiblingRow(index)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Student Full Name *</label>
                        <input
                          value={row.student_name}
                          onChange={(e) => updateSiblingRow(index, 'student_name', e.target.value)}
                          className={inputClass}
                          placeholder="Enter sibling name"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Date of Birth</label>
                        <input
                          value={row.date_of_birth}
                          onChange={(e) => updateSiblingRow(index, 'date_of_birth', e.target.value)}
                          type="date"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Gender</label>
                        <select
                          value={row.gender}
                          onChange={(e) => updateSiblingRow(index, 'gender', e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select</option>
                          {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>{isCollegeFlow ? 'Discipline *' : 'Class Applying For *'}</label>
                        <select
                          value={row.class_applying_id}
                          onChange={(e) => updateSiblingRow(index, 'class_applying_id', e.target.value)}
                          className={inputClass}
                        >
                          <option value="">{isCollegeFlow ? 'Select discipline' : 'Select class'}</option>
                          {classOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Student Phone</label>
                        <input
                          value={row.student_phone}
                          onChange={(e) => updateSiblingRow(index, 'student_phone', e.target.value)}
                          type="tel"
                          inputMode="numeric"
                          maxLength={11}
                          pattern="[0-9]{11}"
                          className={inputClass}
                          placeholder="03XX-XXXXXXX"
                        />
                      </div>
                      {isCollegeFlow ? (
                        <>
                          <div>
                            <label className={labelClass}>Previous Institute</label>
                            <input
                              value={row.previous_institute}
                              onChange={(e) => updateSiblingRow(index, 'previous_institute', e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Major Subjects</label>
                            <input
                              value={row.previous_major_subjects}
                              onChange={(e) => updateSiblingRow(index, 'previous_major_subjects', e.target.value)}
                              className={inputClass}
                              placeholder="e.g. Biology, Chemistry"
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Marks Obtained</label>
                            <input
                              value={row.previous_marks_obtained}
                              onChange={(e) => updateSiblingRow(index, 'previous_marks_obtained', e.target.value)}
                              type="number"
                              min={0}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Total Marks</label>
                            <input
                              value={row.previous_total_marks}
                              onChange={(e) => updateSiblingRow(index, 'previous_total_marks', e.target.value)}
                              type="number"
                              min={0}
                              className={inputClass}
                            />
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className={labelClass}>Current School</label>
                          <input
                            value={row.current_school}
                            onChange={(e) => updateSiblingRow(index, 'current_school', e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <label className={labelClass}>Special Needs / Notes</label>
                        <textarea
                          value={row.special_needs}
                          onChange={(e) => updateSiblingRow(index, 'special_needs', e.target.value)}
                          rows={2}
                          className={inputClass}
                        />
                      </div>

                      <div className="sm:col-span-2 border-t border-gray-200 pt-3 mt-1">
                        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                          Inquiry Details (Sibling)
                        </h5>
                      </div>

                      <div>
                        <label className={labelClass}>Inquiry Date</label>
                        <input
                          value={row.inquiry_date}
                          onChange={(e) => updateSiblingRow(index, 'inquiry_date', e.target.value)}
                          type="date"
                          max={today}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>How They Heard About Us</label>
                        <select
                          value={row.source_id}
                          onChange={(e) => updateSiblingRow(index, 'source_id', e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select source</option>
                          {sources.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                        </select>
                      </div>
                      {!isCollegeFlow && (
                        <div>
                          <label className={labelClass}>Referral Parent Name</label>
                          <input
                            value={row.referral_parent_name}
                            onChange={(e) => updateSiblingRow(index, 'referral_parent_name', e.target.value)}
                            className={inputClass}
                            placeholder="If referred by existing parent"
                          />
                        </div>
                      )}
                      <div>
                        <label className={labelClass}>Session Preference</label>
                        <select
                          value={row.session_preference}
                          onChange={(e) => updateSiblingRow(index, 'session_preference', e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select</option>
                          {SESSION_PREFERENCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      {isAdminOrAbove(user) && (
                        <div>
                          <label className={labelClass}>Assign to Staff</label>
                          <select
                            value={row.assigned_staff_id}
                            onChange={(e) => updateSiblingRow(index, 'assigned_staff_id', e.target.value)}
                            className={inputClass}
                          >
                            <option value="">Select staff</option>
                            {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={labelClass}>Priority</label>
                        <select
                          value={row.priority}
                          onChange={(e) => updateSiblingRow(index, 'priority', e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select</option>
                          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>

                      {isCollegeFlow && (
                        <>
                          <div>
                            <label className={labelClass}>Package</label>
                            <input
                              value={row.package_name}
                              onChange={(e) => updateSiblingRow(index, 'package_name', e.target.value)}
                              className={inputClass}
                              placeholder="e.g. Merit Scholarship"
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Package Amount</label>
                            <input
                              value={row.package_amount}
                              onChange={(e) => updateSiblingRow(index, 'package_amount', e.target.value)}
                              type="number"
                              min={0}
                              className={inputClass}
                              placeholder="e.g. 50000"
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Form Taken</label>
                            <select
                              value={row.inquiry_form_taken}
                              onChange={(e) => updateSiblingRow(index, 'inquiry_form_taken', e.target.value)}
                              className={inputClass}
                            >
                              <option value="">Select</option>
                              <option value="true">Taken</option>
                              <option value="false">Not Taken</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Quota</label>
                            <select
                              value={row.quota}
                              onChange={(e) => updateSiblingRow(index, 'quota', e.target.value)}
                              className={inputClass}
                            >
                              <option value="">Select quota</option>
                              {QUOTA_TYPES.map((quotaType) => (
                                <option key={quotaType.value} value={quotaType.value}>{quotaType.label}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      <div className="sm:col-span-2">
                        <label className={labelClass}>Additional Notes</label>
                        <textarea
                          value={row.notes}
                          onChange={(e) => updateSiblingRow(index, 'notes', e.target.value)}
                          rows={2}
                          className={inputClass}
                          placeholder="Any additional notes about this sibling inquiry..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
            <input
              name="parent_phone"
              value={form.parent_phone}
              onChange={handleChange}
              type="tel"
              inputMode="numeric"
              maxLength={11}
              pattern="[0-9]{11}"
              required
              className={inputClass}
              placeholder="03XX-XXXXXXX"
              disabled={primarySharedLocked}
            />
          </div>
          <div>
            <label className={labelClass}>WhatsApp Number</label>
            <input
              name="parent_whatsapp"
              value={form.parent_whatsapp}
              onChange={handleChange}
              type="tel"
              inputMode="numeric"
              maxLength={11}
              pattern="[0-9]{11}"
              className={inputClass}
              placeholder="If different from phone"
              disabled={primarySharedLocked}
            />
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
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title={manualMode ? 'Manual Inquiry Entry' : 'New Inquiry'}
        subtitle={manualMode ? 'Manually add inquiry data to the pipeline' : 'Record a new admission inquiry'}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{success}</div>
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
            {renderStudentSection()}
            {!isCollegeFlow && renderParentSection()}

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
                {!isSuperAdmin(user) && (
                  <div>
                    <label className={labelClass}>Campus *</label>
                    <div className={`${inputClass} bg-gray-50 text-gray-700`}>
                      {selectedCampus?.name || user?.campus?.name || 'Campus'}
                    </div>
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
                {isCollegeFlow && (
                  <div>
                    <label className={labelClass}>Quota</label>
                    <select name="quota" value={form.quota} onChange={handleChange} className={inputClass}>
                      <option value="">Select quota</option>
                      {QUOTA_TYPES.map((quotaType) => (
                        <option key={quotaType.value} value={quotaType.value}>{quotaType.label}</option>
                      ))}
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
              <button type="submit" value="view_detail" disabled={loading} className="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Inquiry'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
