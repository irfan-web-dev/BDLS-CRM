import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Save, Trash2 } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isAdminOrAbove, isSuperAdmin } from '../../utils/roleUtils';
import { PRIORITIES } from '../../utils/constants';
import PageHeader from '../../components/ui/PageHeader';
import CampusTypeTabs from '../../components/ui/CampusTypeTabs';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

function createEmptyRow() {
  return {
    student_name: '',
    parent_name: '',
    parent_phone: '',
    class_applying_id: '',
    source_id: '',
    priority: '',
    inquiry_date: '',
    assigned_staff_id: '',
    notes: '',
  };
}

function hasAnyRowData(row) {
  return Object.values(row).some((value) => String(value || '').trim() !== '');
}

function normalizePhoneInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

export default function InquiryManualCreate() {
  const { user } = useAuth();
  const [rows, setRows] = useState([createEmptyRow()]);
  const [campuses, setCampuses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sources, setSources] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [superAdminCampusType, setSuperAdminCampusType] = useState(user?.campus?.campus_type || 'school');
  const [selectedCampusId, setSelectedCampusId] = useState(user?.campus_id ? String(user.campus_id) : '');
  const today = new Date().toISOString().split('T')[0];

  const superAdminCampusesByType = campuses.filter(c => c.campus_type === superAdminCampusType);
  const isCollegeFlow = isSuperAdmin(user)
    ? superAdminCampusType === 'college'
    : user?.campus?.campus_type === 'college';

  useEffect(() => {
    loadBaseOptions();
  }, []);

  useEffect(() => {
    loadScopedOptions();
  }, [selectedCampusId, superAdminCampusType, user?.role, campuses.length]);

  useEffect(() => {
    if (!isSuperAdmin(user)) return;

    const scopedCampuses = campuses.filter(c => c.campus_type === superAdminCampusType);
    const currentCampusInScope = scopedCampuses.some(c => String(c.id) === String(selectedCampusId));
    if (!currentCampusInScope) {
      const autoCampus = scopedCampuses.length === 1 ? String(scopedCampuses[0].id) : '';
      setSelectedCampusId(autoCampus);
    }
  }, [campuses, selectedCampusId, superAdminCampusType, user]);

  async function loadBaseOptions() {
    setLoading(true);
    try {
      const campRes = await api.get('/campuses');
      setCampuses(campRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load campuses');
    } finally {
      setLoading(false);
    }
  }

  async function loadScopedOptions() {
    try {
      let classRes;
      let sourceRes;
      let staffRes;

      if (isSuperAdmin(user)) {
        if (!selectedCampusId) {
          setClasses([]);
          setSources([]);
          setStaff([]);
          return;
        }

        const selected = campuses.find(c => String(c.id) === String(selectedCampusId));
        const sourceParams = selected?.campus_type ? { campus_type: selected.campus_type } : {};

        [classRes, sourceRes, staffRes] = await Promise.all([
          api.get('/classes', { params: { campus_id: selectedCampusId } }),
          api.get('/settings/inquiry-sources', { params: sourceParams }),
          isAdminOrAbove(user)
            ? api.get('/users/staff/available', { params: { campus_id: selectedCampusId } })
            : Promise.resolve({ data: [] }),
        ]);
      } else {
        [classRes, sourceRes, staffRes] = await Promise.all([
          api.get('/classes'),
          api.get('/settings/inquiry-sources'),
          isAdminOrAbove(user)
            ? api.get('/users/staff/available')
            : Promise.resolve({ data: [] }),
        ]);
      }

      setClasses(classRes.data || []);
      setSources(sourceRes.data || []);
      setStaff(staffRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load class/source/staff options');
    }
  }

  function updateRow(index, field, value) {
    const normalizedValue = field === 'parent_phone' ? normalizePhoneInput(value) : value;
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, [field]: normalizedValue } : row)));
  }

  function addRow() {
    setRows(prev => [...prev, createEmptyRow()]);
  }

  function removeRow(index) {
    setRows(prev => {
      if (prev.length === 1) return [createEmptyRow()];
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleCampusTypeChange(nextType) {
    setSuperAdminCampusType(nextType);
    setSelectedCampusId('');
    setRows([createEmptyRow()]);
    setError('');
    setSuccess('');
  }

  function validateRow(row, rowNo) {
    if (!row.student_name || !row.class_applying_id) {
      return `Row ${rowNo}: Student name and class/discipline are required`;
    }
    if (!isCollegeFlow && (!row.parent_name || !row.parent_phone)) {
      return `Row ${rowNo}: Parent name and phone are required for school`;
    }
    if (row.parent_phone && !/^\d{11}$/.test(String(row.parent_phone))) {
      return `Row ${rowNo}: Phone must be exactly 11 digits`;
    }
    if (row.inquiry_date && row.inquiry_date > today) {
      return `Row ${rowNo}: Inquiry date cannot be in the future`;
    }
    return null;
  }

  function buildPayload(row) {
    const campusId = isSuperAdmin(user) ? Number.parseInt(selectedCampusId, 10) : user?.campus_id;

    return {
      student_name: row.student_name?.trim(),
      parent_name: row.parent_name?.trim() || null,
      parent_phone: row.parent_phone?.trim() || null,
      relationship: isCollegeFlow ? 'other' : 'father',
      class_applying_id: row.class_applying_id ? Number.parseInt(row.class_applying_id, 10) : null,
      source_id: row.source_id ? Number.parseInt(row.source_id, 10) : null,
      priority: row.priority || 'normal',
      inquiry_date: row.inquiry_date || null,
      assigned_staff_id: row.assigned_staff_id ? Number.parseInt(row.assigned_staff_id, 10) : null,
      notes: row.notes?.trim() || null,
      is_manual_entry: true,
      campus_id: campusId,
    };
  }

  async function saveSingleRow(index) {
    setError('');
    setSuccess('');

    const row = rows[index];
    if (!hasAnyRowData(row)) {
      setError(`Row ${index + 1} is empty`);
      return;
    }

    if (isSuperAdmin(user) && !selectedCampusId) {
      setError('Select campus first');
      return;
    }

    const validationError = validateRow(row, index + 1);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await api.post('/inquiries', buildPayload(row));
      setRows(prev => prev.map((r, i) => (i === index ? createEmptyRow() : r)));
      setSuccess(`Row ${index + 1} saved successfully`);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to save row ${index + 1}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveAllRows() {
    setError('');
    setSuccess('');

    if (isSuperAdmin(user) && !selectedCampusId) {
      setError('Select campus first');
      return;
    }

    const filledRows = rows
      .map((row, idx) => ({ row, rowNo: idx + 1 }))
      .filter(item => hasAnyRowData(item.row));

    if (filledRows.length === 0) {
      setError('No data to save');
      return;
    }

    for (const item of filledRows) {
      const validationError = validateRow(item.row, item.rowNo);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSaving(true);
    try {
      for (const item of filledRows) {
        await api.post('/inquiries', buildPayload(item.row));
      }
      setRows([createEmptyRow()]);
      setSuccess(`${filledRows.length} inquiry row(s) saved successfully`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save manual entries');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Manual Entry"
        subtitle="Inquiries style table with empty blocks for manual input"
        action={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Add Row
            </button>
            <button
              type="button"
              onClick={saveAllRows}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save All'}
            </button>
            <Link
              to="/inquiries"
              className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Inquiries
            </Link>
          </div>
        )}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {isSuperAdmin(user) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Manual Entry Context</h3>
          <CampusTypeTabs
            value={superAdminCampusType}
            onChange={handleCampusTypeChange}
            className="mb-3"
          />
          <div className="max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">Campus *</label>
            <select
              value={selectedCampusId}
              onChange={(e) => setSelectedCampusId(e.target.value)}
              className={inputClass}
            >
              <option value="">
                {superAdminCampusesByType.length === 0
                  ? `No ${superAdminCampusType} campus available`
                  : `Select ${superAdminCampusType} campus`}
              </option>
              {superAdminCampusesByType.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="overflow-x-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
              <th className="px-3 py-3">Student *</th>
              <th className="px-3 py-3">{isCollegeFlow ? 'Parent/Guardian' : 'Parent *'}</th>
              <th className="px-3 py-3">{isCollegeFlow ? 'Phone' : 'Phone *'}</th>
              <th className="px-3 py-3">{isCollegeFlow ? 'Discipline *' : 'Class *'}</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Inquiry Date</th>
              {isAdminOrAbove(user) && <th className="px-3 py-3">Assigned Staff</th>}
              <th className="px-3 py-3">Notes</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, index) => (
              <tr key={`manual-row-${index}`}>
                <td className="px-3 py-2">
                  <input
                    value={row.student_name}
                    onChange={(e) => updateRow(index, 'student_name', e.target.value)}
                    className={inputClass}
                    placeholder="Student name"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.parent_name}
                    onChange={(e) => updateRow(index, 'parent_name', e.target.value)}
                    className={inputClass}
                    placeholder={isCollegeFlow ? 'Parent/Guardian name' : 'Parent name'}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.parent_phone}
                    onChange={(e) => updateRow(index, 'parent_phone', e.target.value)}
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    pattern="[0-9]{11}"
                    className={inputClass}
                    placeholder="03XXXXXXXXX"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.class_applying_id}
                    onChange={(e) => updateRow(index, 'class_applying_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{isCollegeFlow ? 'Select discipline' : 'Select class'}</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.source_id}
                    onChange={(e) => updateRow(index, 'source_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select source</option>
                    {sources.map(source => (
                      <option key={source.id} value={source.id}>{source.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.priority}
                    onChange={(e) => updateRow(index, 'priority', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select</option>
                    {PRIORITIES.map(priority => (
                      <option key={priority.value} value={priority.value}>{priority.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={row.inquiry_date}
                    onChange={(e) => updateRow(index, 'inquiry_date', e.target.value)}
                    max={today}
                    className={inputClass}
                  />
                </td>
                {isAdminOrAbove(user) && (
                  <td className="px-3 py-2">
                    <select
                      value={row.assigned_staff_id}
                      onChange={(e) => updateRow(index, 'assigned_staff_id', e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select staff</option>
                      {staff.map(st => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="px-3 py-2">
                  <input
                    value={row.notes}
                    onChange={(e) => updateRow(index, 'notes', e.target.value)}
                    className={inputClass}
                    placeholder="Optional notes"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => saveSingleRow(index)}
                      disabled={saving}
                      className="rounded p-1.5 text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                      title="Save row"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      disabled={saving}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Fill any row manually and click row save icon or use Save All. Saved rows will appear in the Inquiries page.
      </p>
    </div>
  );
}
